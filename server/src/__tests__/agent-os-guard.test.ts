import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { test } from 'node:test'

const run = promisify(execFile)

test('active AgentOS cannot regress to legacy, Codex CLI, or Computer runtimes', async () => {
  const result = await run(process.execPath, ['scripts/guard-agent-os.mjs'], { cwd: process.cwd() })
  assert.match(result.stdout, /Agent OS architecture guard passed/)
})
