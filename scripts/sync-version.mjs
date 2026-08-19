import { readFileSync, writeFileSync } from 'node:fs'

const mode = process.argv[2] ?? '--check'
if (mode !== '--check' && mode !== '--write') {
  throw new Error('usage: node scripts/sync-version.mjs --check|--write')
}

const version = readFileSync('VERSION', 'utf8').trim()
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`VERSION is not a supported semantic version: ${JSON.stringify(version)}`)
}

const targets = [
  { path: 'package.json', mutate: (json) => { json.version = version } },
  {
    path: 'package-lock.json',
    mutate: (json) => {
      json.version = version
      if (!json.packages?.['']) throw new Error('package-lock.json is missing packages[""]')
      json.packages[''].version = version
    },
  },
  { path: 'agent-cli/package.json', mutate: (json) => { json.version = version } },
]

const mismatches = []
for (const target of targets) {
  const original = JSON.parse(readFileSync(target.path, 'utf8'))
  const updated = structuredClone(original)
  target.mutate(updated)
  if (JSON.stringify(original) === JSON.stringify(updated)) continue
  mismatches.push(target.path)
  if (mode === '--write') writeFileSync(target.path, `${JSON.stringify(updated, null, 2)}\n`)
}

if (mode === '--check' && mismatches.length > 0) {
  throw new Error(`VERSION=${version} is not synchronized in: ${mismatches.join(', ')}. Run npm run version:sync.`)
}

console.log(mode === '--write'
  ? `Synchronized application versions to ${version}.`
  : `Version contract passed: ${version}.`)
