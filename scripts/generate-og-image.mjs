import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'src', 'public')
const fontsDir = join(__dirname, 'fonts')

// Read SVG
const svgContent = readFileSync(join(publicDir, 'og-image.svg'), 'utf-8')

// Render with resvg — Orbitron (logo wordmark) + IBM Plex (body/mono)
const resvg = new Resvg(svgContent, {
  font: {
    fontFiles: [
      join(fontsDir, 'Orbitron-Bold.ttf'),
      join(fontsDir, 'IBMPlexSans-VF.ttf'),
      join(fontsDir, 'IBMPlexMono-Medium.ttf'),
      join(fontsDir, 'IBMPlexMono-SemiBold.ttf'),
    ],
    loadSystemFonts: false,
  },
})

const pngData = resvg.render()
const pngBuffer = pngData.asPng()

writeFileSync(join(publicDir, 'og-image.png'), pngBuffer)

console.log('Generated og-image.png')
