import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { test } from 'node:test'

const run = promisify(execFile)

test('repository contains no retired Agent product runtime', async () => {
  const result = await run(process.execPath, ['scripts/guard-agent-os.mjs'], { cwd: process.cwd() })
  assert.match(result.stdout, /Agent OS guard passed/)
})
