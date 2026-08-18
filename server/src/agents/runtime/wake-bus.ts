/**
 * Wake-bus — server-side broker that routes wake events to the right
 * agent's long-running pod over SSE.
 *
 *   scheduler hears  CH_MESSAGE_NEW (Redis pubsub)
 *      ↓
 *   bus.deliver(agentId, event)              [publishes to cumora:wake:<agentId>]
 *      ↓
 *   server holding that agent's SSE          [subscribed to the channel]
 *      ↓
 *   each subscribed SSE response gets the event written as
 *      `event: wake\n`
 *      `data: {...}\n\n`
 *
 * Multi-instance: Redis pubsub. We subscribe to `cumora:wake:<agentId>`
 * the moment we get our first local SSE attach for that agent, and
 * unsubscribe when the last local SSE drops. `deliver` publishes; the
 * publish count tells the scheduler whether ANY server in the cluster
 * has a live pod for this agent — if 0, the agent is resting cluster-
 * wide and the orchestrator spins one up.
 *
 * Multiple subscribers per agent on the same server are allowed (the
 * agent's Pod may reconnect briefly during a rolling restart). Events
 * fan out to all live local subscribers; the Pod deduplicates by
 * event id (each event carries a fresh uuid).
 *
 * Single-instance deploys: this still works — the pub/sub round-trip
 * is local to the one Redis instance, so latency is sub-millisecond.
 */
import { randomUUID } from 'node:crypto'
import type { Response } from 'express'
import { redis, sub as redisSub } from '../../redis.js'

/** Discriminated union of all event types the bus carries.
 *
 *  `wake`  — historical: "you have new work; check your inbox." Pod
 *            triggers a turn (or schedules one after the current
 *            turn ends).
 *  `steer` — new (Phase 2 of the steering feature): "while you were
 *            in the middle of a turn, this specific message
 *            arrived; inject it as a user item at the next hop
 *            boundary." Payload carries the body + author so the
 *            pod's drain path can render the steer item without a
 *            DB round-trip. The message is ALSO in the messages
 *            table — that's the fallback path when the pod is
 *            idle / disconnected. */
export type WakeEvent = WakeEventBase & (WakeKindWake | WakeKindSteer)
type WakeEventPayload =
  | Omit<WakeEventBase & WakeKindWake, 'id' | 'at'>
  | Omit<WakeEventBase & WakeKindSteer, 'id' | 'at'>

interface WakeEventBase {
  /** Stable id so the Pod can dedupe across reconnect overlap. */
  id: string
  /** When the event was minted (server clock, ms since epoch). */
  at: number
}

/** Snapshot of a poll's state delivered alongside a `poll.updated` wake so
 *  the agent author can react in real time (watch, nudge, summarize)
 *  without first calling `cumora poll show`. Sized small — the agent can
 *  still fetch fuller voter details from the CLI when it cares. */
export interface PollWakeBrief {
  messageId: string
  conversationId: string
  question: string
  mode: 'single' | 'multi'
  status: 'open' | 'closed'
  /** Only meaningful when status === 'closed'. */
  closedReason: 'expired' | 'manual' | null
  expiresAt: string | null
  totalVotes: number
  /** Per-option count + voter display names. Texts are echoed from the
   *  poll payload so the agent can phrase nudges/summaries without
   *  cross-referencing option ids. */
  tallies: Array<{
    optionId: string
    text: string
    count: number
    voters: Array<{ id: string; name: string }>
  }>
  /** Conversation members who could vote but haven't yet. Excludes the
   *  author themselves. */
  pending: Array<{ id: string; name: string }>
  /** Who triggered this update. null when the server-side expiration
   *  sweeper closed the poll. */
  actor: { id: string | null; name: string | null }
  /** Discriminator the turn renderer uses to pick prompt language —
   *  'vote' for ongoing tallies, 'close' for terminal summary. */
  phase: 'vote' | 'close'
}

interface WakeKindWake {
  kind: 'wake'
  /** Why this agent was woken — for observability + debugging. */
  reason: 'message.new' | 'idle' | 'manual' | 'background_scan' | 'poll.updated'
  /** Optional conversation that triggered the wake. */
  conversationId?: string | null
  /** Short scheduler note rendered only for idle synthetic wakes. */
  idleReason?: string
  /** Server-side support-model triage note for ordinary message wakes. */
  triageNote?: string
  /** Internal background brief rendered as a normal model input. */
  backgroundBrief?: {
    title: string
    body: string
    source?: string
  }
  /** Set when reason === 'poll.updated'. Carries the current poll
   *  state so the turn renderer can paint a wake context without a
   *  separate DB round-trip. */
  pollBrief?: PollWakeBrief
}

interface WakeKindSteer {
  kind: 'steer'
  /** The conversation the steered message lives in. */
  conversationId: string
  /** messages.id — used by the pod for dedup against the queue and
   *  by the turn loop to advance conversation_reads on consume. */
  messageId: string
  /** Display name of the author. Embedded into the prompt prefix the
   *  model sees ("@alice: ..."), so DB-side ground truth is fine. */
  authorName: string
  /** The raw message body the model needs to see. */
  body: string
}

/** Per-agent Redis channel. Keep the prefix short — every PUBLISH
 *  command carries this on the wire. */
const CH_WAKE_PREFIX = 'cumora:wake:'

interface Subscriber {
  agentId: string
  res: Response
  /** Set when the response closes — used to drop from the bus. */
  closed: boolean
}

const subs = new Map<string, Set<Subscriber>>()

// Cap how much unsent SSE data we let queue per subscriber before we give up on
// it. A daemon that can't drain makes the HTTP response buffer in process memory;
// under a wake flood that grows unbounded → OOM. A backed-up subscriber gets
// dropped (it reconnects and re-drains the inbox, which is durable).
const SSE_MAX_BUFFERED_BYTES = 1 * 1024 * 1024 // 1 MB

function deliverTo(s: Subscriber, evt: WakeEvent): void {
  if (s.closed) return
  // Backpressure guard (OOM fix): if the socket's write queue is backed up the
  // client isn't keeping up — end the stream to reclaim the buffered memory
  // instead of piling more onto it. The wake is durable in the inbox, so the
  // daemon catches up on reconnect.
  const sock = s.res.socket
  if (sock && sock.writableLength > SSE_MAX_BUFFERED_BYTES) {
    s.closed = true
    try { s.res.end() } catch { /* ignore */ }
    return
  }
  try {
    s.res.write(`event: ${evt.kind}\n`)
    s.res.write(`id: ${evt.id}\n`)
    s.res.write(`data: ${JSON.stringify(evt)}\n\n`)
  } catch {
    // Write failed (client gone, broken pipe) — mark closed; the
    // 'close' handler installed in attachWakeStream will scrub.
    s.closed = true
  }
}

// ─── Redis subscriber: fan out cluster-wide wake events to local SSE ─

let redisSubscriberInstalled = false

function installRedisSubscriber(): void {
  if (redisSubscriberInstalled) return
  redisSubscriberInstalled = true
  redisSub.on('message', (channel, raw) => {
    if (!channel.startsWith(CH_WAKE_PREFIX)) return
    const agentId = channel.slice(CH_WAKE_PREFIX.length)
    const set = subs.get(agentId)
    if (!set || set.size === 0) return
    let evt: WakeEvent
    try { evt = JSON.parse(raw) as WakeEvent } catch { return }
    for (const s of set) deliverTo(s, evt)
  })
}

/**
 * Mint a wake event for one agent and publish it to the cluster.
 * Returns the number of subscribers Redis reported (i.e. how many
 * servers received the event). 0 means no Pod is connected anywhere
 * in the cluster — the caller can ensurePod to spin one up.
 */
export async function deliver(agentId: string, partial: WakeEventPayload): Promise<number> {
  // `partial` is the discriminated union minus the base fields. The
  // explicit spread + assign keeps TypeScript happy across both
  // branches without a cast.
  const evt = { ...partial, id: `${partial.kind}-${randomUUID()}`, at: Date.now() } as WakeEvent
  return redis.publish(CH_WAKE_PREFIX + agentId, JSON.stringify(evt))
}

/** Steer-flavoured deliver — typed wrapper so callers don't have to
 *  spell `kind: 'steer'` and we get full payload type-checking. The
 *  pod's SSE handler routes events by their `event:` line (the SSE
 *  field that mirrors `evt.kind`), so a wake-subscribed pod
 *  automatically receives steer events too — no separate channel /
 *  subscriber needed. */
export async function deliverSteer(
  agentId: string,
  payload: Omit<Extract<WakeEvent, { kind: 'steer' }>, 'id' | 'at' | 'kind'>,
): Promise<number> {
  return deliver(agentId, { kind: 'steer', ...payload })
}

/** Diagnostic — agent ids with at least one LOCAL live subscriber.
 *  Other servers in the cluster may also have subs; this is local view. */
export function listLocalSubscribedAgents(): string[] {
  const out: string[] = []
  for (const [id, set] of subs) {
    for (const s of set) if (!s.closed) { out.push(id); break }
  }
  return out
}

/**
 * Hook a long-poll SSE response onto the bus. Sends an immediate
 * `ready` event so the Pod knows the stream is alive, then keeps the
 * response open. Subscribes to the per-agent Redis channel iff this
 * is the first local sub for that agent.
 */
export async function attachWakeStream(agentId: string, res: Response): Promise<void> {
  installRedisSubscriber()

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')           // disable nginx buffering
  res.flushHeaders?.()

  let set = subs.get(agentId)
  if (!set) { set = new Set(); subs.set(agentId, set) }
  const isFirst = set.size === 0
  const s: Subscriber = { agentId, res, closed: false }
  set.add(s)

  // Subscribe to the Redis channel BEFORE we tell the Pod we're ready —
  // otherwise a wake that arrives during the gap is silently dropped
  // (the Pod's initial-drain catches it, but we'd rather not rely on
  // that fallback when avoidable).
  if (isFirst) {
    await redisSub.subscribe(CH_WAKE_PREFIX + agentId)
  }
  console.log(`[wake-bus] +sub ${agentId} (${set.size} local · redis-subscribed=${isFirst})`)

  res.write(`event: ready\ndata: {"agentId":"${agentId}","at":${Date.now()}}\n\n`)

  // SSE comment ping every 25s. Clients that idle out at 30s (some
  // proxies) stay alive.
  const ping = setInterval(() => {
    if (s.closed) return
    try { res.write(`: ping ${Date.now()}\n\n`) } catch { s.closed = true }
  }, 25_000)

  const cleanup = (): void => {
    if (s.closed && set!.has(s) === false) return     // re-entrant call guard
    s.closed = true
    clearInterval(ping)
    set!.delete(s)
    const last = set!.size === 0
    if (last) subs.delete(agentId)
    console.log(`[wake-bus] -sub ${agentId} (${set!.size} local · last=${last})`)
    if (last) {
      // Best-effort unsubscribe. If this throws (e.g. Redis briefly
      // unreachable) we'll have a stale subscription that fans out to
      // nothing; not a correctness issue, just a tiny leak. Fixed on
      // next attach for the same agent.
      void redisSub.unsubscribe(CH_WAKE_PREFIX + agentId).catch((e) => {
        console.warn(`[wake-bus] redis unsubscribe ${agentId} failed:`, e instanceof Error ? e.message : String(e))
      })
    }
  }
  res.on('close', cleanup)
  res.on('error', cleanup)
}
