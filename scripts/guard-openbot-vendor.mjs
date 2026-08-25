#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const manifestPath = resolve('third_party/openbot/manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

if (manifest.commit !== 'd293f2331bd5ff9ba4ad17af6ac94570a157d26d') {
  console.error(`[openbot-vendor] unexpected source commit: ${manifest.commit}`)
  process.exit(1)
}

const failures = []
for (const file of manifest.files) {
  const normalized = readFileSync(resolve(file.localPath), 'utf8').replace(/\r\n/g, '\n')
  const actual = createHash('sha256').update(normalized).digest('hex')
  if (actual !== file.sha256) failures.push(`${file.localPath}: expected ${file.sha256}, received ${actual}`)
}

if (failures.length > 0) {
  console.error('[openbot-vendor] vendored source differs from the pinned upstream commit')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`[openbot-vendor] verified ${manifest.files.length} files at ${manifest.commit}`)
