import assert from 'node:assert/strict'

// Both reviewed Agent revisions use the same schema63 native document writer.
// Agent API changes still require the hash-based all-work cutover below.
const nativeDocumentContracts = new Set(['4.0.0-native-artifacts-1', '4.0.0-native-artifacts-2'])

/** Compare the actual SDK assembly, never a version label or an edited baseline. */
export function harnessCutoverRequired(target, sources, nativeWritesEnabled = false) {
  // An absent container is an inert slot after failed recreation, not evidence
  // of any contract. It always requires the full database barrier.
  for (const receipt of [target, ...sources.filter(source => source !== null)]) {
    assert.ok(['3.8.25', '4.0.0'].includes(receipt?.runtime), 'native harness cutover requires the reviewed formal3.8.25 to4.0.0 boundary')
    assert.equal(receipt?.id, 'lingxiloop', 'unknown product harness')
    assert.match(receipt?.version ?? '', /^[a-zA-Z0-9.-]+$/)
    assert.match(receipt?.hash ?? '', /^[a-f0-9]{64}$/)
  }
  assert.equal(sources.length, 4, 'inspect both Web and Worker slots before changing a harness')
  assert.equal(target.runtime, '4.0.0', 'native artifact target requires exact formal4.0.0')
  if (nativeWritesEnabled) assert.ok(nativeDocumentContracts.has(target.version)
    && sources.every(source => source?.runtime === '4.0.0' && nativeDocumentContracts.has(source.version)),
    'keep native writes disabled until every instance supports the native artifact contract')
  return sources.some(source => source?.hash !== target.hash || source?.runtime !== target.runtime)
}

/** No queue rewrites and no cancellation. A refusal leaves old work on its
 * pinned source; after target convergence begins only a compatible fix-forward
 * is safe. The separate reviewed runtime bridge owns SDK provenance changes. */
export async function convergeHarnessCutover(actions) {
  const { target, sources, nativeWritesEnabled } = await actions.inspect()
  if (!harnessCutoverRequired(target, sources, nativeWritesEnabled)) return actions.convergeTarget()
  await actions.preflight()
  await actions.snapshotSource()
  try {
    // Workers keep their source API during graceful drain. The second check
    // catches admissions racing the first read, including waiting approvals.
    await actions.stopWorkers()
    await actions.stopIngress()
    await actions.barrier()
  } catch (error) {
    if (error?.uncertain) throw new Error('harness drain outcome unconfirmed; inspect source containers before recovery')
    await actions.restoreSource()
    throw error
  }
  return actions.convergeTarget()
}
