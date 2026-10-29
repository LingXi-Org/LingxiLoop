#!/usr/bin/env node

// Render every full-colour brand derivative from the canonical LingxiLoop SVG.
// ImageMagick is intentionally the only external requirement; no derivative
// may introduce or preserve separate product artwork.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const source = 'assets/lingxiloop-logo.svg'
if (!existsSync(source)) throw new Error(`Missing canonical logo: ${source}`)
const faviconsOnly = process.argv.includes('--favicons-only')
if (process.argv.slice(2).some(argument => argument !== '--favicons-only')) throw new Error('Usage: node scripts/generate-icons.mjs [--favicons-only]')

const pngTargets = [
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

const targets = faviconsOnly ? pngTargets.filter(([target]) => /(?:favicon-32|icon-192)\.png$/.test(target) || target === 'public/icon.png') : pngTargets
for (const [target, size] of targets) {
  mkdirSync(dirname(target), { recursive: true })
  // SVG background is a decode setting: apply it before reading the source.
  runMagick(['-background', 'none', source, '-resize', `${size}x${size}`, target])
}

for (const target of ['public/favicon.ico', 'website/assets/favicon.ico']) {
  runMagick(['-background', 'none', source, '-define', 'icon:auto-resize=48,32,16', target])
}

console.log(`Rendered ${targets.length + 2} brand assets from ${source}`)
