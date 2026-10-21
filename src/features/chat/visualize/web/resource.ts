const IDLE_MS = 5000
const RETRY_DELAY_MS = 250

class ResourceReadError extends Error {
  constructor(message: string, readonly retryable: boolean) { super(message) }
}

async function readAttempt(read: (signal: AbortSignal) => Promise<Response>, signal: AbortSignal, onIdle?: () => void) {
  const request = new AbortController()
  const combined = AbortSignal.any([signal, request.signal])
  let watching = Boolean(onIdle)
  let timer: ReturnType<typeof setTimeout> | undefined
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const progress = () => {
    clearTimeout(timer)
    if (watching) timer = setTimeout(() => { watching = false; onIdle?.() }, IDLE_MS)
  }
  try {
    progress()
    const response = await read(combined)
    progress()
    if (!response.ok) {
      // Never automatically retry authorization, missing assets or rate limits.
      // A server-requested Retry-After is left to explicit user retry instead
      // of ignoring that backoff within the short initialization budget.
      throw new ResourceReadError(`HTTP ${response.status}`,
        [408, 502, 503, 504].includes(response.status) && !response.headers.has('retry-after'))
    }
    if (!response.body) return ''
    reader = response.body.getReader()
    const decoder = new TextDecoder()
    let text = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) return text + decoder.decode()
      if (value.byteLength) progress()
      text += decoder.decode(value, { stream: true })
    }
  } catch (error) {
    signal.throwIfAborted()
    if (error instanceof ResourceReadError) throw error
    if (error instanceof TypeError) throw new ResourceReadError('网络连接中断', true)
    throw new ResourceReadError('读取失败', false)
  } finally {
    clearTimeout(timer)
    request.abort()
    reader?.releaseLock()
  }
}

/** At most two safe GETs, within the same scoped capability and total deadline. */
export function readWebResource(name: string, read: (signal: AbortSignal) => Promise<Response>, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const group = new AbortController()
    const combined = AbortSignal.any([signal, group.signal])
    let attempts = 0, pending = 0, settled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const cleanup = () => {
      settled = true
      clearTimeout(retryTimer)
      signal.removeEventListener('abort', abort)
      group.abort()
    }
    const fail = (error: unknown) => { if (!settled) { cleanup(); reject(error) } }
    const abort = () => fail(signal.reason)
    const retry = () => {
      if (settled || attempts === 2 || retryTimer !== undefined) return
      retryTimer = setTimeout(() => { retryTimer = undefined; start() }, RETRY_DELAY_MS)
    }
    const start = () => {
      if (settled) return
      attempts++; pending++
      // On an idle first request, keep it alive while the one recovery GET
      // runs. A valid late response can still win; we never discard a slow
      // first-byte response just because five seconds elapsed. Abort the loser
      // once complete bytes arrive. Progressing bodies do not trigger recovery.
      void readAttempt(read, combined, attempts === 1 ? retry : undefined).then(text => {
        if (!settled) { cleanup(); resolve(text) }
      }, error => {
        if (settled) return
        pending--
        if (signal.aborted) { fail(signal.reason); return }
        if (!(error instanceof ResourceReadError)) { fail(error); return }
        if (!error.retryable || (attempts === 2 && pending === 0)) {
          fail(new Error(`交互视图资源 ${name} ${error.message}（${attempts} 次尝试），请重试。`))
        } else retry()
      })
    }
    signal.addEventListener('abort', abort, { once: true })
    start()
  })
}
