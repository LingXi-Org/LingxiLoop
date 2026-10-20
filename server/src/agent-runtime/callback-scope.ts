import type { DeliveryContext } from '@lyyzka/lingxios'
import type { Pool, PoolClient } from 'pg'
import type { Queryable } from '../db/queryable.js'

export interface CallbackScope {
  database: Queryable
  signal: AbortSignal
  deadlineAt: string
}
type Context = Pick<DeliveryContext, 'signal' | 'deadlineAt'> | undefined

/** One shared admission gate for product callbacks, not one gate per outbox lane.
 * A session stays owned through IM's advisory lock and durable pre-send marker;
 * the callback itself is deliberately NOT wrapped in a transaction. */
export function createCallbackRunner(pool: Pool, options: { concurrency?: number; timeoutMs?: number; connectionsPerCallback?: number } = {}) {
  const connections = options.connectionsPerCallback ?? 1
  const concurrency = Math.min(options.concurrency ?? 2, Math.max(0, Math.floor(((pool.options.max ?? 10) - 1) / connections)))
  const timeoutMs = options.timeoutMs ?? 10_000
  if (!Number.isSafeInteger(connections) || connections < 1 || !Number.isSafeInteger(concurrency) || concurrency < 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Invalid callback budget')
  }
  let active = 0, acquiring = 0
  const queue: Array<() => void> = []
  const availabilityWaiters = new Set<() => void>()
  async function enter(signal: AbortSignal): Promise<() => void> {
    signal.throwIfAborted()
    if (!concurrency) throw new Error('Database pool has no reserved callback capacity')
    await new Promise<void>((resolve, reject) => {
      const abort = () => { const index = queue.indexOf(start); if (index >= 0) queue.splice(index, 1); reject(signal.reason) }
      const start = () => { signal.removeEventListener('abort', abort); active++; resolve() }
      if (active < concurrency) start()
      else { queue.push(start); signal.addEventListener('abort', abort, { once: true }) }
    })
    let released = false
    return () => { if (released) return; released = true; active--; queue.shift()?.() }
  }
  // pg has no public cancellation for a queued pool.connect(). Wait outside its
  // queue, preserving existing foreground waiters. A handshake already started
  // is bounded by the pool's connectionTimeoutMillis and destroyed on late arrival.
  async function available(signal: AbortSignal): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let done = false
      const check = () => {
        if (done) return
        if (signal.aborted) { finish(); reject(signal.reason) }
        else if (!pool.waitingCount && pool.idleCount + (pool.options.max ?? 10) - pool.totalCount - acquiring > 0) {
          acquiring++; finish(); resolve()
        }
      }
      const wake = () => { queueMicrotask(check) }
      const finish = () => {
        done = true
        availabilityWaiters.delete(check)
        pool.off('release', wake); pool.off('remove', wake); pool.off('connect', wake)
        signal.removeEventListener('abort', check)
      }
      pool.on('release', wake); pool.on('remove', wake); pool.on('connect', wake)
      availabilityWaiters.add(check)
      signal.addEventListener('abort', check, { once: true }); check()
    })
  }
  return async function run<T>(context: Context, work: (scope: CallbackScope) => Promise<T>): Promise<T> {
    const externalDeadline = context ? Date.parse(context.deadlineAt) : Infinity
    if (Number.isNaN(externalDeadline)) throw new Error('Invalid callback deadline')
    const deadline = Math.min(externalDeadline, Date.now() + timeoutMs)
    const controller = new AbortController()
    const signal = context ? AbortSignal.any([context.signal, controller.signal]) : controller.signal
    const expire = () => controller.abort(new DOMException('Product callback deadline exceeded', 'TimeoutError'))
    const timer = setTimeout(expire, Math.max(0, deadline - Date.now()))
    if (deadline <= Date.now()) expire()
    let leave: (() => void) | undefined, client: PoolClient | undefined
    let pendingAcquire: Promise<PoolClient> | undefined, acquireFinished = false
    let closed = false, released = false, inFlight = 0, transaction = false
    const destroy = () => {
      closed = true
      if (client && !released) { released = true; client.release(true) }
    }
    const error = (cause: Error) => { controller.abort(cause); destroy() }
    const check = () => {
      if (Date.now() >= deadline) expire()
      signal.throwIfAborted()
      if (closed) throw new Error('Product callback scope is closed')
    }
    try {
      leave = await enter(signal)
      await available(signal)
      pendingAcquire = pool.connect().finally(() => {
        acquiring--; acquireFinished = true
        for (const wake of availabilityWaiters) queueMicrotask(wake)
      })
      client = await new Promise<PoolClient>((resolve, reject) => {
        const abort = () => reject(signal.reason)
        signal.addEventListener('abort', abort, { once: true })
        void pendingAcquire!.then(value => {
          signal.removeEventListener('abort', abort)
          if (signal.aborted) { value.release(true); reject(signal.reason) }
          else resolve(value)
        }, cause => { signal.removeEventListener('abort', abort); reject(cause) })
        if (signal.aborted) abort()
      })
      client.on('error', error)
      signal.addEventListener('abort', destroy, { once: true })
      check()
      const settings = (await client.query<{ name: string; setting: string }>(
        "SELECT name,setting FROM pg_settings WHERE name IN ('statement_timeout','client_connection_check_interval')")).rows
      const statementTimeout = settings.find(setting => setting.name === 'statement_timeout')?.setting
      const connectionInterval = settings.find(setting => setting.name === 'client_connection_check_interval')?.setting
      if (statementTimeout === undefined || connectionInterval === undefined) throw new Error('PostgreSQL callback cancellation settings unavailable')
      // Socket destruction alone does not interrupt a PostgreSQL lock wait.
      // Scope-only polling notices disconnects; the statement deadline also
      // covers a stalled JavaScript event loop. Restore settings before reuse.
      await client.query("SELECT set_config('client_connection_check_interval',$1,false)",
        [String(Number(connectionInterval) > 0 ? Math.min(Number(connectionInterval), 100) : 100)])
      check()
      let tail: Promise<unknown> = Promise.resolve()
      const query: Queryable['query'] = (text, params) => {
        try { check() } catch (cause) { return Promise.reject(cause) }
        inFlight++
        // ACL/repository Promise.all is supported, but SET + SQL is one queue
        // entry: another query cannot overwrite its deadline between them.
        const pending = tail.then(async () => {
          check()
          const remaining = Math.max(1, deadline - Date.now())
          await client!.query("SELECT set_config('statement_timeout',$1,false)",
            [String(Number(statementTimeout) > 0 ? Math.min(Number(statementTimeout), remaining) : remaining)])
          check()
          const result = await client!.query(text, params ? [...params] : undefined)
          if (/^\s*BEGIN\b/i.test(text)) transaction = true
          if (/^\s*(COMMIT|ROLLBACK)\s*;?\s*$/i.test(text)) transaction = false
          check() // a completed write with a lost acknowledgement is not success
          return result
        }).finally(() => { inFlight-- })
        tail = pending.catch(() => undefined)
        return pending
      }
      const result = await work({ database: { query }, signal, deadlineAt: new Date(deadline).toISOString() })
      check()
      if (inFlight || transaction) throw new Error('Product callback returned with unfinished database work')
      await client.query("SELECT set_config('statement_timeout',$1,false),set_config('client_connection_check_interval',$2,false)", [statementTimeout, connectionInterval])
      check()
      return result
    } catch (cause) {
      // Destroy on every callback failure: an open transaction/session advisory
      // lock must never escape into the foreground pool after a failed callback.
      destroy()
      throw signal.aborted ? signal.reason : cause
    } finally {
      closed = true
      clearTimeout(timer)
      signal.removeEventListener('abort', destroy)
      if (client && !released) { released = true; client.release() }
      client?.off('error', error)
      if (pendingAcquire && !acquireFinished) {
        // Keep admission occupied until the bounded pg handshake settles, so a
        // cancellation storm cannot create unbounded in-progress connections.
        const finish = leave
        void pendingAcquire.then(() => finish?.(), () => finish?.())
      } else leave?.()
    }
  }
}
