import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const PACKAGE = '@lyyzka/lingxios'
const SOURCES = Object.freeze({ '3.8.17': '3.8.16', '3.8.18': '3.8.17', '3.8.19': '3.8.18', '3.8.20': '3.8.19' })
const SCHEMA = 'c56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

/** Only the reviewed exact transition is automatic; no generic version adoption. */
export function runtimePatchPlan(read, migrationPaths) {
  const json = path => JSON.parse(read(path))
  const manifest = json('package.json')
  const paths = migrationPaths.toSorted()
  const slides61 = paths.length === 61 && paths[60] === 'server/src/db/migrations/0061_slides_workspaces.sql'
  const retirement = [59, 60, 61].includes(paths.length)
    && paths[58] === 'server/src/db/migrations/0059_retire_presentation_generation.sql'
    && (paths.length === 59 || paths[59] === 'server/src/db/migrations/0060_native_artifacts.sql')
  const targetRuntime = manifest.dependencies?.[PACKAGE]
  const runtimeOnly60 = retirement && paths.length === 60 && ['3.8.19','3.8.20'].includes(targetRuntime)
  if (slides61) assert.equal(targetRuntime, '3.8.20', 'product61 requires exact installed formal3.8.20')
  if (retirement) assert.ok(['3.8.17','3.8.18'].includes(targetRuntime) || runtimeOnly60 || slides61, 'product59 requires a verified exact runtime')
  if (['3.8.19','3.8.20'].includes(targetRuntime)) assert.ok(runtimeOnly60 || slides61, 'unreviewed runtime transition; runtime patch requires installed product60')
  if (targetRuntime === '3.8.16') return null
  assert.ok(Object.hasOwn(SOURCES, targetRuntime ?? ''), 'unreviewed runtime transition; only current3.8.16 or exact reviewed3.8.17/3.8.18/3.8.19/3.8.20 is supported')
  const sourceRuntime = SOURCES[targetRuntime]
  const server = json('server/package.json'), lock = json('package-lock.json'), serverLock = json('server/package-lock.json')
  const pkg = lock.packages?.[`node_modules/${PACKAGE}`], other = serverLock.packages?.[`node_modules/${PACKAGE}`]
  for (const value of [manifest, server, lock.packages?.[''], serverLock.packages?.['']]) assert.equal(value?.dependencies?.[PACKAGE], targetRuntime, 'exact root/server runtime pin required')
  assert.equal(pkg?.version, targetRuntime)
  for (const key of ['version', 'integrity', 'resolved']) assert.equal(other?.[key], pkg?.[key], 'root/server formal package receipts differ')
  assert.match(pkg.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/)
  const registryPrefix = `https://npm.pkg.github.com/download/@lyyzka/lingxios/${targetRuntime}/`
  assert.ok(pkg.resolved?.startsWith(registryPrefix), 'formal registry/version URL required')
  assert.match(pkg.resolved.slice(registryPrefix.length), /^[a-f0-9]{40}$/)
  assert.ok(paths.length === 58 || retirement, 'runtime patch requires complete product58 or reviewed product59/60 retirement')
  const migrations = paths.map((path, index) => {
    const match = /\/(\d{4})_([a-z0-9_]+)\.sql$/.exec(path)
    assert.ok(match && Number(match[1]) === index + 1, 'ordered migration inventory required')
    return { version: index + 1, name: match[2], checksum: hash(read(path)) }
  })
  // Product61 changes only product state; migrate.ts requires installed formal20/product60.
  if (slides61) return null
  // Retirement uses the installed SDK; migrations verify its exact provenance.
  if (retirement && !runtimeOnly60) return null
  // This plan cannot install59/60: the preflight/CAS requires their exact ledger
  // already present, and changes only the runtime provenance row.
  const source = { runtime: sourceRuntime, schema: 14, protocol: 11, schemaHash: SCHEMA, productVersion: runtimeOnly60 ? 60 : 58, migrations }
  const target = { ...source, runtime: targetRuntime, integrity: pkg.integrity, tarball: pkg.resolved }
  return { source, target, id: hash(JSON.stringify({ source, target })) }
}

/** The product59 retirement is staged manually after confirmed cleanup. */
export function assertRetirementReleaseAllowed(paths, command, approval, patch) {
  const slides61 = patch === null && paths.length === 61
    && paths[59] === 'server/src/db/migrations/0060_native_artifacts.sql'
    && paths[60] === 'server/src/db/migrations/0061_slides_workspaces.sql'
  const runtimeOnly60 = ['up', 'servers'].includes(command) && paths.length === 60
    && ['3.8.19','3.8.20'].includes(patch?.target.runtime) && patch?.source.runtime === SOURCES[patch?.target.runtime]
    && [patch.source, patch.target].every(d => d.productVersion === 60 && d.schema === 14
      && d.protocol === 11 && d.schemaHash === SCHEMA && d.migrations.length === 60)
    && JSON.stringify(patch.source.migrations) === JSON.stringify(patch.target.migrations)
  if (paths.includes('server/src/db/migrations/0059_retire_presentation_generation.sql')
    && ['up','servers','workers'].includes(command) && approval !== 'true' && !runtimeOnly60 && !slides61) {
    throw new Error('product59 retirement requires explicit maintenance release approval')
  }
}

/** One CAS submission. Failed or uncertain submissions are observed, never retried. */
export async function convergeRuntimePatch(actions) {
  const state = await actions.preflight()
  if (state.complete) return actions.convergeTarget()
  assert.equal(state.state, 'source', 'unknown runtime provenance')
  await actions.requireFreshIntent()
  await actions.snapshotSource()
  try {
    await actions.stopWorkers()
    await actions.stopIngress()
    await actions.markAttempt()
  } catch (error) {
    if (error?.uncertain) throw new Error('drain outcome unconfirmed; writers remain in maintenance; inspect source containers before recovery')
    await actions.restoreSource()
    throw error
  }
  try {
    await actions.apply()
  } catch {
    let observed
    try { observed = await actions.observe() }
    catch { throw new Error('runtime CAS outcome unconfirmed; writers remain stopped; read-only observation required') }
    if (!observed.complete) {
      assert.equal(observed.state, 'source', 'unknown CAS outcome; writers remain stopped')
      await actions.restoreSource()
      throw new Error('runtime CAS not applied; source restored; intent retained for operator review')
    }
  }
  return actions.convergeTarget()
}
