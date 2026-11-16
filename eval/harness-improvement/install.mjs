import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

assert.ok(process.env.NODE_AUTH_TOKEN?.trim(), 'NODE_AUTH_TOKEN is required to install LingxiOS 4.0.0')
const env = { ...process.env }
delete env.DEEPSEEK_API_KEY
const cache = mkdtempSync(join(tmpdir(), 'harness-npm-cache-'))
try {
  const npm = spawnSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', cache], {
    cwd: fileURLToPath(new URL('.', import.meta.url)), env, stdio: 'inherit',
  })
  if (npm.error) throw npm.error
  process.exitCode = npm.status ?? 1
} finally {
  rmSync(cache, { recursive: true, force: true })
}
