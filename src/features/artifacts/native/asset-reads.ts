import type { ArtifactAsset } from '../../../../shared/artifact-document'

export type AssetRead = (asset: ArtifactAsset, artifactId: string, signal: AbortSignal) => Promise<Blob>
interface PendingRead { controller: AbortController; promise: Promise<Blob>; users: number; settled: boolean }

/** One editor owns these in-flight reads. Completed blobs are never cached. */
export function createAssetReads(loader: AssetRead, limit = 32) {
  const owner = new AbortController(), pending = new Map<string, PendingRead>()
  const cancelled = () => new DOMException('资源读取已取消', 'AbortError')
  const read: AssetRead = (asset, artifactId, signal) => {
    const consumer = AbortSignal.any([owner.signal, signal])
    if (consumer.aborted) return Promise.reject(consumer.reason)
    const key = JSON.stringify([artifactId, asset.id, asset.sha256, asset.url])
    let entry = pending.get(key)
    if (!entry) {
      // The coalescing map has a fixed bound. Overflow retains ordinary fetch
      // cancellation, including cancellation of the whole editor scope.
      if (pending.size >= limit) return loader(asset, artifactId, consumer)
      const controller = new AbortController()
      entry = { controller, users: 0, settled: false, promise: Promise.resolve().then(() => {
        controller.signal.throwIfAborted()
        return loader(asset, artifactId, controller.signal)
      }) }
      pending.set(key, entry)
      const current = entry
      const clear = () => { current.settled = true; if (pending.get(key) === current) pending.delete(key) }
      void entry.promise.then(clear, clear)
    }
    const current = entry
    current.users++
    return new Promise<Blob>((resolve, reject) => {
      let finished = false
      const finish = (error: unknown, blob?: Blob) => {
        if (finished) return
        finished = true; consumer.removeEventListener('abort', abort); current.users--
        if (!current.users && !current.settled) {
          if (pending.get(key) === current) pending.delete(key)
          current.controller.abort(cancelled())
        }
        if (blob) resolve(blob); else reject(error)
      }
      const abort = () => finish(consumer.reason)
      consumer.addEventListener('abort', abort, { once: true })
      void current.promise.then(blob => finish(undefined, blob), error => finish(error))
    })
  }
  return { read, dispose: () => owner.abort(cancelled()) }
}
