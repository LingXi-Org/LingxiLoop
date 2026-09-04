#!/usr/bin/env node

// Render every full-colour brand derivative from the canonical LingxiLoop SVG.
// ImageMagick is intentionally the only external requirement; no derivative
// may introduce or preserve separate product artwork.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'

const source = 'assets/lingxiloop-logo.svg'
if (!existsSync(source)) throw new Error(`Missing canonical logo: ${source}`)
for (const directory of ['build', 'public', 'website/assets']) mkdirSync(directory, { recursive: true })

const pngTargets = [
  ['build/icon.png', 1024],
  ['public/logo.png', 512],
  ['public/icon.png', 512],
  ['public/icon-192.png', 192],
  ['public/favicon-32.png', 32],
  ['website/assets/logo.png', 512],
  ['website/assets/icon-192.png', 192],
  ['website/assets/favicon-32.png', 32],
]

function runMagick(args) {
  const rendered = spawnSync('magick', args, { stdio: 'inherit' })
  if (rendered.error) throw rendered.error
  if (rendered.status !== 0) process.exit(rendered.status ?? 1)
}

for (const [target, size] of pngTargets) {
  runMagick([source, '-background', 'none', '-resize', `${size}x${size}`, target])
}

for (const target of ['public/favicon.ico', 'website/assets/favicon.ico']) {
  runMagick([source, '-background', 'none', '-define', 'icon:auto-resize=48,32,16', target])
}

console.log(`Rendered ${pngTargets.length + 2} brand assets from ${source}`)
