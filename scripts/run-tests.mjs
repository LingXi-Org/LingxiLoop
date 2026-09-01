#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const roots = [resolve('server/src/__tests__'), resolve('src'), resolve('workers')]

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
  ['--import', 'tsx', '--experimental-test-module-mocks', '--test', '--test-concurrency=1', ...testFiles],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'unit-test-key',
      OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      WUKONG_USER_TOKEN_SECRET: process.env.WUKONG_USER_TOKEN_SECRET || 'unit-test-wukong-user-token-secret',
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
