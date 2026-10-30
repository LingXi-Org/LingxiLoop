import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const PACKAGE = '@lyyzka/lingxios'
const SOURCE = '3.8.16'
const TARGET = '3.8.17'
const SCHEMA = 'c56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

/** Only the reviewed exact transition is automatic; no generic version adoption. */
export function runtimePatchPlan(read, migrationPaths) {
  const json = path => JSON.parse(read(path))
  const manifest = json('package.json')
  const paths = migrationPaths.toSorted()
  const retirement = paths.length === 59 && paths.at(-1) === 'server/src/db/migrations/0059_retire_presentation_generation.sql'
  const selected = manifest.dependencies?.[PACKAGE]
  if (retirement) assert.ok(['3.8.17','3.8.18'].includes(selected), 'product59 requires a verified exact runtime')
  if (manifest.dependencies?.[PACKAGE] === SOURCE) return null
  if (!retirement) assert.equal(selected, TARGET, 'unreviewed runtime transition; only current3.8.16 or reviewed3.8.17 is supported')
  const targetRuntime = retirement ? selected : TARGET
  const server = json('server/package.json'), lock = json('package-lock.json'), serverLock = json('server/package-lock.json')
  const pkg = lock.packages?.[`node_modules/${PACKAGE}`], other = serverLock.packages?.[`node_modules/${PACKAGE}`]
  for (const value of [manifest, server, lock.packages?.[''], serverLock.packages?.['']]) assert.equal(value?.dependencies?.[PACKAGE], targetRuntime, 'exact root/server runtime pin required')
  assert.equal(pkg?.version, targetRuntime)
  for (const key of ['version', 'integrity', 'resolved']) assert.equal(other?.[key], pkg?.[key], 'root/server formal package receipts differ')
  assert.match(pkg.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/)
  assert.match(pkg.resolved, new RegExp(`^https://npm\\.pkg\\.github\\.com/download/@lyyzka/lingxios/${targetRuntime.replaceAll('.', '\\.')}/[a-f0-9]{40}$`))
  assert.ok(paths.length === 58 || retirement, 'runtime patch requires complete product58 or reviewed product59 retirement')
  const migrations = paths.map((path, index) => {
    const match = /\/(\d{4})_([a-z0-9_]+)\.sql$/.exec(path)
    assert.ok(match && Number(match[1]) === index + 1, 'ordered migration inventory required')
    return { version: index + 1, name: match[2], checksum: hash(read(path)) }
  })
  // Product59 uses an already installed, explicitly reviewed formal package.
  // Its migration runner checks package, schema, and installed provenance.
  // Never submit the historical product58 SDK provenance CAS for this release.
  if (retirement) return null
  const source = { runtime: SOURCE, schema: 14, protocol: 11, schemaHash: SCHEMA, productVersion: 58, migrations }
  const target = { ...source, runtime: TARGET, integrity: pkg.integrity, tarball: pkg.resolved }
  return { source, target, id: hash(JSON.stringify({ source, target })) }
}

/** The product59 retirement is staged manually after confirmed cleanup. */
export function assertRetirementReleaseAllowed(paths, command, approval) {
  if (paths.includes('server/src/db/migrations/0059_retire_presentation_generation.sql')
    && ['up','servers','workers'].includes(command) && approval !== 'true') {
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
