// Fails the build when a page's search-result title or description is missing,
// duplicated within its locale, or too long to survive a search snippet.
//
// Widths count East Asian wide characters as 2, so one budget fits both locales:
// a 160-unit English description and an 80-character Japanese one truncate at
// roughly the same pixel width. Japanese descriptions get a wider budget because
// Google shows about 120 full-width characters on desktop.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const srcDir = path.join(root, 'src')
const BRAND = 'MygramDB'

const LIMITS = {
  en: { title: 65, description: { min: 70, max: 160 } },
  ja: { title: 65, description: { min: 70, max: 240 } }
}

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u
const width = (s) => [...s].reduce((n, c) => n + (WIDE.test(c) ? 2 : 1), 0)

/** Mirrors .vitepress/config.ts: the brand suffix is added only when the title lacks it. */
const renderedTitle = (title) => (title.includes(BRAND) ? title : `${title} | ${BRAND}`)

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'public' || entry.name === 'data') return []
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return entry.name.endsWith('.md') ? [full] : []
  })
}

function frontmatterField(source, key) {
  const block = source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''
  const raw = block.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'))?.[1]?.trim() ?? ''
  return raw.replace(/^(['"])(.*)\1$/, '$2')
}

const problems = []
const seen = { en: { title: new Map(), description: new Map() }, ja: { title: new Map(), description: new Map() } }

for (const file of walk(srcDir).sort()) {
  const rel = path.relative(srcDir, file)
  const locale = rel.startsWith('ja/') ? 'ja' : 'en'
  const limits = LIMITS[locale]
  const source = fs.readFileSync(file, 'utf-8')
  const title = frontmatterField(source, 'title')
  const description = frontmatterField(source, 'description')

  if (!title) problems.push(`${rel}: no frontmatter title.`)
  if (!description) problems.push(`${rel}: no frontmatter description; the page would fall back to the site default.`)

  if (title) {
    const shown = renderedTitle(title)
    if (width(shown) > limits.title) {
      problems.push(`${rel}: title "${shown}" is ${width(shown)} wide (max ${limits.title}).`)
    }
    if (seen[locale].title.has(shown)) problems.push(`${rel}: title duplicates ${seen[locale].title.get(shown)}.`)
    seen[locale].title.set(shown, rel)
  }

  if (description) {
    const w = width(description)
    const { min, max } = limits.description
    if (w < min || w > max) problems.push(`${rel}: description is ${w} wide (want ${min}-${max}).`)
    if (seen[locale].description.has(description)) {
      problems.push(`${rel}: description duplicates ${seen[locale].description.get(description)}.`)
    }
    seen[locale].description.set(description, rel)
  }
}

if (problems.length) {
  console.error(`check-seo: ${problems.length} problem(s)\n${problems.map((p) => `  - ${p}`).join('\n')}`)
  process.exit(1)
}
console.log('check-seo: every page has a unique title and description within budget.')
