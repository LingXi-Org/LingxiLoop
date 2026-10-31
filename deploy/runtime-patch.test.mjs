import assert from 'node:assert/strict'
import test from 'node:test'
import { assertRetirementReleaseAllowed, convergeRuntimePatch, runtimePatchPlan } from './runtime-patch.mjs'

const fixture = (version = '3.8.17') => {
  const dependencies = { '@lyyzka/lingxios': version }
  const pkg = { version, integrity: 'sha512-' + 'A'.repeat(86) + '==', resolved: `https://npm.pkg.github.com/download/@lyyzka/lingxios/${version}/` + 'a'.repeat(40) }
  const lock = { packages: { '': { dependencies }, 'node_modules/@lyyzka/lingxios': pkg } }
  const files = { 'package.json': JSON.stringify({ dependencies }), 'server/package.json': JSON.stringify({ dependencies }), 'package-lock.json': JSON.stringify(lock), 'server/package-lock.json': JSON.stringify(lock) }
  const paths = Array.from({ length: 58 }, (_, i) => `server/src/db/migrations/${String(i + 1).padStart(4, '0')}_fixture.sql`)
  for (const path of paths) files[path] = 'BEGIN; SELECT 1; COMMIT;'
  return { files, paths, read: path => files[path] }
}
test('CAS plan requires exact formal receipts and complete immutable inventory', () => {
  const f = fixture(), plan = runtimePatchPlan(f.read, f.paths)
  assert.equal(plan.source.runtime, '3.8.16'); assert.equal(plan.target.runtime, '3.8.17')
  assert.equal(plan.target.migrations.length, 58)
  assert.throws(() => runtimePatchPlan(f.read, f.paths.slice(1)))
  f.files['server/package-lock.json'] = f.files['server/package-lock.json'].replace('sha512-', 'sha256-')
  assert.throws(() => runtimePatchPlan(f.read, f.paths))
  f.files['package.json'] = JSON.stringify({ dependencies: { '@lyyzka/lingxios': '4.0.0-slim.0' } })
  assert.throws(() => runtimePatchPlan(f.read, f.paths), /unreviewed runtime transition/)
})
test('product59 retirement uses the existing SDK, never the historical product58 CAS', () => {
  const f = fixture(), path = 'server/src/db/migrations/0059_retire_presentation_generation.sql'
  f.files[path] = '-- isolated retirement fixture'; f.paths.push(path)
  assert.equal(runtimePatchPlan(f.read, f.paths), null)
  assert.throws(() => runtimePatchPlan(f.read, [...f.paths.slice(0, -1), path.replace('retire_presentation_generation', 'unknown')]))
  f.files['package.json'] = JSON.stringify({ dependencies: { '@lyyzka/lingxios': '3.8.16' } })
  assert.throws(() => runtimePatchPlan(f.read, f.paths), /product59 requires/)
  f.files['package.json'] = JSON.stringify({ dependencies: { '@lyyzka/lingxios': '3.8.17' } })
  f.files['server/package.json'] = JSON.stringify({ dependencies: { '@lyyzka/lingxios': '3.8.16' } })
  assert.throws(() => runtimePatchPlan(f.read, f.paths), /exact root\/server runtime pin/)
})
test('product59 accepts only matching formal 3.8.18 receipts and still rejects unreviewed versions', () => {
  const f = fixture(), path = 'server/src/db/migrations/0059_retire_presentation_generation.sql'
  f.paths.push(path); f.files[path] = '-- isolated retirement fixture'
  for (const name of ['package.json','server/package.json','package-lock.json','server/package-lock.json']) {
    f.files[name] = f.files[name].replaceAll('3.8.17','3.8.18')
  }
  assert.equal(runtimePatchPlan(f.read, f.paths), null)
  const bad = fixture(); bad.paths.push(path); bad.files[path] = '-- isolated retirement fixture'
  for (const name of ['package.json','server/package.json','package-lock.json','server/package-lock.json']) bad.files[name] = bad.files[name].replaceAll('3.8.17','3.8.19')
  assert.throws(() => runtimePatchPlan(bad.read, bad.paths), /product59 requires/)
  f.files['server/package-lock.json'] = f.files['server/package-lock.json'].replace('sha512-', 'sha256-')
  assert.throws(() => runtimePatchPlan(f.read, f.paths), /receipts differ/)
})
test('next patch accepts only exact17 to18 receipts and remains on product58', () => {
  const f = fixture('3.8.18'), plan = runtimePatchPlan(f.read, f.paths)
  assert.equal(plan.source.runtime, '3.8.17'); assert.equal(plan.target.runtime, '3.8.18')
  assert.equal(plan.target.productVersion, 58)
  const wrong = fixture('3.8.18')
  for (const file of ['package-lock.json', 'server/package-lock.json']) wrong.files[file] = wrong.files[file].replace('/3.8.18/', '/3.8.17/')
  assert.throws(() => runtimePatchPlan(wrong.read, wrong.paths))
  assert.throws(() => runtimePatchPlan(f.read, [...f.paths, 'server/src/db/migrations/0059_retire_presentation_generation.sql']))
  const future = fixture('3.8.19')
  assert.throws(() => runtimePatchPlan(future.read, future.paths), /unreviewed runtime transition/)
})
test('native artifacts use the installed runtime only with the exact product60 inventory', () => {
  const f = fixture('3.8.18')
  for (const name of ['0059_retire_presentation_generation', '0060_native_artifacts']) {
    const path = `server/src/db/migrations/${name}.sql`
    f.paths.push(path); f.files[path] = '-- reviewed fixture'
  }
  assert.equal(runtimePatchPlan(f.read, f.paths), null)
  assert.throws(() => runtimePatchPlan(f.read, [...f.paths.slice(0, -1), f.paths.at(-1).replace('native_artifacts', 'unknown')]))
  assert.throws(() => runtimePatchPlan(f.read, [...f.paths, 'server/src/db/migrations/0061_unknown.sql']))
  assert.throws(() => assertRetirementReleaseAllowed(f.paths, 'up'), /explicit maintenance release approval/)
})
test('runtime19 is only an18 to19 CAS on already installed product60, never retirement permission', () => {
  const f = fixture('3.8.19')
  for (const name of ['0059_retire_presentation_generation', '0060_native_artifacts']) {
    const path = `server/src/db/migrations/${name}.sql`
    f.paths.push(path); f.files[path] = '-- unchanged installed inventory'
  }
  const plan = runtimePatchPlan(f.read, f.paths)
  assert.equal(plan.source.runtime, '3.8.18'); assert.equal(plan.target.runtime, '3.8.19')
  assert.equal(plan.source.productVersion, 60); assert.equal(plan.target.productVersion, 60)
  assert.deepEqual(plan.source.migrations, plan.target.migrations)
  assert.doesNotThrow(() => assertRetirementReleaseAllowed(f.paths, 'up', undefined, plan))
  assert.throws(() => assertRetirementReleaseAllowed(f.paths, 'up'), /explicit maintenance release approval/)
  assert.throws(() => assertRetirementReleaseAllowed(f.paths, 'workers', undefined, plan), /explicit maintenance release approval/)
  assert.throws(() => runtimePatchPlan(f.read, f.paths.slice(0, 59)), /product59 requires/)
  assert.throws(() => runtimePatchPlan(f.read, f.paths.slice(0, 58)), /unreviewed runtime transition/)
  const wrong = { ...plan, source: { ...plan.source, runtime: '3.8.17' } }
  assert.throws(() => assertRetirementReleaseAllowed(f.paths, 'up', undefined, wrong), /explicit maintenance release approval/)
})
test('runtime20 requires exact19 source and installed product60 while retaining all maintenance barriers', () => {
  const f = fixture('3.8.20')
  for (const name of ['0059_retire_presentation_generation', '0060_native_artifacts']) {
    const path = `server/src/db/migrations/${name}.sql`
    f.paths.push(path); f.files[path] = '-- unchanged installed inventory'
  }
  const plan = runtimePatchPlan(f.read, f.paths)
  assert.equal(plan.source.runtime, '3.8.19'); assert.equal(plan.target.runtime, '3.8.20')
  assert.equal(plan.source.productVersion, 60); assert.deepEqual(plan.source.migrations, plan.target.migrations)
  assert.doesNotThrow(() => assertRetirementReleaseAllowed(f.paths, 'up', undefined, plan))
  assert.throws(() => assertRetirementReleaseAllowed(f.paths, 'workers', undefined, plan), /explicit maintenance release approval/)
  assert.throws(() => assertRetirementReleaseAllowed(f.paths, 'up', undefined, { ...plan, source: { ...plan.source, runtime: '3.8.18' } }), /explicit maintenance release approval/)
  for (const count of [58, 59]) assert.throws(() => runtimePatchPlan(f.read, f.paths.slice(0, count)))
  f.files['server/package-lock.json'] = f.files['server/package-lock.json'].replaceAll('3.8.20', '3.8.19')
  assert.throws(() => runtimePatchPlan(f.read, f.paths))
})
const run = async (fail, observed = { complete: false, state: 'source' }) => {
  const calls = [], actions = {}
  for (const name of ['preflight', 'requireFreshIntent', 'snapshotSource', 'stopIngress', 'stopWorkers', 'markAttempt', 'apply', 'observe', 'restoreSource', 'convergeTarget']) actions[name] = async () => {
    calls.push(name)
    if (fail.includes(name)) throw Error(name)
    return name === 'preflight' ? { complete: false, state: 'source' } : name === 'observe' ? observed : undefined
  }
  let error
  try { await convergeRuntimePatch(actions) } catch (e) { error = e }
  return { calls, error }
}
test('refused preflight or stale intent never stops source writers', async () => {
  assert.deepEqual((await run(['preflight'])).calls, ['preflight'])
  assert.deepEqual((await run(['requireFreshIntent'])).calls, ['preflight', 'requireFreshIntent'])
})
test('known drain refusal restores exact source without attempting CAS', async () => {
  const { calls, error } = await run(['stopWorkers'])
  assert.ok(error); assert.equal(calls.at(-1), 'restoreSource'); assert.ok(!calls.includes('apply'))
})
test('workers retain their source control APIs while draining, then one CAS precedes target start', async () => {
  const { calls, error } = await run([])
  assert.equal(error, undefined)
  assert.ok(calls.indexOf('stopWorkers') < calls.indexOf('stopIngress'))
  assert.ok(calls.indexOf('stopIngress') < calls.indexOf('markAttempt'))
  assert.ok(calls.indexOf('apply') < calls.indexOf('convergeTarget'))
  assert.equal(calls.filter(x => x === 'apply').length, 1)
})
test('lost drain acknowledgement never races a source restart', async () => {
  const calls = []
  await assert.rejects(convergeRuntimePatch({
    preflight: async () => ({ complete: false, state: 'source' }), requireFreshIntent: async () => {}, snapshotSource: async () => {},
    stopWorkers: async () => {},
    stopIngress: async () => { throw Object.assign(Error('lost acknowledgement'), { uncertain: true }) },
    restoreSource: async () => calls.push('restore'), apply: async () => calls.push('apply'),
  }), /drain outcome unconfirmed/)
  assert.deepEqual(calls, [])
})
test('unknown apply is observed once; committed target moves forward, known source restores', async () => {
  const target = await run(['apply'], { complete: true, state: 'target' })
  assert.equal(target.error, undefined); assert.equal(target.calls.at(-1), 'convergeTarget')
  const source = await run(['apply'])
  assert.match(source.error.message, /source restored/); assert.equal(source.calls.at(-1), 'restoreSource')
  for (const result of [target, source]) assert.equal(result.calls.filter(x => x === 'apply').length, 1)
})
test('unconfirmed observation retains maintenance and never starts either version', async () => {
  const { calls, error } = await run(['apply', 'observe'])
  assert.match(error.message, /remain stopped/)
  assert.ok(!calls.includes('restoreSource') && !calls.includes('convergeTarget'))
})

test('retirement requires explicit release approval before any deployment action', () => {
 const paths=['server/src/db/migrations/0059_retire_presentation_generation.sql']
 for (const command of ['up','servers','workers']) {
  assert.throws(() => assertRetirementReleaseAllowed(paths, command, undefined), /explicit maintenance release approval/)
  assert.doesNotThrow(() => assertRetirementReleaseAllowed(paths, command, 'true'))
 }
 assert.doesNotThrow(() => assertRetirementReleaseAllowed(paths, 'status', undefined))
 assert.doesNotThrow(() => assertRetirementReleaseAllowed([], 'up', undefined))
})
