import assert from 'node:assert/strict'
import test from 'node:test'
import { createAssetReads } from './asset-reads'
import type { ArtifactAsset } from '../../../../shared/artifact-document'
const asset: ArtifactAsset = { id: 'image', url: '/api/artifacts/document/assets/image', contentType: 'image/png' }
function source() {
  const calls: Array<{ signal: AbortSignal; resolve(blob: Blob): void; reject(error: unknown): void }> = []
  const read = (_asset: ArtifactAsset, _artifactId: string, signal: AbortSignal) => new Promise<Blob>((resolve, reject) => { calls.push({ signal, resolve, reject }); signal.addEventListener('abort', () => reject(signal.reason), { once: true }) })
  return { read, calls }
}
const turn = () => new Promise<void>(resolve => queueMicrotask(resolve))

test('主图与缩略图共用正在下载的同一资源，完成后不保留大图', async () => {
  const loader = source(), pool = createAssetReads(loader.read), a = new AbortController(), b = new AbortController()
  const first = pool.read(asset, 'document', a.signal), second = pool.read({ ...asset }, 'document', b.signal)
  await turn(); assert.equal(loader.calls.length, 1)
  const bytes = new Blob(['图片']); loader.calls[0].resolve(bytes)
  assert.equal(await first, bytes); assert.equal(await second, bytes)
  const third = pool.read(asset, 'document', a.signal); await turn(); assert.equal(loader.calls.length, 2)
  loader.calls[1].resolve(bytes); await third; pool.dispose()
})

test('取消缩略图不会取消仍在显示的主图，最后一个使用方退出才停止下载', async () => {
  const loader = source(), pool = createAssetReads(loader.read), a = new AbortController(), b = new AbortController()
  const first = pool.read(asset, 'document', a.signal), second = pool.read(asset, 'document', b.signal)
  const cancelled = assert.rejects(first, { name: 'AbortError' }); await turn(); a.abort(); await cancelled
  assert.equal(loader.calls[0].signal.aborted, false)
  loader.calls[0].resolve(new Blob(['主图'])); assert.equal(await (await second).text(), '主图')
  const last = new AbortController(), pending = pool.read(asset, 'document', last.signal), stopped = assert.rejects(pending, { name: 'AbortError' })
  await turn(); last.abort(); await stopped; assert.equal(loader.calls[1].signal.aborted, true); pool.dispose()
})

test('失败不会污染重试，不同文档与资源版本不合并', async () => {
  const loader = source(), pool = createAssetReads(loader.read), signal = new AbortController().signal
  const first = pool.read(asset, 'document', signal), failed = assert.rejects(first, /读取失败/)
  await turn(); loader.calls[0].reject(new Error('读取失败')); await failed
  const retry = pool.read(asset, 'document', signal), other = pool.read(asset, 'other', signal), version = pool.read({ ...asset, sha256: 'a'.repeat(64) }, 'document', signal)
  await turn(); assert.equal(loader.calls.length, 4)
  for (const call of loader.calls.slice(1)) call.resolve(new Blob(['图片']))
  await Promise.all([retry, other, version]); pool.dispose()
})

test('作用域独立，超出合并上限仍可加载；关闭时全部取消，已取消请求不再启动', async () => {
  const loader = source(), pool = createAssetReads(loader.read, 1), secondPool = createAssetReads(loader.read), signal = new AbortController().signal
  const pending = [pool.read(asset, 'document', signal), pool.read({ ...asset, id: 'second' }, 'document', signal), secondPool.read(asset, 'document', signal)]
  const rejected = pending.map(p => assert.rejects(p, { name: 'AbortError' }))
  await turn(); assert.equal(loader.calls.length, 3); pool.dispose(); secondPool.dispose(); await Promise.all(rejected)
  assert.ok(loader.calls.every(call => call.signal.aborted))
  const stopped = new AbortController(); stopped.abort(); await assert.rejects(pool.read(asset, 'document', stopped.signal), { name: 'AbortError' }); assert.equal(loader.calls.length, 3)
})
