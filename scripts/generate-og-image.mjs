import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'src', 'public')
const fontsDir = join(__dirname, 'fonts')

// Read SVG
const svgContent = readFileSync(join(publicDir, 'og-image.svg'), 'utf-8')

// Read font
const orbitronFont = readFileSync(join(fontsDir, 'Orbitron-Bold.ttf'))

// Render with resvg
const resvg = new Resvg(svgContent, {
  font: {
    fontFiles: [
      join(fontsDir, 'Orbitron-Bold.ttf'),
      join(fontsDir, 'SpaceGrotesk-Regular.ttf'),
      join(fontsDir, 'SpaceGrotesk-Medium.ttf'),
    ],
    loadSystemFonts: true,
  },
})

const pngData = resvg.render()
const pngBuffer = pngData.asPng()

writeFileSync(join(publicDir, 'og-image.png'), pngBuffer)

console.log('Generated og-image.png')
