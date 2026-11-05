import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const PACKAGE = '@lyyzka/lingxios'
const SOURCES = Object.freeze({ '3.8.17': '3.8.16', '3.8.18': '3.8.17', '3.8.19': '3.8.18', '3.8.20': '3.8.19', '3.8.21': '3.8.20', '3.8.22': '3.8.21', '3.8.23': '3.8.21', '3.8.24': '3.8.21', '3.8.25': '3.8.24' })
const SOURCE_OPTIONS = Object.freeze({ '3.8.23': ['3.8.21','3.8.22'], '3.8.24': ['3.8.21','3.8.22','3.8.23'] })
const reviewedSource = (target, source) => Object.hasOwn(SOURCES, target ?? '') && (SOURCE_OPTIONS[target] ?? [SOURCES[target]]).includes(source)
const SCHEMA = 'c56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

/** Only the reviewed exact transition is automatic; no generic version adoption. */
export function runtimePatchPlan(read, migrationPaths, { sourceRuntime: selectedSource } = {}) {
  const json = path => JSON.parse(read(path))
  const manifest = json('package.json')
  const paths = migrationPaths.toSorted()
  const native63 = paths.length === 63
    && paths[60] === 'server/src/db/migrations/0061_slides_workspaces.sql'
    && paths[61] === 'server/src/db/migrations/0062_case_options.sql'
    && paths[62] === 'server/src/db/migrations/0063_native_artifact_documents.sql'
  if (native63 && manifest.dependencies?.['@lingxi-org/lingxios'] === '4.0.0') {
    assert.ok(selectedSource === undefined || selectedSource === '3.8.25', 'organization bridge requires explicit formal3.8.25 source')
    const key = '@lingxi-org/lingxios', server = json('server/package.json'), lock = json('package-lock.json'), serverLock = json('server/package-lock.json')
    const pkg = lock.packages?.[`node_modules/${key}`], other = serverLock.packages?.[`node_modules/${key}`]
    for (const value of [manifest, server, lock.packages?.[''], serverLock.packages?.['']]) {
      assert.equal(value?.dependencies?.[key], '4.0.0', 'exact organization runtime pin required')
      assert.equal(value?.dependencies?.[PACKAGE], undefined, 'active package must use the canonical organization scope')
    }
    assert.equal(pkg?.version, '4.0.0')
    assert.equal(pkg?.integrity, 'sha1-iui7Npfsd+TwQUlFGjlctX2e3bg=', 'official published4.0.0 shasum required')
    assert.equal(pkg?.resolved, 'https://npm.pkg.github.com/download/@lingxi-org/lingxios/4.0.0/8ae8bb3697ec77e4f04149451a395cb57d9eddb8')
    for (const field of ['version', 'integrity', 'resolved']) assert.equal(other?.[field], pkg?.[field], 'root/server formal package receipts differ')
    const migrations = paths.slice(0, 62).map((path, index) => {
      const match = /\/(\d{4})_([a-z0-9_]+)\.sql$/.exec(path)
      assert.ok(match && Number(match[1]) === index + 1, 'ordered migration inventory required')
      return { version: index + 1, name: match[2], checksum: hash(read(path)) }
    })
    const source = { runtime: '3.8.25', schema: 14, protocol: 11, schemaHash: SCHEMA, productVersion: 62, migrations }
    const target = { ...source, runtime: '4.0.0', integrity: pkg.integrity, tarball: pkg.resolved }
    return { source, target, id: hash(JSON.stringify({ source, target })) }
  }
  const cases62 = paths.length === 62 && paths[60] === 'server/src/db/migrations/0061_slides_workspaces.sql' && paths[61] === 'server/src/db/migrations/0062_case_options.sql'
  const slides61 = paths.length === 61 && paths[60] === 'server/src/db/migrations/0061_slides_workspaces.sql'
  const retirement = [59, 60, 61, 62, 63].includes(paths.length)
    && paths[58] === 'server/src/db/migrations/0059_retire_presentation_generation.sql'
    && (paths.length === 59 || paths[59] === 'server/src/db/migrations/0060_native_artifacts.sql')
  const targetRuntime = manifest.dependencies?.[PACKAGE]
  if (native63) throw new Error('product63 requires the canonical organization4.0.0 package and explicit formal25 bridge')
  if (cases62) assert.ok(['3.8.24','3.8.25'].includes(targetRuntime), 'product62 requires exact formal3.8.24 or reviewed formal3.8.25')
  const runtimeOnly62 = cases62 && targetRuntime === '3.8.25'
  const runtimeOnly60 = retirement && paths.length === 60 && ['3.8.19','3.8.20'].includes(targetRuntime)
  const runtimeOnly61 = slides61 && ['3.8.21','3.8.22','3.8.23','3.8.24'].includes(targetRuntime)
  if (slides61) assert.ok(['3.8.20','3.8.21','3.8.22','3.8.23','3.8.24'].includes(targetRuntime), 'product61 requires exact formal20 or reviewed20 to21 or21 to22 or reviewed21 to23/24 production bridge runtime patch')
  if (retirement) assert.ok(['3.8.17','3.8.18'].includes(targetRuntime) || runtimeOnly60 || slides61 || cases62 || native63, 'product59 requires a verified exact runtime')
  if (['3.8.19','3.8.20','3.8.21','3.8.22','3.8.23','3.8.24','3.8.25'].includes(targetRuntime)) assert.ok(runtimeOnly60 || slides61 || cases62 || native63, 'unreviewed runtime transition; runtime patch requires installed product60')
  if (targetRuntime === '3.8.16') return null
  assert.ok(Object.hasOwn(SOURCES, targetRuntime ?? ''), 'unreviewed runtime transition; only current3.8.16 or exact reviewed3.8.17/3.8.18/3.8.19/3.8.20/3.8.21/3.8.22/3.8.23/3.8.24/3.8.25 is supported')
  const sourceRuntime = selectedSource ?? (native63 ? targetRuntime : SOURCES[targetRuntime])
  assert.ok(native63 ? sourceRuntime === targetRuntime : reviewedSource(targetRuntime, sourceRuntime), 'unreviewed explicit runtime source')
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
  // The case options migration accepts installed formal24 only; no runtime CAS.
  if (cases62 && !runtimeOnly62) return null
  // Product61 changes only product state; migrate.ts requires installed formal20/product60.
  if (slides61 && !runtimeOnly61) return null
  // Retirement uses the installed SDK; migrations verify its exact provenance.
  if (retirement && !runtimeOnly60 && !runtimeOnly61 && !runtimeOnly62) return null
  // This plan cannot install59/60: the preflight/CAS requires their exact ledger
  // already present, and changes only the runtime provenance row.
  const source = { runtime: sourceRuntime, schema: 14, protocol: 11, schemaHash: SCHEMA, productVersion: runtimeOnly62 ? 62 : runtimeOnly61 ? 61 : runtimeOnly60 ? 60 : 58, migrations }
  const target = { ...source, runtime: targetRuntime, integrity: pkg.integrity, tarball: pkg.resolved }
  return { source, target, id: hash(JSON.stringify({ source, target })) }
}

/** The product59 retirement is staged manually after confirmed cleanup. */
export function assertRetirementReleaseAllowed(paths, command, approval, patch) {
  if (paths.length === 63 && paths[62] === 'server/src/db/migrations/0063_native_artifact_documents.sql'
    && patch?.source.runtime === '3.8.25' && patch?.target.runtime === '4.0.0'
    && [patch.source, patch.target].every(d => d.productVersion === 62 && d.schema === 14 && d.protocol === 11 && d.schemaHash === SCHEMA && d.migrations.length === 62)
    && JSON.stringify(patch.source.migrations) === JSON.stringify(patch.target.migrations)) return
  const cases62 = patch === null && paths.length === 62
    && paths[59] === 'server/src/db/migrations/0060_native_artifacts.sql'
    && paths[60] === 'server/src/db/migrations/0061_slides_workspaces.sql'
    && paths[61] === 'server/src/db/migrations/0062_case_options.sql'
  const slides61 = patch === null && paths.length === 61
    && paths[59] === 'server/src/db/migrations/0060_native_artifacts.sql'
    && paths[60] === 'server/src/db/migrations/0061_slides_workspaces.sql'
  const runtimeOnly60 = ['up', 'servers'].includes(command) && paths.length === 60
    && ['3.8.19','3.8.20'].includes(patch?.target.runtime) && patch?.source.runtime === SOURCES[patch?.target.runtime]
    && [patch.source, patch.target].every(d => d.productVersion === 60 && d.schema === 14
      && d.protocol === 11 && d.schemaHash === SCHEMA && d.migrations.length === 60)
    && JSON.stringify(patch.source.migrations) === JSON.stringify(patch.target.migrations)
  const runtimeOnly61 = ['up', 'servers'].includes(command) && paths.length === 61
    && paths[60] === 'server/src/db/migrations/0061_slides_workspaces.sql'
    && ['3.8.21','3.8.22','3.8.23','3.8.24'].includes(patch?.target.runtime) && reviewedSource(patch?.target.runtime, patch?.source.runtime)
    && [patch.source, patch.target].every(d => d.productVersion === 61 && d.schema === 14
      && d.protocol === 11 && d.schemaHash === SCHEMA && d.migrations.length === 61)
    && JSON.stringify(patch.source.migrations) === JSON.stringify(patch.target.migrations)
  const runtimeOnly62 = ['up','servers'].includes(command) && paths.length === 62
    && paths[60] === 'server/src/db/migrations/0061_slides_workspaces.sql'
    && paths[61] === 'server/src/db/migrations/0062_case_options.sql'
    && patch?.source.runtime === '3.8.24' && patch?.target.runtime === '3.8.25'
    && [patch.source,patch.target].every(d => d.productVersion === 62 && d.schema === 14
      && d.protocol === 11 && d.schemaHash === SCHEMA && d.migrations.length === 62)
    && JSON.stringify(patch.source.migrations) === JSON.stringify(patch.target.migrations)
  if (paths.includes('server/src/db/migrations/0059_retire_presentation_generation.sql')
    && ['up','servers','workers'].includes(command) && approval !== 'true' && !runtimeOnly60 && !runtimeOnly61 && !runtimeOnly62 && !slides61 && !cases62) {
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
