import { isVisualizePublicResource } from '../../../../../shared/visualize-public-resources'

/** Only verified public bytes are shared; each page keeps its own abort/retry budget. */
export function createPublicResourceCache({ maxEntries = 16, maxBytes = 8 * 1024 * 1024 } = {}) {
  const entries = new Map<string, { text: string; bytes: number }>()
  const pending = new Map<string, Promise<string>>()
  let bytes = 0
  const wait = (read: Promise<string>, signal: AbortSignal, timeout?: number) => new Promise<string>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort) }
    const abort = () => { cleanup(); reject(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
    if (timeout !== undefined) timer = setTimeout(() => { cleanup(); reject(new Error('Shared public resource is still pending')) }, timeout)
    read.then(text => { cleanup(); resolve(text) }, error => { cleanup(); reject(error) })
    if (signal.aborted) abort()
  })
  return {
    async read(name: string, digest: unknown, load: () => Promise<string>, signal: AbortSignal): Promise<string> {
      signal.throwIfAborted()
      if (!isVisualizePublicResource(name) || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest) || !globalThis.crypto?.subtle) {
        const text = await load(); signal.throwIfAborted(); return text
      }
      const key = `${name}:${digest}`
      const cached = entries.get(key)
      if (cached) { entries.delete(key); entries.set(key, cached); return cached.text }
      const ownRead = async () => {
        const text = await load()
        signal.throwIfAborted()
        const encoded = new TextEncoder().encode(text)
        const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoded)), value => value.toString(16).padStart(2, '0')).join('')
        signal.throwIfAborted()
        if (actual !== digest) throw new Error(`交互视图固定资源 ${name} 完整性校验失败，请重试。`)
        const size = Math.max(encoded.byteLength, text.length * 2)
        if (size <= maxBytes && maxEntries > 0) {
          // A follower can finish its own fallback before the original owner.
          const previous = entries.get(key)
          if (previous) bytes -= previous.bytes
          entries.delete(key); entries.set(key, { text, bytes: size }); bytes += size
          while (entries.size > maxEntries || bytes > maxBytes) {
            const oldest = entries.entries().next().value!
            bytes -= oldest[1].bytes; entries.delete(oldest[0])
          }
        }
        return text
      }
      const shared = pending.get(key)
      if (shared) {
        try { const text = await wait(shared, signal, 5000); signal.throwIfAborted(); return text }
        catch {
          signal.throwIfAborted()
          // One independent fallback, using this page's existing capability and
          // deadline. Never restart a sharing chain or cancel the owner.
          return wait(ownRead(), signal)
        }
      }
      const owned = wait(ownRead(), signal).finally(() => { if (pending.get(key) === owned) pending.delete(key) })
      // Pending reads hold no extra completed bytes; a full registry keeps the
      // original independent path instead of evicting another page's owner.
      if (maxBytes > 0 && pending.size + 1 <= maxEntries) pending.set(key, owned)
      return owned
    },
  }
}
