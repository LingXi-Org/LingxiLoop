import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
test('fixed backend router preserves bytes/inode and fences unknown or conflicting operations', () => {
  const result = spawnSync('python3', [fileURLToPath(new URL('./backend_route_test.py', import.meta.url))], { encoding: 'utf8', timeout: 20000, env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: '1' } })
  assert.equal(result.status, 0, result.stdout + result.stderr)
})
