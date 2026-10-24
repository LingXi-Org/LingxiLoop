import { isVisualizePublicResource } from '../../../../../shared/visualize-public-resources'

/** No in-flight sharing: each capability-bearing read owns its abort/retry budget. */
export function createPublicResourceCache({ maxEntries = 16, maxBytes = 8 * 1024 * 1024 } = {}) {
  const entries = new Map<string, { text: string; bytes: number }>()
  let bytes = 0
  return {
    async read(name: string, digest: unknown, load: () => Promise<string>, signal: AbortSignal): Promise<string> {
      signal.throwIfAborted()
      if (!isVisualizePublicResource(name) || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest) || !globalThis.crypto?.subtle) {
        const text = await load(); signal.throwIfAborted(); return text
      }
      const key = `${name}:${digest}`
      const cached = entries.get(key)
      if (cached) { entries.delete(key); entries.set(key, cached); return cached.text }
      const text = await load()
      signal.throwIfAborted()
      const encoded = new TextEncoder().encode(text)
      const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoded)), value => value.toString(16).padStart(2, '0')).join('')
      signal.throwIfAborted()
      if (actual !== digest) throw new Error(`交互视图固定资源 ${name} 完整性校验失败，请重试。`)
      const size = Math.max(encoded.byteLength, text.length * 2)
      if (size <= maxBytes && maxEntries > 0) {
        // Concurrent successful reads can finish in either order.
        const previous = entries.get(key)
        if (previous) bytes -= previous.bytes
        entries.delete(key); entries.set(key, { text, bytes: size }); bytes += size
        while (entries.size > maxEntries || bytes > maxBytes) {
          const oldest = entries.entries().next().value!
          bytes -= oldest[1].bytes; entries.delete(oldest[0])
        }
      }
      return text
    },
  }
}
