#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { changedPaths, parseScopeArguments } from './changed-paths.mjs'

const biomeExtensions = /\.(?:cjs|css|js|json|jsonc|jsx|mjs|ts|tsx)$/

const { base, paths: taskPaths, remaining } = parseScopeArguments(process.argv.slice(2))
if (remaining.length > 0) throw new Error(`unknown argument: ${remaining[0]}`)

if (!base && taskPaths.length === 0) {
  console.log('[lint:local] no task paths supplied; pass repeated --path values or an explicit --base')
  process.exit(0)
}

const paths = changedPaths({ base, paths: taskPaths })
  .filter((path) => biomeExtensions.test(path) && existsSync(resolve(path)))
  .sort((a, b) => a.localeCompare(b, 'en'))

if (paths.length === 0) {
  console.log('[lint:local] no changed Biome-owned files')
  process.exit(0)
}

console.log(`[lint:local] checking ${paths.length} task file(s)${base ? ` since ${base}` : ''}`)
const executable = resolve('node_modules/@biomejs/biome/bin/biome')
const result = spawnSync(process.execPath, [executable, 'lint', ...paths], {
  stdio: 'inherit',
  windowsHide: true,
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
