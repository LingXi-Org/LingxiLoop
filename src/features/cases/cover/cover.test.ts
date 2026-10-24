import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { CASE_COVER_CSP, coverAssetPath, coverSandboxDocument, createCoverBudget, isCoverMessage, MAX_CASE_COVER_HTML } from './sandbox'
import { startCoverPolling } from './polling'

test('generated code is isolated by an initial restrictive policy; active assets stay in the dedicated API', () => {
  const doc = coverSandboxDocument({ html: '<svg></svg><script>draw()</script>' })
  assert.ok(doc.indexOf('Content-Security-Policy') < doc.indexOf('<script>'))
  for (const directive of ["connect-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'", "worker-src 'none'"]) assert.ok(CASE_COVER_CSP.includes(directive))
  assert.equal(coverAssetPath('/api/cases/a/cover/assets/job/1/interactive?snapshot=published'), '/cases/a/cover/assets/job/1/interactive?snapshot=published')
  for (const url of ['https://evil.invalid/cover', '//evil.invalid', '/api/files/a', '/api/cases/a/cover/interactive?x#fragment', '/api/cases/../cover/assets/j/1/interactive?snapshot=draft', '/api/cases/a/cover/assets/%2e%2e/1/interactive?snapshot=draft', '/api/cases/%2f/cover/assets/j/1/interactive?snapshot=draft']) assert.throws(() => coverAssetPath(url))
  for (const payload of [{ html: 'x', unexpected: true }, { html: 'x'.repeat(MAX_CASE_COVER_HTML + 1) }, { html: '' }, null]) assert.throws(() => coverSandboxDocument(payload))
})

test('trusted wrapper keeps model closing tags as blob data, with strict forwarding across both boundaries', async () => {
  const hostile = '</script><script>globalThis.parentExecuted=true</script>'
  const doc = coverSandboxDocument({ html: hostile })
  assert.equal((doc.match(/<script>/g) ?? []).length, 1)
  assert.match(doc, /frame-src blob:/)
  let blob: Blob | undefined
  const realm = {
    document: { getElementById: () => ({ src: '', contentWindow: { postMessage: () => undefined } }) },
    URL: { createObjectURL: (value: Blob) => { blob = value; return 'blob:null/fixture' } },
    Blob, addEventListener: () => undefined,
  }
  runInNewContext(doc.match(/<script>([\s\S]*)<\/script>/)![1], realm)
  assert.equal('parentExecuted' in realm, false)
  assert.ok((await blob!.text()).includes(hostile))
  assert.match(doc, /event.source===parent/); assert.match(doc, /event.source===renderer.contentWindow/)
})

test('opaque-origin messages require the exact frame and exact protocol shape', () => {
  const frame = {} as Window
  const ready = { type: 'case-cover:ready', version: 1 }
  assert.ok(isCoverMessage({ source: frame, data: ready }, frame))
  assert.equal(isCoverMessage({ source: {} as Window, data: ready }, frame), false)
  assert.equal(isCoverMessage({ source: null, data: ready }, null), false)
  for (const data of [{ ...ready, height: 10000 }, { ...ready, version: 2 }, { type: 'open', version: 1 }, 'case-cover:ready', Object.assign(Object.create(ready), { extra: 1, other: 2 })]) assert.equal(isCoverMessage({ source: frame, data }, frame), false)
})

test('activating a third cover disposes the oldest animation and releases do not remove new slots', () => {
  const budget = createCoverBudget(2)
  const disposed: number[] = []
  const first = budget.acquire(() => disposed.push(1))
  const second = budget.acquire(() => disposed.push(2))
  const third = budget.acquire(() => disposed.push(3))
  assert.deepEqual(disposed, [1]); assert.equal(budget.size, 2)
  first(); assert.equal(budget.size, 2)
  second(); third(); assert.equal(budget.size, 0)
})

function clock() {
  let timestamp = 0
  const timers = new Map<number, { callback: () => void; at: number }>()
  let sequence = 0
  return {
    now: () => timestamp,
    schedule: ((callback: () => void, delay: number) => { timers.set(++sequence, { callback, at: timestamp + delay }); return sequence }) as unknown as typeof setTimeout,
    cancel: ((id: number) => timers.delete(id)) as unknown as typeof clearTimeout,
    tick: async () => { const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0]; if (next) { timers.delete(next[0]); timestamp = next[1].at; next[1].callback(); await new Promise(resolve => setImmediate(resolve)) } },
    get size() { return timers.size },
  }
}

test('polling finishes on ready and abort cancels an in-flight stale scope before adoption', async () => {
  const timer = clock(); const scope = new AbortController(); let calls = 0
  startCoverPolling({ ...timer, signal: scope.signal, refresh: async () => ++calls, receive: value => value < 2 })
  await timer.tick(); await timer.tick(); assert.equal(calls, 2); assert.equal(timer.size, 0)
  const another = clock(); const stale = new AbortController(); let finish: (value: string) => void = () => undefined; let received = false; let requestSignal: AbortSignal | undefined
  startCoverPolling({ ...another, signal: stale.signal, refresh: signal => { requestSignal = signal; return new Promise<string>(resolve => { finish = resolve }) }, receive: () => { received = true; return true } })
  await another.tick(); stale.abort(); finish('old draft'); await new Promise(resolve => setImmediate(resolve))
  assert.ok(requestSignal?.aborted); assert.equal(received, false); assert.equal(another.size, 0)
})

test('polling is bounded by elapsed time and three consecutive read failures', async () => {
  for (const fail of [false, true]) {
    const timer = clock(); let calls = 0
    startCoverPolling({ ...timer, signal: new AbortController().signal, refresh: async () => { calls++; if (fail) throw new Error('offline'); return true }, receive: () => true })
    for (let attempt = 0; attempt < 30; attempt++) await timer.tick()
    assert.equal(timer.size, 0); assert.ok(calls <= 24); if (fail) assert.equal(calls, 3)
  }
})

test('an absolute deadline aborts a hung read and prevents even abort-ignoring late results from adoption', async () => {
  const timer = clock(); let requestSignal: AbortSignal | undefined
  let finish: (value: string) => void = () => undefined; let received = false
  startCoverPolling({ ...timer, signal: new AbortController().signal,
    refresh: signal => { requestSignal = signal; return new Promise<string>(resolve => { finish = resolve }) },
    receive: () => { received = true; return true } })
  await timer.tick(); assert.equal(requestSignal?.aborted, false)
  await timer.tick(); assert.equal(requestSignal?.aborted, true)
  finish('too late'); await new Promise(resolve => setImmediate(resolve))
  assert.equal(received, false); assert.equal(timer.size, 0)
})

// Failure modes: a cover refresh overwrites unsaved/native content or article
// versions, or an older generation/snapshot installs after a retry/save.
test('cover refresh adopts only matching snapshot metadata and preserves article content and versions', async () => {
  const { mergeCaseCoverMetadata } = await import('./polling')
  const generatedCover = { schemaVersion: 1 as const, status: 'pending' as const, fingerprint: 'draft-a', generation: 2, alt: null, previewUrl: null, interactiveUrl: null, canRetry: false }
  const current = { id: 'case-a', body: 'Current native projection', title: 'Draft title', version: 9, generatedCover }
  const fresh = { ...current, body: 'Remote body', title: 'Remote title', version: 10, generatedCover: { ...generatedCover, status: 'ready' as const, previewUrl: '/ready.svg' } }
  const adopted = mergeCaseCoverMetadata(current, fresh)
  assert.deepEqual(adopted, { ...current, generatedCover: fresh.generatedCover })
  for (const stale of [{ ...fresh, id: 'other-case' }, { ...fresh, generatedCover: { ...fresh.generatedCover, fingerprint: 'published-b' } }, { ...fresh, generatedCover: { ...fresh.generatedCover, generation: 1 } }]) {
    assert.equal(mergeCaseCoverMetadata(current, stale), current)
  }
})
