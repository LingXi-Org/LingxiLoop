import assert from 'node:assert/strict'
import test from 'node:test'
import { createArtifactRecovery, MAX_ARTIFACT_RECOVERY_BYTES } from './artifact-recovery'

function native() {
  let content: unknown = { files: { 'Main.dc.html': 'confirmed' } }, title = 'Canvas', dirty = false, readonly = false, ack = true
  const doc = {
    title: () => title, content: () => content, dirty: () => dirty, readOnly: () => readonly, shown: () => true,
    setContent(value: unknown) { content = value;dirty = true }, setTitle(value: string) { title = value;dirty = true },
    async save() { if (ack) dirty = false }, subscribeSave: () => () => {},
  }
  return { doc, edit: (value: unknown) => doc.setContent(value), readonly: () => { readonly = true }, pending: () => { ack = false } }
}

for (const kind of ['design', 'slides'] as const) test(`${kind}: unsent native content transfers to a freshly authorized unchanged document and waits for save acknowledgement`, async () => {
  const old = native(), capture = createArtifactRecovery(kind, old.doc, value => value)
  await capture.confirm()
  assert.equal((await capture.snapshot()).result, 'clean')
  old.edit({ files: { 'Main.dc.html': 'unsent draft', 'Child.dc.html': 'subcanvas' } })
  const snapshot = await capture.snapshot();assert.ok(snapshot.bytes)
  const fresh = native(), recovery = createArtifactRecovery(kind, fresh.doc, value => value)
  assert.equal(await recovery.inspect(snapshot.bytes), 'restorable')
  fresh.pending()
  assert.equal(await recovery.restore(snapshot.bytes), 'pending')
  assert.deepEqual(fresh.doc.content(), old.doc.content())
  assert.equal(await recovery.inspect(snapshot.bytes), 'changed', 'a dirty editor must never be overwritten')
  const acknowledged = native()
  assert.equal(await createArtifactRecovery(kind, acknowledged.doc, value => value).restore(snapshot.bytes), 'restored')
})

test('write downgrade, changed remote base and normalization loss preserve the package without any write', async () => {
  const old = native(), capture = createArtifactRecovery('design', old.doc, value => value)
  await capture.confirm();old.edit({ files: { 'Main.dc.html': 'mine' } })
  const snapshot = await capture.snapshot();assert.ok(snapshot.bytes)
  const readonly = native();readonly.readonly()
  const guard = createArtifactRecovery('design', readonly.doc, value => value)
  assert.equal(await guard.inspect(snapshot.bytes), 'readonly')
  await assert.rejects(guard.restore(snapshot.bytes))
  assert.deepEqual(readonly.doc.content(), { files: { 'Main.dc.html': 'confirmed' } })
  const changed = native();changed.doc.setContent({ files: { 'Main.dc.html': 'theirs' } });await changed.doc.save()
  assert.equal(await createArtifactRecovery('design', changed.doc, value => value).inspect(snapshot.bytes), 'changed')
  assert.equal(await createArtifactRecovery('design', native().doc, () => ({ files: {} })).inspect(snapshot.bytes), 'incompatible')
})

test('scope/kind, malformed or oversized packages never restore, and unknown bases stay download-only', async () => {
  const old = native(), capture = createArtifactRecovery('design', old.doc, value => value)
  old.edit({ files: { 'Main.dc.html': 'mine' } })
  const snapshot = await capture.snapshot();assert.ok(snapshot.bytes)
  assert.equal(await createArtifactRecovery('design', native().doc, value => value).inspect(snapshot.bytes), 'changed')
  await assert.rejects(createArtifactRecovery('slides', native().doc, value => value).inspect(snapshot.bytes))
  await assert.rejects(capture.inspect(new TextEncoder().encode('{}').buffer))
  await assert.rejects(capture.inspect(new ArrayBuffer(MAX_ARTIFACT_RECOVERY_BYTES + 1)))
  old.edit({ files: { 'Main.dc.html': 'x'.repeat(MAX_ARTIFACT_RECOVERY_BYTES) } })
  await assert.rejects(capture.snapshot(), /过大/)
  assert.equal(old.doc.dirty(), true)
})

test('a remote update during asynchronous hashing refuses restoration', async () => {
  const old = native(), capture = createArtifactRecovery('slides', old.doc, value => value)
  await capture.confirm();old.edit({ files: { 'Main.dc.html': 'mine' } })
  const snapshot = await capture.snapshot();assert.ok(snapshot.bytes)
  const fresh = native(), recovery = createArtifactRecovery('slides', fresh.doc, value => value)
  const restore = recovery.restore(snapshot.bytes)
  fresh.edit({ files: { 'Main.dc.html': 'new remote state' } });await fresh.doc.save()
  await assert.rejects(restore)
  assert.deepEqual(fresh.doc.content(), { files: { 'Main.dc.html': 'new remote state' } })
})

for (const kind of ['design', 'slides'] as const) test(`${kind}: an edit arriving while clean-state hashing is pending is captured before iframe replacement`, async t => {
  const old = native(), capture = createArtifactRecovery(kind, old.doc, value => value)
  await capture.confirm()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  const nativeCrypto = globalThis.crypto, nativeDigest = nativeCrypto.subtle.digest.bind(nativeCrypto.subtle)
  let entered!: () => void, release!: () => void
  const hashing = new Promise<void>(resolve => { entered = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
    randomUUID: nativeCrypto.randomUUID.bind(nativeCrypto),
    subtle: { digest: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
      entered();await gate;return nativeDigest(algorithm, data)
    } },
  } })
  t.after(() => { if (original) Object.defineProperty(globalThis, 'crypto', original);else Reflect.deleteProperty(globalThis, 'crypto') })
  const pending = capture.snapshot()
  await hashing
  old.edit({ files: { 'Main.dc.html': 'late unsent edit' } })
  release()
  const result = await pending
  assert.equal(result.result, 'snapshot', 'a late dirty edit must never be reported clean')
  assert.deepEqual(JSON.parse(new TextDecoder().decode(result.bytes)).state.content, old.doc.content())
})
