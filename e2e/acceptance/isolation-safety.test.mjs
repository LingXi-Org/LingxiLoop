import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Failure inventory: a newly selected fixture accidentally pauses the soak's PG,
// a reused container name points at a different service, or a typo selects defaults.
test('isolated SPA PostgreSQL pause verifies its label and loopback port before mutation', () => {
  for (const mismatch of ['label', 'port', 'none']) {
    const directory = mkdtempSync(join(tmpdir(), 'spa-isolation-'))
    const calls = join(directory, 'calls.jsonl')
    const inspection = { Config: { Labels: { 'lingxiloop.acceptance': mismatch === 'label' ? 'soak' : 'spa352' } },
      NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: mismatch === 'port' ? '55432' : '55433' }] } } }
    writeFileSync(join(directory, 'docker'), `#!${process.execPath}\nimport('node:fs').then(fs=>{fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(process.argv.slice(2))+'\\n');if(process.argv[2]==='inspect')console.log(${JSON.stringify(JSON.stringify([inspection]))})})\n`, { mode: 0o700 })
    try {
      const result = spawnSync(process.execPath, ['--input-type=module', '-e',
        `import {pauseTestDatabase} from ${JSON.stringify(new URL('./session-fixture.mjs', import.meta.url).href)};pauseTestDatabase(true)`],
      { encoding: 'utf8', env: { PATH: `${directory}:${process.env.PATH}`, ACCEPTANCE_FIXTURE_ROOT: resolve('.'), E2E_SPA_ISOLATED: '1' } })
      const commands = readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line))
      assert.deepEqual(commands[0], ['inspect', 'lingxiloop-spa352-postgres-1'])
      if (mismatch === 'none') { assert.equal(result.status, 0, result.stderr); assert.deepEqual(commands[1], ['pause', 'lingxiloop-spa352-postgres-1']) }
      else { assert.notEqual(result.status, 0); assert.equal(commands.length, 1, 'a mismatch must never reach docker pause') }
    } finally { rmSync(directory, { recursive: true, force: true }) }
  }
})

test('unknown SPA isolation selection fails before opening any fixture connection', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import ${JSON.stringify(new URL('./session-fixture.mjs', import.meta.url).href)}`],
  { encoding: 'utf8', env: { PATH: process.env.PATH, ACCEPTANCE_FIXTURE_ROOT: resolve('.'), E2E_SPA_ISOLATED: 'typo' } })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /E2E_SPA_ISOLATED must be unset or 1/)
})
