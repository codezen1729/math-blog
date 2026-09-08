import fs from 'node:fs/promises'
import path from 'node:path'

let sharp
try {
  ;({ default: sharp } = await import('sharp'))
} catch {
  ;({ default: sharp } = await import('../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js'))
}

const [root, output] = process.argv.slice(2)

if (!root || !output) {
  throw new Error('Usage: node scripts/figure-contact-sheet.mjs <figure-directory> <output.png>')
}

const names = (await fs.readdir(root))
  .filter((name) => /\.(svg|png|jpe?g|webp)$/i.test(name))
  .sort()
const columns = 5
const tileWidth = 320
const tileHeight = 240
const imageHeight = 198
const rows = Math.ceil(names.length / columns)
const composites = []

for (let index = 0; index < names.length; index += 1) {
  const name = names[index]
  const left = (index % columns) * tileWidth
  const top = Math.floor(index / columns) * tileHeight
  const thumbnail = await sharp(path.join(root, name), { density: 180 })
    .resize(tileWidth - 20, imageHeight - 12, {
      fit: 'inside',
      withoutEnlargement: false,
      background: '#fff',
    })
    .flatten({ background: '#fff' })
    .png()
    .toBuffer()
  const safeName = name.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const label = Buffer.from(
    `<svg width="${tileWidth}" height="42"><rect width="100%" height="100%" fill="#f5f0e8"/><text x="10" y="26" font-family="Arial, sans-serif" font-size="14" fill="#302a25">${safeName}</text></svg>`,
  )
  composites.push({ input: thumbnail, left: left + 10, top: top + 6 })
  composites.push({ input: label, left, top: top + imageHeight })
}

await sharp({
  create: {
    width: columns * tileWidth,
    height: rows * tileHeight,
    channels: 4,
    background: '#fff',
  },
})
  .composite(composites)
  .png()
  .toFile(output)
