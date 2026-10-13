import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Failure modes: disabled evaluation touches credentials, starts services, or overwrites prior evidence.
const reports = ['live', 'wukong'].flatMap(mode => ['results.json', 'run-metadata.json'].map(file => `artifacts/interactive-ui/${mode}/${file}`))
const before = reports.map(file => readFileSync(file, 'utf8'))
for (const args of [[], ['--transport-only']]) {
  const child = spawnSync(process.execPath, ['e2e/server/interactive-ui-live.mjs', '--live-generative-ui', ...args], {
    encoding: 'utf8', windowsHide: true, env: { ...process.env, E2E_EVAL_CREDENTIALS: '__disabled_preflight_must_not_read_credentials__' },
  })
  assert.notEqual(child.status, 0)
  assert.match(child.stderr, /Interactive lessons are disabled/)
  assert.doesNotMatch(child.stderr, /ENOENT|Missing EVAL_/)
}
assert.deepEqual(reports.map(file => readFileSync(file, 'utf8')), before)
console.log('PASS: both disabled evaluation modes exit before credentials/services and preserve prior reports.')
