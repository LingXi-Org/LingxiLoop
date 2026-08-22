#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const roots = [
  resolve('server/src/__tests__'),
  resolve('src'),
  resolve('workers'),
]

function collect(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ['node_modules', 'dist', 'coverage', '.wrangler'].includes(entry.name)) continue
    const full = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...collect(full))
    else if (entry.isFile() && entry.name.endsWith('.test.ts')) files.push(full)
  }
  return files
}

const testFiles = roots.flatMap(collect).sort()
if (testFiles.length === 0) {
  console.error('[test] no unit test files found')
  process.exit(2)
}

const child = spawn(
  process.execPath,
  // Several unit files intentionally override process-wide environment and
  // module seams. Serialize files so those test doubles cannot race each
  // other on faster CI runners; individual assertions remain deterministic.
  ['--import', 'tsx', '--experimental-test-module-mocks', '--test', '--test-concurrency=1', ...testFiles],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      // Unit tests mock provider calls; importing env.ts should not require
      // developers or CI to expose a real production credential.
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'unit-test-key',
    },
  },
)
child.on('exit', (code) => process.exit(code ?? 1))
