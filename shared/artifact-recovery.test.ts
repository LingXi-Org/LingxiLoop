import assert from 'node:assert/strict'
import test from 'node:test'
import { beginArtifactRecoveryAsyncEdit, createArtifactRecovery, installArtifactRecovery, MAX_ARTIFACT_RECOVERY_BYTES } from './artifact-recovery'

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

test('handoff drains a native image edit before replying and fences the delayed parent message window', async () => {
  const old = native(), recovery = createArtifactRecovery('slides', old.doc, value => value)
  await recovery.confirm()
  const finishBatch = beginArtifactRecoveryAsyncEdit(old.doc)
  const finishImage = beginArtifactRecoveryAsyncEdit(old.doc)
  assert.ok(finishBatch && finishImage)
  let replied = false
  const pending = recovery.handoffSnapshot().then(value => { replied = true;return value })
  await Promise.resolve()
  assert.equal(replied, false, 'image preparation must finish before snapshot reply')
  old.edit({ files: { 'Main.dc.html': 'image inserted after async preparation' } })
  finishImage()
  await Promise.resolve()
  assert.equal(replied, false, 'the outer multi-image drop must remain pending between files')
  finishBatch()
  const response = await pending
  assert.equal(response.result, 'snapshot')
  assert.equal(JSON.parse(new TextDecoder().decode(response.bytes)).state.content.files['Main.dc.html'], 'image inserted after async preparation')
  // The parent has not received its posted response yet. A late native write
  // must not alter the document represented by that response.
  assert.equal(beginArtifactRecoveryAsyncEdit(old.doc), null, 'new async edits are refused after sealing')
  assert.throws(() => old.edit({ files: { 'Main.dc.html': 'later write' } }), /交接/)
  assert.equal(old.doc.readOnly(), true)
  recovery.cancelHandoff()
  assert.equal(old.doc.readOnly(), false, 'failed handoff restores the retained editor')
})

test('cancelling a handoff while a native edit is pending keeps the old document editable', async () => {
  const old = native(), recovery = createArtifactRecovery('slides', old.doc, value => value)
  const finishImage = beginArtifactRecoveryAsyncEdit(old.doc)
  assert.ok(finishImage)
  const pending = recovery.handoffSnapshot()
  recovery.cancelHandoff()
  await assert.rejects(pending, /取消/)
  old.edit({ files: { 'Main.dc.html': 'still in original editor' } })
  assert.equal(old.doc.readOnly(), false)
  finishImage()
})

test('a cancelled pending handoff cannot seal or cancel an immediate retry', async () => {
  const old = native(), recovery = createArtifactRecovery('slides', old.doc, value => value)
  const finishImage = beginArtifactRecoveryAsyncEdit(old.doc)
  assert.ok(finishImage)
  const cancelled = recovery.handoffSnapshot()
  recovery.cancelHandoff()
  const retried = recovery.handoffSnapshot()
  old.edit({ files: { 'Main.dc.html': 'edit completed before retry' } })
  finishImage()
  await assert.rejects(cancelled, /取消/)
  const packet = await retried
  assert.equal(packet.result, 'snapshot')
  assert.equal(JSON.parse(new TextDecoder().decode(packet.bytes)).state.content.files['Main.dc.html'], 'edit completed before retry')
  assert.equal(old.doc.readOnly(), true)
  recovery.cancelHandoff()
  assert.equal(old.doc.readOnly(), false)
})

test('cancel during the native blur task prevents the old snapshot handler from sealing the editor', async t => {
  const old = native(), replies: unknown[] = [], listeners = new Map<string, Set<(event: any) => void>>()
  const parentWindow = { postMessage: (message: unknown) => replies.push(message) }
  const windowMock = {
    parent: parentWindow,
    addEventListener(type: string, callback: (event: any) => void) { const callbacks = listeners.get(type) ?? new Set();callbacks.add(callback);listeners.set(type, callbacks) },
    removeEventListener(type: string, callback: (event: any) => void) { listeners.get(type)?.delete(callback) },
  }
  const originals = ['window', 'parent', 'document', 'HTMLIFrameElement', 'HTMLElement', 'setTimeout'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  let finishBlur!: () => void
  const nativeTimeout = setTimeout
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: windowMock }, parent: { configurable: true, value: parentWindow },
    document: { configurable: true, value: { activeElement: null } },
    HTMLIFrameElement: { configurable: true, value: class {} }, HTMLElement: { configurable: true, value: class {} },
    setTimeout: { configurable: true, value: (callback: () => void, ms?: number) => ms === 0 ? (finishBlur = callback, 1) : nativeTimeout(callback, ms) },
  })
  t.after(() => {
    for (const callback of listeners.get('pagehide') ?? []) callback({})
    for (const [key, value] of originals) { if (value) Object.defineProperty(globalThis, key, value);else Reflect.deleteProperty(globalThis, key) }
  })
  installArtifactRecovery('slides', old.doc, value => value)
  const send = (command: string, requestId: string) => {
    for (const callback of listeners.get('message') ?? []) callback({ source: parentWindow, data: { type: 'artifact:recovery-request', kind: 'slides', nonce: 'page', requestId, command } })
  }
  send('snapshot', 'original')
  assert.ok(finishBlur, 'snapshot must pause for the native blur task')
  send('cancel', 'cancel')
  finishBlur()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(old.doc.readOnly(), false, 'cancelled handler must not seal after the blur task')
  assert.deepEqual(replies, [], 'a cancelled snapshot has no response')
  send('status', 'retry')
  assert.deepEqual(replies, [{ type: 'artifact:recovery-response', requestId: 'retry', nonce: 'page', result: 'ready', bytes: undefined }])
})

test('a multi-image gesture started before handoff completes all items before snapshot', async () => {
  const old = native(), recovery = createArtifactRecovery('slides', old.doc, value => value)
  const finishBatch = beginArtifactRecoveryAsyncEdit(old.doc)
  assert.ok(finishBatch)
  const finishFirst = beginArtifactRecoveryAsyncEdit(old.doc, finishBatch)
  assert.ok(finishFirst)
  const pending = recovery.handoffSnapshot()
  old.edit({ files: { 'Main.dc.html': 'first image' } })
  finishFirst()
  const finishSecond = beginArtifactRecoveryAsyncEdit(old.doc, finishBatch)
  assert.ok(finishSecond, 'an active batch may start its next item while new gestures are closed')
  old.edit({ files: { 'Main.dc.html': 'first image; second image' } })
  finishSecond()
  finishBatch()
  const packet = await pending
  assert.equal(packet.result, 'snapshot')
  assert.equal(JSON.parse(new TextDecoder().decode(packet.bytes)).state.content.files['Main.dc.html'], 'first image; second image')
  assert.equal(beginArtifactRecoveryAsyncEdit(old.doc, finishBatch), null, 'a completed batch cannot reopen the sealed editor')
  recovery.cancelHandoff()
})
