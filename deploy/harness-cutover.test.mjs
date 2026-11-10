import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { convergeHarnessCutover, harnessCutoverRequired } from './harness-cutover.mjs'

const source = { runtime: '3.8.25', id: 'lingxiloop', version: '3.8.24-design-1', hash: 'a'.repeat(64) }
const target = { ...source, runtime: '4.0.0', version: '4.0.0-native-artifacts-1', hash: 'b'.repeat(64) }
const run = async (failure, options = {}) => {
  const calls = [], actions = {}
  for (const name of ['inspect', 'preflight', 'snapshotSource', 'stopWorkers', 'stopIngress', 'barrier', 'restoreSource', 'convergeTarget']) actions[name] = async () => {
    calls.push(name)
    if (name === failure) throw Object.assign(Error(name), { uncertain: options.uncertain })
    if (name === 'inspect') return options.inspection ?? { target, sources: Array(4).fill(options.same ? target : source) }
  }
  let error
  try { await convergeHarnessCutover(actions) } catch (caught) { error = caught }
  return { calls, error }
}

test('actual hash controls the boundary, including changed guidance with the same version label', () => {
  assert.equal(harnessCutoverRequired(target, Array(4).fill(target)), false)
  assert.equal(harnessCutoverRequired(target, [target, target, target, { ...target, hash: source.hash }]), true)
  assert.throws(() => harnessCutoverRequired(target, [source]), /both Web and Worker/)
  assert.throws(() => harnessCutoverRequired(target, Array(4).fill({ ...source, runtime: '3.8.24' })), /reviewed formal/)
  assert.throws(() => harnessCutoverRequired(target, Array(4).fill({ ...source, hash: '' })))
  assert.throws(() => harnessCutoverRequired(target, Array(4).fill(source), true), /keep native writes disabled/)
  assert.equal(harnessCutoverRequired(target, Array(4).fill(target), true), false)
  assert.equal(harnessCutoverRequired(target, [target, target, target, null]), true, 'absent slot is never a matching receipt')
  assert.throws(() => harnessCutoverRequired(target, [target, target, target, null], true), /keep native writes disabled/)
})
test('retained queued or waiting work refuses before any source instance is stopped', async () => {
  const result = await run('preflight')
  assert.ok(result.error)
  assert.deepEqual(result.calls, ['inspect', 'preflight'])
})
test('reviewed native agent revisions share document writes but still require the full hash cutover', async () => {
  const next = { ...target, version: '4.0.0-native-artifacts-2', hash: 'c'.repeat(64) }
  const inspection = { target: next, sources: [target, next, target, next], nativeWritesEnabled: true }
  assert.equal(harnessCutoverRequired(next, inspection.sources, true), true)
  assert.equal(harnessCutoverRequired(next, Array(4).fill(next), true), false)
  assert.deepEqual(await run(undefined, { inspection }), { error: undefined,
    calls: ['inspect', 'preflight', 'snapshotSource', 'stopWorkers', 'stopIngress', 'barrier', 'convergeTarget'] })
  assert.deepEqual((await run('preflight', { inspection })).calls, ['inspect', 'preflight'])
  assert.deepEqual((await run('barrier', { inspection })).calls,
    ['inspect', 'preflight', 'snapshotSource', 'stopWorkers', 'stopIngress', 'barrier', 'restoreSource'])
})
test('enabled native writes reject legacy, absent or unreviewed contracts', () => {
  const next = { ...target, version: '4.0.0-native-artifacts-2', hash: 'c'.repeat(64) }
  for (const receipt of [source, null, { ...next, version: '4.0.0-native-artifacts-3' }, { ...next, runtime: '3.8.25' }]) {
    assert.throws(() => harnessCutoverRequired(next, [next, next, next, receipt], true), /keep native writes disabled/)
  }
  const unknown = { ...next, version: '4.0.0-native-artifacts-3' }
  assert.throws(() => harnessCutoverRequired(unknown, Array(4).fill(unknown), true), /keep native writes disabled/)
})
test('a changed harness drains source workers with their APIs, stops admission, then rechecks before target start', async () => {
  assert.deepEqual(await run(), { error: undefined, calls: ['inspect', 'preflight', 'snapshotSource', 'stopWorkers', 'stopIngress', 'barrier', 'convergeTarget'] })
})
test('admission racing preflight preserves the queue and restores pinned source containers', async () => {
  const result = await run('barrier')
  assert.ok(result.error)
  assert.deepEqual(result.calls, ['inspect', 'preflight', 'snapshotSource', 'stopWorkers', 'stopIngress', 'barrier', 'restoreSource'])
})
test('lost drain acknowledgement does not race a restart or a target deployment', async () => {
  const result = await run('stopIngress', { uncertain: true })
  assert.match(result.error.message, /outcome unconfirmed/)
  assert.deepEqual(result.calls, ['inspect', 'preflight', 'snapshotSource', 'stopWorkers', 'stopIngress'])
})
test('failed target convergence never restarts incompatible source or repeats a migration', async () => {
  const result = await run('convergeTarget')
  assert.ok(result.error)
  assert.equal(result.calls.filter(name => name === 'convergeTarget').length, 1)
  assert.equal(result.calls.includes('restoreSource'), false)
})
test('same assembled contract converges normally without interrupting its admitted work', async () => {
  assert.deepEqual(await run(undefined, { same: true }), { error: undefined, calls: ['inspect', 'convergeTarget'] })
})
test('database gate counts all kinds and unbound work in a read-only transaction', () => {
  const code = readFileSync(new URL('../server/src/db/harness-cutover.ts', import.meta.url), 'utf8')
  assert.match(code, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/)
  assert.match(code, /readRuntimePatchBarrier\(client, exclusiveClients, true, true\)/)
  assert.doesNotMatch(code, /\b(?:UPDATE|DELETE FROM|INSERT INTO|CREATE TABLE|ALTER TABLE)\b/)
})
test('partial convergence can inspect stopped images and only restores previously running sources', () => {
  const cli = readFileSync(new URL('./cli.mjs', import.meta.url), 'utf8')
  const inspect = cli.slice(cli.indexOf('async function inspectHarnesses('), cli.indexOf('async function harnessCutover('))
  assert.match(inspect, /docker inspect -f '\{\{\.Image\}\}'/)
  assert.match(inspect, /docker run --rm -i --network none --env-file/)
  assert.doesNotMatch(inspect, /docker (?:start|exec)/)
  assert.match(cli, /role\(value\)\.filter\(instance => instance\.running\)/)
})
