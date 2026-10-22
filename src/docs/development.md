---
title: MygramDB Development Setup - Build, Lint, and Tooling
description: Set up the MygramDB development environment. Install CMake, LLVM 18, MySQL client, and ICU; configure VS Code linting; Google C++ Style conventions; build, format, and test workflow.
head:
  - - meta
    - name: keywords
      content: MygramDB development, C++ build setup, clang-format 18, clang-tidy, Google C++ Style, VS Code clangd, CMake build
---

# Development Environment Setup

Set up the tools to build, format, analyze, and test MygramDB's C++ code.

::: info Who this page is for
This page is for developers building MygramDB itself or changing its C++ code. If you only want to use MygramDB, start with [Installation](/docs/installation) and [Configuration](/docs/configuration).
:::

## Prerequisites

Before starting development, install the required tools.

### macOS

```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install development tools
brew install cmake
brew install llvm@18  # Version 18 required for consistent formatting
brew install mysql-client@8.4
brew install icu4c

# Create symlinks to use LLVM 18 by default
# IMPORTANT: This ensures consistent code formatting with CI
ln -sf "$(brew --prefix llvm@18)/bin/clang-format" "$(brew --prefix)/bin/clang-format"
ln -sf "$(brew --prefix llvm@18)/bin/clang-tidy" "$(brew --prefix)/bin/clang-tidy"
ln -sf "$(brew --prefix llvm@18)/bin/clangd" "$(brew --prefix)/bin/clangd"
```

### Linux (Ubuntu/Debian)

```bash
# Update package list
sudo apt-get update

# Install basic development tools
sudo apt-get install -y \
  cmake \
  build-essential \
  libmysqlclient-dev \
  libicu-dev \
  pkg-config \
  wget \
  lsb-release \
  software-properties-common \
  gnupg

# Install LLVM/Clang 18 (required for consistent formatting)
# IMPORTANT: Version 18 is required to match CI environment
wget https://apt.llvm.org/llvm.sh
chmod +x llvm.sh
sudo ./llvm.sh 18

# Install clang-format, clang-tidy, and clangd version 18
sudo apt-get install -y clang-format-18 clang-tidy-18 clangd-18

# Set version 18 as default
sudo update-alternatives --install /usr/bin/clang-format clang-format /usr/bin/clang-format-18 100
sudo update-alternatives --install /usr/bin/clang-tidy clang-tidy /usr/bin/clang-tidy-18 100
sudo update-alternatives --install /usr/bin/clangd clangd /usr/bin/clangd-18 100
```

## Verify Installation

::: info clang-format vs clang-tidy
**clang-format** rewrites C++ source layout automatically; **clang-tidy** is a static analyzer that flags unsafe constructs and style violations. Formatting output differs between versions, so this project pins both to version 18 — the same version CI uses.
:::

```bash
# Check if tools are installed
cmake --version        # Should show 3.16+
clang-format --version # Should show 18.x.x
clang-tidy --version   # Should show 18.x.x
clangd --version       # Should show 18.x.x (optional, for LSP)
```

**Why version 18?** Different versions of clang-format produce different formatting results. We standardize on version 18 to ensure consistency between local development and CI.

## Build Project

```bash
# Build the project (generates compile_commands.json)
make

# Run tests
make test

# Format code
make format
```

After building, `compile_commands.json` will be generated in the `build/` directory. This file is required for clangd and clang-tidy to work correctly.

## VS Code Setup

### Required Extensions

Open VS Code and install the recommended extensions:

1. **C/C++** (`ms-vscode.cpptools`) - IntelliSense and debugging
2. **CMake Tools** (`ms-vscode.cmake-tools`) - CMake integration
3. **Error Lens** (`usernamehw.errorlens`) - Inline error display (like ESLint)

### Optional Extension (for best experience)

4. **clangd** (`llvm-vs-code-extensions.vscode-clangd`) - Fast LSP for real-time linting

## Enable Linting

After building the project, enable linting in VS Code:

### Option A: Using C/C++ Extension (Simpler)

Edit `.vscode/settings.json` and change:

```json
{
  "C_Cpp.codeAnalysis.clangTidy.enabled": true,
  "C_Cpp.codeAnalysis.clangTidy.useBuildPath": true,
  "C_Cpp.codeAnalysis.clangTidy.path": "/absolute/path/to/llvm18/bin/clang-tidy",
  "C_Cpp.clang_format_path": "/absolute/path/to/llvm18/bin/clang-format"
}
```

Replace the placeholder paths with the output of `brew --prefix llvm@18` plus `/bin/clang-tidy` or `/bin/clang-format` on macOS. On Linux use `/usr/bin/clang-tidy-18` and `/usr/bin/clang-format-18`. The repository's `/opt/homebrew/opt/llvm/bin` paths may select a different LLVM installation.

Reload VS Code window (Cmd/Ctrl + Shift + P → "Developer: Reload Window")

### Option B: Using clangd (Faster, ESLint-like experience)

1. Make sure clangd extension is installed
2. Enable the clangd section in `.vscode/settings.json` and set `clangd.path` to the output of `brew --prefix llvm@18` plus `/bin/clangd`, or `/usr/bin/clangd-18` on Linux.
3. Comment out the C/C++ Extension section (OPTION 2)
4. Reload VS Code window

## Features Enabled

After setup, you'll have:

- **Real-time linting** - clang-tidy checks as you type
- **Auto-formatting** - Code formatted on save (Google C++ Style)
- **Inline errors** - Errors displayed inline with Error Lens
- **Code completion** - IntelliSense for C++17
- **Quick fixes** - Auto-fix available issues on save

## Coding Standards

This project follows the **Google C++ Style Guide** with specific configurations:

### Code Formatting

- Base style: Google
- Column limit: 120 characters
- Indentation: 2 spaces (no tabs)
- Pointer alignment: Left (`int* ptr`, not `int *ptr`)
- Braces: Attach style (`if (x) {`)

Run formatting tools:

```bash
make format        # Auto-format all code
make format-check  # Check formatting (CI mode - fails if not formatted)
make lint          # Run clang-tidy static analysis (takes time)
```

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Classes | CamelCase | `DocumentStore`, `Index` |
| Functions | CamelCase | `AddDocument()`, `GetPrimaryKey()` |
| Variables | lower_case | `doc_id`, `primary_key` |
| Constants | kCamelCase | `kMaxConnections`, `kDefaultPort` |
| Member variables | lower_case_ | `next_doc_id_`, `term_postings_` |
| Namespaces | lower_case | `mygramdb::index` |

### Documentation Comments

Use Doxygen-style comments for all public APIs:

```cpp
/**
 * @brief Brief description of what the function does
 *
 * @param param_name Description of parameter
 * @return Description of return value
 */
ReturnType FunctionName(Type param_name);
```

### Suppressing clang-tidy Warnings

When necessary, suppress warnings using NOLINT comments:

```cpp
// Good: Use NOLINTNEXTLINE before the problematic line
// NOLINTNEXTLINE(cppcoreguidelines-pro-type-vararg)
snprintf(buf, sizeof(buf), "%d", value);

// Good: Inline NOLINT (keep comments within 120 chars)
char buf[32];  // NOLINT(cppcoreguidelines-avoid-c-arrays)

// Bad: Multi-line NOLINT (not recognized by clang-tidy)
snprintf(buf, sizeof(buf), "%d",
         value);  // NOLINT(cppcoreguidelines-pro-type-vararg)

// Good: File-level suppression for pervasive issues
// NOLINTBEGIN(cppcoreguidelines-pro-bounds-pointer-arithmetic)
// ... code requiring pointer arithmetic ...
// NOLINTEND(cppcoreguidelines-pro-bounds-pointer-arithmetic)
```

**Important:** NOLINT comments must be on a single line. Multi-line comments are not recognized.

## Running Tests

The default target excludes tests labelled `SLOW` and `LOAD`.

```bash
# Default unit and integration suite
make test

# Include SLOW and LOAD tests
make test-all

# Opt-in tests that start Docker-backed MySQL
make test-mysql
make test-large-dump
```

### End-to-end suites

```bash
# Default MySQL 8.4 suite
make e2e-test

# MySQL 8.4/9.7 and MariaDB 10.11/11.8/12.3 matrix
make e2e-matrix
```

See the [E2E test README](https://github.com/libraz/mygram-db/tree/develop/e2e)
for marker selection and the focused MariaDB replication runner.

### Local sanitizers and fuzzing

Sanitizer builds and the fuzz harness are explicit local checks. They do not add
CI jobs or make the fuzz harness a CTest target.

```bash
# Replace ENABLE_ASAN with ENABLE_TSAN or ENABLE_UBSAN as needed.
cmake -S . -B build-asan -DCMAKE_BUILD_TYPE=Debug -DENABLE_ASAN=ON
cmake --build build-asan -j
ctest --test-dir build-asan -L CONCURRENCY -LE LOAD --output-on-failure

# Standalone randomized parser and dump-header harness. This driver works with
# any supported compiler and uses the iteration count as its input.
cmake -S . -B build-fuzz -DCMAKE_BUILD_TYPE=Debug -DBUILD_FUZZERS=ON -DFUZZER_ENGINE=standalone
cmake --build build-fuzz --target binary_input_fuzz -j
./build-fuzz/bin/binary_input_fuzz 100000

# Coverage-guided libFuzzer build. Use a Clang toolchain that provides libFuzzer.
cmake -S . -B build-libfuzzer -DCMAKE_BUILD_TYPE=Debug -DBUILD_FUZZERS=ON -DFUZZER_ENGINE=libfuzzer
cmake --build build-libfuzzer --target binary_input_fuzz -j
./build-libfuzzer/bin/binary_input_fuzz -runs=100000
```

## Troubleshooting

### "clangd: Unable to find compile_commands.json"

**Solution:** Run `make` to build the project first.

### "clang-tidy: error while loading shared libraries"

**Solution:** Install clang-tidy version 18:

```bash
# macOS
brew install llvm@18
ln -sf "$(brew --prefix llvm@18)/bin/clang-tidy" "$(brew --prefix)/bin/clang-tidy"

# Linux
wget https://apt.llvm.org/llvm.sh
chmod +x llvm.sh
sudo ./llvm.sh 18
sudo apt-get install -y clang-tidy-18
sudo update-alternatives --install /usr/bin/clang-tidy clang-tidy /usr/bin/clang-tidy-18 100
```

### "Many errors in VS Code after opening project"

**Solution:**
1. Make sure project is built: `make`
2. Check if `build/compile_commands.json` exists
3. Reload VS Code window: Cmd/Ctrl + Shift + P → "Developer: Reload Window"

### "clang-format not working"

**Solution:** Install clang-format version 18:

```bash
# macOS
brew install llvm@18
ln -sf "$(brew --prefix llvm@18)/bin/clang-format" "$(brew --prefix)/bin/clang-format"

# Linux
wget https://apt.llvm.org/llvm.sh
chmod +x llvm.sh
sudo ./llvm.sh 18
sudo apt-get install -y clang-format-18
sudo update-alternatives --install /usr/bin/clang-format clang-format /usr/bin/clang-format-18 100
```

Verify the version:

```bash
clang-format --version  # Should show 18.x.x
```

## Quick Start Checklist

- [ ] Install cmake
- [ ] Install LLVM 18 (clang-format-18, clang-tidy-18, clangd-18)
- [ ] Verify clang-format --version shows 18.x.x
- [ ] Install MySQL client library
- [ ] Install ICU library
- [ ] Run `make` to build project
- [ ] Verify `build/compile_commands.json` exists
- [ ] Install VS Code extensions (C/C++, CMake Tools, Error Lens)
- [ ] Enable clang-tidy in `.vscode/settings.json`
- [ ] Reload VS Code window

## Next Steps

Once setup is complete:

1. Open any `.cpp` or `.h` file
2. Make a small change (e.g., add extra spaces)
3. Save the file → Auto-formatting should work
4. Try adding code that violates style guide → Should see warnings

## Development Priorities

When implementing features or making changes, prioritize in this order:

1. **Performance**: Optimize for speed and low latency
2. **Memory Efficiency**: Minimize memory footprint
3. **Maintainability**: Write clean, testable code

## Linux CI Testing (macOS Developers)

Use the Docker development environment to check Linux-specific headers and compiler behavior. It uses Ubuntu 22.04; GitHub Actions uses `ubuntu-latest` and different build options. Run Docker checks in a separate working copy so they do not reuse the native `build/` cache.

```bash
make docker-ci-check
```

This runs formatting, build, clang-tidy, and the default test tier, excluding `SLOW` and `LOAD`. Use `make test-all` for all CTest tiers and the E2E suites for database integration. See the [CI workflow](https://github.com/libraz/mygram-db/blob/main/.github/workflows/ci.yml) for the actual CI configuration and the [Linux Testing Guide](/docs/linux-testing) for working-copy isolation and individual commands.
