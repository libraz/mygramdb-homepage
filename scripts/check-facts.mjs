// Verifies the numbers this site restates from somewhere else, so a stale one
// fails the build instead of shipping.
//
// Two kinds of drift have happened here and are covered:
//
//   1. The advertised version. `latestVersion` in .vitepress/config.ts drives
//      the nav, the JSON-LD and the release-notes link, and it sat at 1.10.0
//      after 1.10.1 shipped. When the core repo is checked out beside this one
//      the two are compared; when it is not (CI builds the site alone) the
//      comparison is skipped with a note rather than guessed at.
//   2. Stale memory claims. An old `verify_text: off` measurement was copied as
//      current index-only sizing advice. The server now retains normalized text
//      in every mode for query-time highlighting, so those figures and claims
//      cannot be used to size a current deployment.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const problems = []
const notes = []

// --- 1. Advertised version vs. the core repo's changelog ---------------------

const config = fs.readFileSync(path.join(root, '.vitepress/config.ts'), 'utf-8')
const siteVersion = config.match(/^const latestVersion = '([^']+)'/m)?.[1]

if (!siteVersion) {
  problems.push('Could not read `latestVersion` from .vitepress/config.ts.')
}

const CORE = path.resolve(root, '../mygram-db')
const CHANGELOG = path.join(CORE, 'CHANGELOG.md')

if (siteVersion && fs.existsSync(CHANGELOG)) {
  // Headings look like `## [1.10.1] - 2026-08-27`; `## [Unreleased]` is skipped.
  const released = [...fs.readFileSync(CHANGELOG, 'utf-8').matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map(
    (m) => m[1]
  )
  const newest = released[0]
  if (!newest) {
    problems.push(`No released version heading found in ${CHANGELOG}.`)
  } else if (newest !== siteVersion) {
    problems.push(
      `.vitepress/config.ts advertises v${siteVersion} but the newest release in the core ` +
        `changelog is v${newest}. Bump latestVersion.`
    )
  }

  // The nav links straight at docs/releases/v<version>.md; a missing file is a 404.
  const notes404 = path.join(CORE, 'docs/releases', `v${siteVersion}.md`)
  if (!fs.existsSync(notes404)) {
    problems.push(
      `The release-notes link points at docs/releases/v${siteVersion}.md, which does not exist ` +
        'in the core repo.'
    )
  }
} else if (siteVersion) {
  notes.push('Core repo not checked out beside this one — version comparison skipped.')
}

// --- 2. No stale index-only memory claims -------------------------------------

const SKIP = new Set(['node_modules', '.vitepress', 'public', 'data'])
const STALE_MEMORY = [
  // "~813MB per million documents", "813 MB", "約813MB"
  /\b\d{3}\s?MB\s+per\s+million/i,
  /100万ドキュメントあたり約\d{3}MB/,
  /resident memory is approximately \d{3} MB/i,
  /常駐メモリは約\d{3} ?MB/,
  /text store is allocated only when `?verify_text/i,
  /verify_text[^\n]*off[^\n]*(?:no text storage|index only)/i,
  /テキストストアは[^\n]*verify_text[^\n]*有効[^\n]*のみ/,
  /verify_text[^\n]*off[^\n]*(?:テキスト保存なし|インデックスのみ)/
]

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(abs, out)
    else if (entry.name.endsWith('.md')) out.push(abs)
  }
  return out
}

for (const file of walk(path.join(root, 'src'))) {
  const rel = path.relative(root, file)
  fs.readFileSync(file, 'utf-8')
    .split('\n')
    .forEach((line, i) => {
      for (const pattern of STALE_MEMORY) {
        if (pattern.test(line)) {
          problems.push(
            `${rel}:${i + 1} repeats stale index-only memory advice. Current builds retain ` +
              'normalized text even with verify_text: off.'
          )
          return
        }
      }
    })
}

// --- report ------------------------------------------------------------------

for (const note of notes) console.log(`note: ${note}`)

if (problems.length) {
  console.error(`\nFact check failed (${problems.length} problem(s)):\n`)
  for (const p of problems) console.error(`  ${p}`)
  console.error('')
  process.exit(1)
}

console.log(`Fact check passed: site advertises v${siteVersion}; no stale index-only memory claims.`)
