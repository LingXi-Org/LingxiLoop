#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { changedPaths, parseScopeArguments } from './changed-paths.mjs'
import { selectLocalTests } from './local-test-selection.mjs'

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

function normalizePath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '')
}

function repositoryPath(value) {
  return normalizePath(relative(process.cwd(), value))
}

const arguments_ = process.argv.slice(2)
const localIndex = arguments_.indexOf('--local')
const local = localIndex >= 0
if (local) arguments_.splice(localIndex, 1)
const { base, paths: taskPaths, tests: declaredTests, remaining: testArguments } = parseScopeArguments(
  arguments_,
  { allowTests: true },
)
if (base && !local) {
  console.error('[test] --base is available only with --local')
  process.exit(2)
}
if (taskPaths.length > 0 && !local) {
  console.error('[test] --path is available only with --local')
  process.exit(2)
}
if (declaredTests.length > 0 && !local) {
  console.error('[test] --test is available only with --local')
  process.exit(2)
}

const allTestFiles = roots.flatMap(collect).sort()
const explicitTests = [...declaredTests, ...testArguments].map((path) => resolve(path))
for (const path of explicitTests) {
  if (!existsSync(path) || !path.endsWith('.test.ts')) {
    console.error(`[test] expected an existing .test.ts file: ${repositoryPath(path)}`)
    process.exit(2)
  }
  if (!roots.some((root) => path === root || path.startsWith(`${root}${sep}`))) {
    console.error(`[test] test is outside an owned unit-test root: ${repositoryPath(path)}`)
    process.exit(2)
  }
}

if (local && !base && taskPaths.length === 0 && explicitTests.length === 0) {
  console.log('[test:local] no task paths supplied; pass repeated --path/--test values or an explicit --base')
  process.exit(0)
}

const testFiles = local
  ? selectLocalTests(
    allTestFiles.map(repositoryPath),
    changedPaths({ base, paths: taskPaths }),
    explicitTests.map(repositoryPath),
  ).map((path) => resolve(path))
  : explicitTests.length > 0 ? [...new Set(explicitTests)].sort() : allTestFiles

if (testFiles.length === 0) {
  if (local) {
    console.log('[test:local] no direct unit tests selected; CI owns broader regression coverage')
    process.exit(0)
  }
  console.error('[test] no unit test files found')
  process.exit(2)
}

if (local) {
  console.log(`[test:local] running ${testFiles.length} direct file(s)${base ? ` since ${base}` : ''}:`)
  for (const path of testFiles) console.log(`  - ${repositoryPath(path)}`)
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
      OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      DATABASE_URL: process.env.DATABASE_URL || 'postgres://unit-tests@127.0.0.1:5432/lingxiloop',
      REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      R2_ENDPOINT: process.env.R2_ENDPOINT || 'http://127.0.0.1:9000',
      R2_BUCKET: process.env.R2_BUCKET || 'unit-tests',
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || 'unit-test-key',
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || 'unit-test-secret',
      R2_PUBLIC_BASE: process.env.R2_PUBLIC_BASE || 'https://assets.test.invalid',
      R2_URL_SIGNING_SECRET: process.env.R2_URL_SIGNING_SECRET || 'unit-test-signing-secret',
      LINGXILOOP_INVITE_BASE_URL: process.env.LINGXILOOP_INVITE_BASE_URL || 'https://app.test.invalid',
    },
  },
)
child.on('exit', (code) => process.exit(code ?? 1))
