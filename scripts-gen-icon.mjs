#!/usr/bin/env node

// Re-render the committed Electron PNG from the canonical Lingxi SVG.
// ImageMagick is intentionally the only external requirement; this script
// never generates or invents product artwork.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'

const source = 'assets/lingxiloop-logo.svg'
const target = 'build/icon.png'
if (!existsSync(source)) throw new Error(`Missing canonical logo: ${source}`)
mkdirSync('build', { recursive: true })

const rendered = spawnSync('magick', [source, '-background', 'none', '-resize', '1024x1024', target], {
  stdio: 'inherit',
})
if (rendered.error) throw rendered.error
if (rendered.status !== 0) process.exit(rendered.status ?? 1)
console.log(`Rendered ${target} from ${source}`)
