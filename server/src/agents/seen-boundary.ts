/**
 * Per-(agent, conversation) "seen seq" boundary tracking, stored in Redis with
 * short TTL. Used by `lingxiloop reply`'s freshness preflight to detect when a
 * peer posted in this conversation DURING the agent's triage+compose window,
 * so the second sender's INSERT gets HELD instead of colliding (e.g. Iris and
 * Marcus both posting "3" in a counting game).
 *
 * Why Redis and NOT conversation_reads.last_read_at:
 *   - a6e69aa tried it in `conversation_reads` and broke loadInbox: the same
 *     row's `last_read_at` is loadInbox's SELECT cursor; bumping it to NOW()
 *     made the next loadInbox return empty, daemons hung silent-busy. Anything
 *     that shares state with the inbox cursor is structurally unsafe.
 *   - Redis is OUTSIDE the DB transaction graph — no row locks, no contention
 *     with the inbox query. Atomic Lua keeps the monotonic update race-free.
 *   - TTL=10min auto-cleans; no schema change, no migration, no growth.
 * Redis is a required coordination dependency. Redis failures propagate to
 * the caller so freshness guarantees cannot silently disappear.
 */
import { redis } from '../redis.js'

const TTL_SECONDS = 600 // 10 minutes — well over any plausible compose window
const KEY_PREFIX = 'lingxiloop:seen'

function key(agentId: string, conversationId: string): string {
  return `${KEY_PREFIX}:${agentId}:${conversationId}`
}

// Atomic monotonic SET: set key=ARGV[1] IFF ARGV[1] > current (or key absent),
// refreshing TTL on each successful set. The Lua keeps GET+SET race-free, so
// two concurrent callers racing to record different seqs always converge on
// the higher value (never regresses).
const MONOTONIC_SET_SCRIPT = `
local cur = tonumber(redis.call('GET', KEYS[1])) or 0
local newv = tonumber(ARGV[1]) or 0
if newv > cur then
  redis.call('SET', KEYS[1], newv, 'EX', ARGV[2])
  return 1
end
return 0
`

/** Record that this agent has been SHOWN messages up to (at least) `seq` in
 *  this conversation. Idempotent / monotonic: never regresses, always
 *  refreshes TTL on a higher-or-equal advance. */
export async function recordSeen(agentId: string, conversationId: string, seq: number): Promise<void> {
  if (!agentId || !conversationId) return
  if (!Number.isFinite(seq) || seq <= 0) return
  await redis.eval(MONOTONIC_SET_SCRIPT, 1, key(agentId, conversationId), String(seq), String(TTL_SECONDS))
}

/** Read the high-water seq this agent has been SHOWN in this conversation.
 *  Returns 0 only when the key is unset or expired. */
export async function getSeen(agentId: string, conversationId: string): Promise<number> {
  if (!agentId || !conversationId) return 0
  const v = await redis.get(key(agentId, conversationId))
  const n = v ? Number(v) : 0
  return Number.isFinite(n) && n > 0 ? n : 0
}

// ─── Compose anchor (turn-start timestamp) ────────────────────────────────
//
// The freshness preflight above uses `recordSeen` / `getSeen`, which advance
// every time the agent runs `lingxiloop messages` or `lingxiloop glance`. That broke
// in one observed collision: two agents woke on the same boundary, agent B
// glanced AFTER agent A posted → glance advanced B's seen-baseline PAST A's
// new post → preflight saw "nothing newer" → B's stale draft slipped
// through, producing a same-content duplicate (the 光-光 case).
//
// The compose anchor pins the "world state when THIS turn started" by
// timestamp, INDEPENDENT of any subsequent glance/messages calls. The
// preflight compares authoritative WuKong sequence/time — so anything a peer
// posted while we were composing trips a HOLD even if we later glanced and
// "absorbed" it into the seen-baseline.
//
// Lifecycle: daemon writes at turn START; cli.cmdReply reads on preflight;
// cleared on successful post (or TTL — same 10min as seen).

const ANCHOR_PREFIX = 'lingxiloop:compose-anchor'

function anchorKey(agentId: string, conversationId: string): string {
  return `${ANCHOR_PREFIX}:${agentId}:${conversationId}`
}

/** Stamp the moment this agent's current compose started, for the freshness
 *  preflight to compare against at post time. OVERWRITES — every turn START
 *  is a fresh anchor (unlike `recordSeen`, which is monotonic). */
export async function recordComposeAnchor(agentId: string, conversationId: string, tsMs: number): Promise<void> {
  if (!agentId || !conversationId) return
  if (!Number.isFinite(tsMs) || tsMs <= 0) return
  await redis.set(anchorKey(agentId, conversationId), String(Math.floor(tsMs)), 'EX', TTL_SECONDS)
}

/** Read the compose anchor (unix-ms) for this agent+convo. Returns 0 when
 *  unset or expired, which selects the seen-baseline path. */
export async function getComposeAnchor(agentId: string, conversationId: string): Promise<number> {
  if (!agentId || !conversationId) return 0
  const v = await redis.get(anchorKey(agentId, conversationId))
  const n = v ? Number(v) : 0
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Clear the compose anchor after the agent successfully posts in this
 *  conversation. TTL handles the leak case if this never runs. */
export async function clearComposeAnchor(agentId: string, conversationId: string): Promise<void> {
  if (!agentId || !conversationId) return
  await redis.del(anchorKey(agentId, conversationId))
}

// ─── Hold token (HELD-acknowledgement gate for override flags) ────────────
//
// `--send-anyway` (lingxiloop reply) and `--force` (doc/calendar create) exist so
// an agent that WAS held can re-commit after reviewing the held context.
// Agents learned to pass the flag PREEMPTIVELY to save a round-trip, which
// turns the server-side gate into a no-op — the 2026-06-11/12 double-
// deliverable incidents (two agents each posting the full story; two
// 《第七天的猫》 docs) both shipped through a preemptive bypass. The hold
// token makes the override flag an ACKNOWLEDGEMENT instead of a free pass:
// the server records a token whenever it returns a HELD envelope, and the
// flag is honored only while a token exists (then consumed). An agent that
// never saw a HOLD gets the normal preflight no matter what flags it passes.
//
// Same Redis-only posture as the rest of this file, with one inversion:
// consumeHold fails OPEN to armed — if Redis is down we honor the flag
// rather than block real work (worst case is today's behavior).
//
// Lifecycle (tightened after the 2026-07-08 counting-game dup): a token is
// an acknowledgement of ONE specific shown state, valid for one immediate
// re-run. It must NOT outlive its moment, so it dies on the FIRST of:
//   - consumption (the re-run, GET+DEL atomic)
//   - the turn ending (`unmarkThinking` clears reply:* for the turn's convos)
//   - the agent acking the conversation (yield path — Saga banked a token
//     by yielding after a HOLD, and a LATER turn's preemptive --send-anyway
//     consumed it to ship a stale duplicate)
//   - a short TTL (crash backstop)
// AND, for reply scopes, the token carries the max peer seq the HELD
// envelope showed — cmdReply re-verifies at consume time that the room has
// not moved past it (see cli.ts), so even a same-turn acknowledgement can't
// sail past messages the agent was never shown.

const HOLD_TTL_SECONDS = 120 // a HELD acknowledgement is only meaningful in
// the same breath as the HELD itself: HELD → re-read → re-run is seconds,
// not minutes. Long TTLs turn yielded holds into future bypass ammunition.

const HOLD_PREFIX = 'lingxiloop:held'

function holdKey(agentId: string, scope: string): string {
  return `${HOLD_PREFIX}:${agentId}:${scope}`
}

// GET+DEL in one atomic step so two racing override attempts can't both
// consume the same acknowledgement. Returns the stored value (string) or
// false when absent.
const CONSUME_SCRIPT = `
local v = redis.call('GET', KEYS[1])
if v then
  redis.call('DEL', KEYS[1])
  return v
end
return false
`

/** What a consumed hold token acknowledges. */
export interface HoldAcknowledgement {
  /** A token existed, so the override flag is armed. */
  armed: boolean
  /** The highest peer WuKong sequence the HELD envelope showed the agent,
   *  when the recording gate knew it (reply preflight). null = armed without
   *  state info (doc/calendar title scopes) — the caller cannot perform a
   *  sequence staleness check. */
  heldUpToSeq: number | null
}

/** Record that a HELD envelope was just shown to this agent for `scope`
 *  (e.g. `reply:<convoId>`, `doc-create:<normalized title>`). For reply
 *  scopes pass `heldUpToSeq` — the max peer sequence the envelope showed —
 *  so consumption can verify the acknowledgement is still current. */
export async function recordHold(agentId: string, scope: string, heldUpToSeq?: number): Promise<void> {
  if (!agentId || !scope) return
  // 'seq:<n>' when the gate knew the shown high-water seq; bare '1' when it
  // didn't (doc/calendar title scopes) — prefixed so a real seq of 1 can't
  // collide with the no-seq sentinel.
  const value = Number.isFinite(heldUpToSeq) && (heldUpToSeq as number) > 0
    ? `seq:${Math.floor(heldUpToSeq as number)}`
    : '1'
  await redis.set(holdKey(agentId, scope), value, 'EX', HOLD_TTL_SECONDS)
}

/** Consume (read + delete) the hold token for this agent+scope. `armed`
 *  says whether the agent has actually been shown a HELD envelope it can
 *  now acknowledge; `heldUpToSeq` is the state that envelope showed (when
 *  recorded with one). Redis failures reject the command. */
export async function consumeHold(agentId: string, scope: string): Promise<HoldAcknowledgement> {
  if (!agentId || !scope) return { armed: false, heldUpToSeq: null }
  const r = await redis.eval(CONSUME_SCRIPT, 1, holdKey(agentId, scope))
  if (typeof r !== 'string' && typeof r !== 'number') return { armed: false, heldUpToSeq: null }
  const m = /^seq:(\d+)$/.exec(String(r))
  const seq = m ? Number(m[1]) : NaN
  return { armed: true, heldUpToSeq: Number.isFinite(seq) && seq > 0 ? seq : null }
}

/** Drop a lingering hold token after the agent successfully committed
 *  without needing the override — a stale token must not arm a later
 *  preemptive bypass. TTL covers the leak case. */
export async function clearHold(agentId: string, scope: string): Promise<void> {
  if (!agentId || !scope) return
  await redis.del(holdKey(agentId, scope))
}
