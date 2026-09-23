import { createHash } from 'node:crypto'
import IORedis from 'ioredis'
import type { PreviewFrame, PreviewSnapshot, RealtimeStore, RunIdentity } from '@lyyzka/lingxios'

const update = `
local previous = redis.call('GET', KEYS[1])
local old = previous and cjson.decode(previous) or nil
local incoming = cjson.decode(ARGV[1])
if old then
  if old.fence > incoming.fence or (old.fence == incoming.fence and old.owner ~= incoming.owner
    and not (old.cleared and incoming.kind == 'reset')) then return 'stale' end
  if old.fence == incoming.fence and (old.requestVersion > incoming.requestVersion or old.seq >= incoming.seq) then return 'stale' end
end
if ARGV[3] == '1' then
  if old then return 'stale' end
  incoming.draft = ARGV[2]
elseif incoming.kind == 'reset' then incoming.draft = ''
elseif old and not old.cleared and old.fence == incoming.fence and old.requestVersion == incoming.requestVersion
  and old.attemptId == incoming.attemptId and incoming.seq == old.seq + 1 then incoming.draft = old.draft .. incoming.text
else return 'missing' end
if string.len(incoming.draft) > 400000 then return 'stale' end
incoming.text = nil
incoming.kind = nil
redis.call('SET', KEYS[1], cjson.encode(incoming), 'PX', 60000)
redis.call('PUBLISH', KEYS[2], 'changed')
return 'applied'
`

const clear = `
local previous = redis.call('GET', KEYS[1])
if previous then
  local old = cjson.decode(previous)
  if old.owner == ARGV[1] and old.fence == tonumber(ARGV[2]) then
    old.draft = ''; old.cleared = true
    redis.call('SET', KEYS[1], cjson.encode(old), 'PX', 60000)
    redis.call('PUBLISH', KEYS[2], 'changed')
  end
end
return 1
`

function keys(identity: RunIdentity): [string, string] {
  const scope = [identity.tenantId, identity.agentId, identity.sessionId, identity.principalId ?? null, identity.threadId ?? null, identity.runId]
  const key = `lingxios:preview:${createHash('sha256').update(JSON.stringify(scope)).digest('hex')}`
  return [key, `${key}:changed`]
}

/** Dedicated nonpersistent Redis; never use the business Redis's AOF for body drafts. */
export function createRealtimeStore(url: string): RealtimeStore & { close(): void } {
  const options = { enableOfflineQueue: false, maxRetriesPerRequest: 0, commandTimeout: 200, connectTimeout: 1000,
    retryStrategy: () => 1000 }
  // The ready handler below owns retries and handles rejection during another disconnect.
  const client = new IORedis(url, options), subscriber = new IORedis(url, { ...options, enableReadyCheck: false, autoResubscribe: false })
  const listeners = new Map<string, Set<() => void>>()
  let unavailable = false
  const changed = () => { for (const group of listeners.values()) for (const wake of group) wake() }
  const failed = () => {
    if (!unavailable) console.warn('[lingxios] ephemeral preview store unavailable; durable replay remains active')
    unavailable = true; changed()
  }
  client.on('error', failed)
  subscriber.on('error', failed)
  client.on('ready', () => { unavailable = false; changed() })
  subscriber.on('ready', () => {
    if (listeners.size) void subscriber.subscribe(...listeners.keys()).then(changed, failed)
  })
  subscriber.on('message', channel => { for (const wake of listeners.get(channel) ?? []) wake() })
  return {
    async update(identity, owner, fence, frame: PreviewFrame, seed, signal) {
      signal.throwIfAborted()
      if (seed && (seed.draft.length > 100_000 || seed.runId !== identity.runId || seed.fence !== fence
        || seed.seq !== frame.seq || seed.attemptId !== frame.attemptId || seed.requestVersion !== frame.requestVersion)) throw new Error('invalid preview seed')
      return await client.eval(update, 2, ...keys(identity), JSON.stringify({ ...frame, owner, fence, runId: identity.runId }), seed?.draft ?? '', seed ? '1' : '0') as 'applied' | 'missing' | 'stale'
    },
    async read(identity, signal) {
      signal.throwIfAborted()
      const raw = await client.get(keys(identity)[0])
      if (!raw) return null
      const value = JSON.parse(raw) as PreviewSnapshot & { cleared?: boolean }
      if (value.cleared) return null
      if (value.runId !== identity.runId || typeof value.draft !== 'string' || value.draft.length > 100_000
        || !Number.isSafeInteger(value.fence) || value.fence < 1 || !Number.isSafeInteger(value.seq) || value.seq < 1
        || !Number.isSafeInteger(value.requestVersion) || value.requestVersion < 1
        || typeof value.attemptId !== 'string' || !value.attemptId || value.attemptId.length > 256) throw new Error('invalid shared preview')
      const { runId, fence, requestVersion, attemptId, seq, draft } = value
      return { runId, fence, requestVersion, attemptId, seq, draft }
    },
    async clear(identity, owner, fence, signal) {
      signal.throwIfAborted()
      await client.eval(clear, 2, ...keys(identity), owner, fence)
    },
    async subscribe(identity, wake, signal) {
      signal.throwIfAborted()
      const channel = keys(identity)[1]
      let group = listeners.get(channel)
      if (!group) { group = new Set(); listeners.set(channel, group) }
      group.add(wake)
      let closed = false
      const dispose = () => {
        if (closed) return
        closed = true; signal.removeEventListener('abort', dispose)
        group!.delete(wake)
        if (!group!.size && listeners.get(channel) === group) {
          listeners.delete(channel)
          // Enqueue immediately, before another reader can enqueue its SUBSCRIBE.
          void subscriber.unsubscribe(channel).catch(() => {})
        }
      }
      signal.addEventListener('abort', dispose, { once: true })
      try { await subscriber.subscribe(channel) }
      catch { /* The periodic snapshot read and ready handler repair missed subscriptions. */ }
      if (signal.aborted) dispose()
      return dispose
    },
    close() { listeners.clear(); client.disconnect(); subscriber.disconnect() },
  }
}
