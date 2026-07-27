/**
 * Renders every diagram in `theme/diagrams/` into static preview pages so the
 * layout can be checked in a browser in both languages and both themes without
 * running the docs site. Writes one page per diagram plus an index.
 *
 * Usage: node scripts/preview-diagrams.mjs [outDir]
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dir = join(root, '.vitepress/theme/diagrams')
const outDir = process.argv[2] ?? '/tmp/dgpreview'

mkdirSync(outDir, { recursive: true })

const css = readFileSync(join(root, '.vitepress/theme/styles/components.css'), 'utf8')
  .split('/* ------------------------------------------------------------- Doc diagrams */')[1]
  .split('/* Diagram/figure legend')[0]

const shell = (title, body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>
:root{--vp-c-divider:#e2e8f0;--mg-panel-border:rgba(96,165,250,.16)}
body{margin:0;padding:20px;background:#fff;font:14px system-ui,sans-serif;color:#0f172a}
body.dark{background:#0a0f1a;color:#e8eefb}
h2{font:600 12px ui-monospace,monospace;color:#64748b;margin:18px 0 4px}
/* matches the real docs reading column so previews are 1:1 with the site */
.wrap{max-width:844px;margin:0 auto}
a{color:#1d4ed8}
${css}
</style></head>
<body><div class="wrap vp-doc">${body}</div></body></html>
`

const names = existsSync(dir)
  ? readdirSync(dir)
      .filter((f) => f.endsWith('.svg'))
      .sort()
  : []

for (const f of names) {
  const svg = readFileSync(join(dir, f), 'utf8')
  const body = ['en', 'ja']
    .map((lang) => `<h2>${f} — ${lang}</h2><figure class="doc-diagram" data-lang="${lang}">${svg}</figure>`)
    .join('\n')
  writeFileSync(join(outDir, `${f.replace(/\.svg$/, '')}.html`), shell(f, body))
  writeFileSync(join(outDir, `${f.replace(/\.svg$/, '')}.dark.html`), shell(f, body).replace('<body>', '<body class="dark">'))
}

writeFileSync(
  join(outDir, 'index.html'),
  shell('diagrams', names.map((f) => `<p><a href="./${f.replace(/\.svg$/, '')}.html">${f}</a></p>`).join('\n'))
)

console.log(`${names.length} diagram(s) -> ${outDir}`)
