import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { mock, test } from 'node:test'

test('workspace realtime shares tickets and fences late connections across reconnect and logout', async () => {
  const requests: Array<{ resolve(response: Response): void; reject(error: Error): void }> = []
  const sockets: Socket[] = []
  let clears = 0
  let userId: string | null = 'user'
  class Socket {
    static CONNECTING = 0
    static OPEN = 1
    readyState = Socket.CONNECTING
    onopen?: () => void
    onmessage?: (event: { data: string }) => void
    onclose?: (event: { code: number }) => void
    onerror?: () => void
    constructor(readonly url: string) { sockets.push(this) }
    close() { this.readyState = 3 }
    send() {}
  }
  mock.module('@/stores/auth', { namedExports: {
    getMeId: () => userId,
    useAuth: { getState: () => ({ clear: () => { clears++ } }) },
  } })
  mock.module('@/api/core/http', { namedExports: { getServerOrigin: () => 'https://loop.test' } })
  mock.module('@/api/transport', { namedExports: {
    lingxiApiFetch: () => new Promise<Response>((resolve, reject) => requests.push({ resolve, reject })),
  } })
  const previousWebSocket = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket')
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: Socket })
  mock.timers.enable({ apis: ['setTimeout'] })
  const { ws } = await import('./realtime')
  const ticket = (value: string) => Response.json({ ticket: value })
  try {
    const pending = [ws.connect(), ws.connect(), ws.connect()]
    assert.equal(requests.length, 1, 'simultaneous boot subscribers share the pending ticket')
    requests[0].resolve(ticket('initial'))
    await Promise.all(pending)
    assert.deepEqual(sockets.map(socket => socket.url), ['wss://loop.test/ws?t=initial'])
    await ws.connect()
    assert.equal(requests.length, 1, 'a connecting socket prevents another ticket')

    ws.reconnect()
    const revoked = ws.connect()
    ws.close()
    requests[1].resolve(ticket('logged-out'))
    await revoked
    await ws.connect()
    assert.equal(sockets.length, 1, 'logout fences a late ticket')
    assert.equal(requests.length, 2, 'an intentional close cannot reconnect implicitly')

    ws.reconnect()
    const stale = ws.connect()
    ws.reconnect()
    const fresh = ws.connect()
    assert.equal(requests.length, 4, 'explicit reconnect starts a fresh generation immediately')
    requests[2].reject(new Error('stale network failure'))
    await stale
    mock.timers.tick(8_000)
    assert.equal(requests.length, 4, 'a stale failure cannot schedule another ticket')
    requests[3].resolve(ticket('fresh'))
    await fresh
    assert.deepEqual(sockets.map(socket => socket.url), ['wss://loop.test/ws?t=initial', 'wss://loop.test/ws?t=fresh'])
    sockets[0].onclose?.({ code: 4403 })
    assert.equal(clears, 0, 'a stale forbidden socket cannot clear the new identity')

    ws.reconnect()
    const failed = ws.connect()
    requests[4].resolve(new Response(null, { status: 503 }))
    await failed
    mock.timers.tick(499)
    assert.equal(requests.length, 5)
    mock.timers.tick(1)
    assert.equal(requests.length, 6, 'current ticket failures retain reconnect backoff')
    const recovered = ws.connect()
    requests[5].resolve(ticket('recovered'))
    await recovered
    assert.equal(sockets.length, 3)
    sockets[2].onclose?.({ code: 4403 })
    assert.equal(clears, 1, 'current forbidden sockets still clear authentication')

    ws.close()
    userId = null
    ws.reconnect()
    await setImmediate()
    assert.equal(requests.length, 6, 'signed-out sessions never request tickets')
  } finally {
    ws.close()
    mock.timers.reset()
    if (previousWebSocket) Object.defineProperty(globalThis, 'WebSocket', previousWebSocket)
    else Reflect.deleteProperty(globalThis, 'WebSocket')
  }
})
