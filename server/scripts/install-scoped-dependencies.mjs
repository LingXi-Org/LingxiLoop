#!/usr/bin/env node
// Keep root package scripts and lock evidence intact while installing a scoped graph.
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const scope = process.argv[2]
if (!['web', 'web-ci', 'admin', 'control', 'server-ci', 'deploy-contract', 'integration', 'admin-control'].includes(scope)) throw new Error('Unknown dependency scope')
const originals = ['package.json', 'package-lock.json'].map(file => [file, readFileSync(resolve(root, file))])
try {
  for (const [file] of originals) writeFileSync(resolve(root, file), readFileSync(resolve(root, `server/build/${scope}/${file}`)))
  const result = spawnSync('npm', ['ci', '--ignore-scripts', '--prefer-offline', ...process.argv.slice(3)], {
    cwd: root, stdio: 'inherit', shell: process.platform === 'win32',
  })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  for (const [file, bytes] of originals) writeFileSync(resolve(root, file), bytes)
}
