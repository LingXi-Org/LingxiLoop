import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

test('OpenBot DetailPanel sources stay byte-equivalent to the pinned commit', () => {
  const result = spawnSync(process.execPath, ['scripts/guard-openbot-vendor.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /verified 3 files/)
  assert.match(result.stdout, /d293f2331bd5ff9ba4ad17af6ac94570a157d26d/)
})
