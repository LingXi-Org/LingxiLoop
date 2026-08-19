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
  ['--import', 'tsx', '--experimental-test-module-mocks', '--test', ...testFiles],
  { stdio: 'inherit', env: process.env },
)
child.on('exit', (code) => process.exit(code ?? 1))
