---
title: MygramDB Linux CI Testing with Docker
description: Check MygramDB Linux compatibility with Docker-based build, lint, format, and default-tier tests, using a separate checkout from native builds.
head:
  - - meta
    - name: keywords
      content: MygramDB Linux testing, Docker CI, GitHub Actions, clang-tidy, ccache, Ubuntu 22.04, cross-platform build
---

# Linux CI Testing with Docker

## Overview

::: info When to read this page
This is for developers on macOS who want to catch Linux or GitHub Actions build failures before pushing. It is not the installation procedure for using MygramDB.
:::

Use the Docker development image to find Linux-specific header and compiler problems before running CI.

## Problem

When developing on macOS, certain issues only appear in Linux environments:
- **Missing header includes** (e.g., `<cstdint>`, `<climits>`)
- **Compiler differences** (Clang vs GCC behavior)
- **Library version differences**
- **Path handling differences**

These issues often only get detected in CI, leading to failed builds after pushing.

## Solution

The development image uses Ubuntu 22.04 with the build dependencies. GitHub Actions uses `ubuntu-latest` and enables `MYGRAMDB_PORTABLE_BUILD`; the Docker target does not enable that option. These checks complement CI rather than reproduce its complete environment.

## Quick Start

Run these commands in a Linux-only working copy, separate from the native build. See [Recommended Workflow](#recommended-workflow) for the checkout procedure.

### 1. Run Full CI Checks (Recommended before git push)

```bash
make docker-ci-check
```

This runs the local Linux checks:
1. Code formatting check
2. Debug build with coverage, ICU, and MySQL enabled
3. Clang-tidy linting
4. Default-tier tests, excluding `SLOW` and `LOAD`

For all CTest tiers, run `make test-all` inside the Linux shell. Database-backed E2E suites are separate; see [Development](/docs/development#end-to-end-suites).

### 2. Run Individual Steps

```bash
# Build only
make docker-build-linux

# Test only
make docker-test-linux

# Lint only
make docker-lint-linux

# Format check only
make docker-format-check-linux
```

### 3. Interactive Development Shell

```bash
make docker-dev-shell
```

This gives you an interactive bash shell inside the Linux container where you can run commands manually:

```bash
# Inside the container
make build
make test
make lint
./build/bin/mygramdb --help
```

## How It Works

### Docker Image: `support/dev/Dockerfile`

The `support/dev/Dockerfile` provides this local Linux environment:

- **Base**: Ubuntu 22.04
- **Compiler**: GCC
- **Tools**: clang-format-18, clang-tidy-18, ccache
- **Dependencies**: libmysqlclient-dev, libicu-dev, etc.

### Makefile Targets

The Makefile provides these Linux development targets:

| Target | Description |
|--------|-------------|
| `docker-dev-build` | Build the Linux Docker image (auto-run by other targets) |
| `docker-dev-shell` | Interactive shell in Linux container |
| `docker-build-linux` | Build project in Linux (mimics CI) |
| `docker-test-linux` | Run tests in Linux |
| `docker-lint-linux` | Run clang-tidy in Linux |
| `docker-format-check-linux` | Check formatting in Linux |
| `docker-clean-linux` | Clean build in Linux |
| `docker-ci-check` | Run local formatting, build, lint, and default-tier tests |

## Recommended Workflow

Use a separate checkout for Docker. The targets mount the repository and configure `build/`; a macOS CMake cache cannot be reused in Linux. Do not run native and container builds, or two Docker build targets, concurrently in the same checkout.

A local clone includes committed changes only. Commit the changes you intend to check before creating it, or copy those changes into the separate checkout:

```bash
git clone --no-hardlinks . ../mygram-db-linux
cd ../mygram-db-linux
make docker-ci-check
```

### Option 2: Continuous Testing

Run the dependent steps sequentially in the Linux checkout:

```bash
make docker-build-linux
make docker-test-linux
```

`docker-test-linux` already depends on the build target. The interactive shell can also run `make build`, `make test`, and `make lint` from the repository root.

### Option 3: Debug Specific CI Failures

```bash
make docker-dev-shell

# Inside the container, from the repository root
cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug -DBUILD_TESTS=ON -DENABLE_COVERAGE=ON -DUSE_ICU=ON -DUSE_MYSQL=ON
cmake --build build -j$(nproc)
make lint
exit
```

Match the failing CI job's options when reproducing it; the defaults above are the development container's settings.

## Performance Tips

### 1. Image Caching

The Docker image is cached after the first build. Subsequent runs are much faster:

The first run installs dependencies and compiles the project. Later runs reuse the image and build cache; duration depends on the host and the files changed.

### 2. Incremental Builds

The `build/` directory is mounted as a volume, so builds are incremental:

```bash
# First build: full compilation
make docker-build-linux

# Second build: only changed files
make docker-build-linux  # Much faster!
```

### 3. Parallel Testing

Tests run in parallel using all available CPU cores:

```bash
make docker-test-linux  # Uses $(nproc) cores
```

### 4. ccache

::: info What is ccache?
**ccache** caches compilation results and reuses them. Files whose headers and compile options have not changed are not recompiled, which makes repeat builds much faster.
:::

The container uses ccache, but the default targets do not mount a persistent ccache volume. The cache is reusable within one container and is lost when that container is removed with `--rm`. Compiled files under the working copy's `build/` directory remain available for incremental builds.

## Troubleshooting

### Issue: "permission denied" errors

The container runs as root, but files are owned by your user. If you encounter permission issues:

```bash
# Clean build directory
make docker-clean-linux

# Or manually
sudo rm -rf build/
```

### Issue: Docker image is outdated

If dependencies changed (e.g., new LLVM version, new libraries):

```bash
# Rebuild the development image
docker build -f support/dev/Dockerfile -t mygramdb-dev:latest --no-cache .
```

### Issue: Disk space

Docker images can consume disk space. To clean up:

```bash
# Remove development image
docker rmi mygramdb-dev:latest

# Clean all unused Docker resources
docker system prune -a
```

### Issue: Slow builds

If builds are slow even with caching:

```bash
# Check ccache stats
make docker-dev-shell
ccache --show-stats

# Increase ccache size if needed (inside container)
ccache --set-config=max_size=1G
```

## CI Environment Details

The following describes `support/dev/Dockerfile`, not the current GitHub-hosted runner. Check [the workflow](https://github.com/libraz/mygram-db/blob/main/.github/workflows/ci.yml) for CI's OS and build options:

| Component | Version |
|-----------|---------|
| OS | Ubuntu 22.04 |
| Compiler | GCC (default) + Clang 18 |
| CMake | Latest from apt |
| clang-format | 18 |
| clang-tidy | 18 |
| MySQL Client | libmysqlclient-dev |
| ICU | libicu-dev |
| Readline | libreadline-dev |
| Coverage | lcov |
| Cache | ccache |

## Integration with Git Hooks

You can add a pre-push hook to automatically run CI checks:

```bash
# .git/hooks/pre-push
#!/bin/bash
echo "Running CI checks before push..."
make docker-ci-check
if [ $? -ne 0 ]; then
    echo "CI checks failed. Push aborted."
    exit 1
fi
```

```bash
chmod +x .git/hooks/pre-push
```

## Advanced Usage

### Custom CMake Options

```bash
# Build with different options
docker run --rm -v "$PWD:/workspace" -w /workspace mygramdb-dev:latest \
    bash -c 'cmake -S . -B build-asan -DCMAKE_BUILD_TYPE=Debug -DENABLE_ASAN=ON && \
    cmake --build build-asan -j$(nproc)'
```

### Run Specific Tests

```bash
docker run --rm -v "$PWD:/workspace" -w /workspace mygramdb-dev:latest \
    bash -c 'ctest --test-dir build -R "MyTest.*" --verbose'
```

### Generate Coverage Report

```bash
make docker-dev-shell
# Inside container
cd build
make coverage
# View coverage/html/index.html
```

## Comparison: macOS vs Linux Testing

| Aspect | macOS (`make build`) | Linux (`make docker-build-linux`) |
|--------|----------------------|-----------------------------------|
| Speed | Fast (native) | Slower (containerized) |
| Environment | Your macOS | Development image (Ubuntu 22.04) |
| Use case | Quick iteration | Pre-push verification |
| Compiler | Clang (macOS) | GCC (Linux) |
| Headers | More permissive | Stricter (catches missing includes) |

**Recommendation**: Use both!
- macOS for rapid development
- Linux for pre-push verification

## See Also

- [Development Guide](/docs/development)
- [GitHub Actions CI Workflow](https://github.com/libraz/mygram-db/blob/main/.github/workflows/ci.yml)
