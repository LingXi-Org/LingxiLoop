/**
 * triage-core — the PURE, dependency-free heart of inbox triage.
 *
 * It builds the cerebellum's prompt (instructions + input) and parses its JSON
 * verdict. It imports NOTHING with side effects (no LLM client, no env, no DB) —
 * only TYPES — so it can be bundled into the standalone BYOA daemon, which has
 * no server access and runs the SAME triage on its LOCAL small model instead of
 * a cloud call.
 *
 * AI-NATIVE PRINCIPLE: every DECISION here is made by the small model, never by
 * regex. There is NO regex that classifies message content ("is this a
 * greeting?", "is this @all?", "is this @me?") — those judgments belong to the
 * cerebellum. The only non-model short-circuit is "the inbox is empty" (there is
 * nothing to judge), which is a count, not a classification. The few regexes
 * that remain only PARSE THE MODEL'S OWN JSON answer (strip ``` fences, recover
 * fields from truncated output) — they read the decision, they don't make it.
 *
 * Two consumers share this core:
 *   - server `classifyInboxTriage` (cloud agents): build → cloud small model → parse.
 *   - BYOA daemon: server builds the request (it has DB), daemon runs its LOCAL
 *     small model on it and parses here. The big brain is NEVER spent on triage.
 */
import type { ContextRow, InboxRow, PersonaRow, WorklogEntry } from './runtime/client.js'

/** A COARSE routing hint the gate emits when actionable=true. It is NOT acted on
 *  by either consumer (the cloud turn and the BYOA daemon both let the big brain
 *  decide who/how in-turn by reading the room); it's kept as gate reasoning + a
 *  stable wire field, identical across cloud and BYOA:
 *   - 'me'        addressed specifically to this agent (direct / @mention).
 *   - 'each'      a per-agent task (greeting, count, vote, "everyone answer once").
 *   - 'one-of-us' the group needs ONE reply, not N (an open question). */
export type ResponseMode = 'me' | 'each' | 'one-of-us'

export interface InboxTriageVerdict {
  actionable: boolean
  reason: string
  promptNote: string
  /** A COARSE routing hint the gate produces (me / each / one-of-us). Neither the
   *  cloud turn nor the BYOA daemon ACTS on it — the big brain decides who/how
   *  in-turn by reading the room — but it's kept as part of the gate's reasoning
   *  and the wire shape, identical across cloud and BYOA. */
  responseMode?: ResponseMode
  source: 'empty-inbox' | 'system-only' | 'rate-limited' | 'loop-cap' | 'support-model' | 'support-model-local' | 'fail-open' | 'human-dm' | 'human-group' | 'dm-agent-engage' | 'calendar-due'
}

/** Parse a SYSTEM message's wire payload (the JSON envelope the server itself
 *  writes — calendar dispatches, relays, etc). This reads a wire FORMAT, it is
 *  not content classification; mirrors the cloud renderer's systemPayloadKind. */
function systemPayloadOf(raw: string): { kind?: unknown; assigneeId?: unknown; agentPrompt?: unknown; title?: unknown } | null {
  try { return JSON.parse(raw) as { kind?: unknown } } catch { return null }
}

/** Agent↔agent DM loop-check cadence. In a DM between two agents we ENGAGE by
 *  default (the agents should talk — never silence the exchange); we just don't
 *  pay the triage gate on EVERY message. Instead the cerebellum runs only once
 *  every N messages (by sequence) as a LOOP DETECTOR — if that periodic check
 *  finds a dead back-and-forth, it stops it. Saves triage cost without ever
 *  making an agent go unresponsive. Plain constant so triage-core stays
 *  dependency-free (no env). */
const DM_AGENT_TRIAGE_EVERY = 8

/** Active worklog claims (the authoritative "real work is happening here"
 *  signal), keyed by conversation_id. Gathered server-side (Redis peekWorklog,
 *  scopeKey = conversation_id — the same scope `cumora claim --in <convo>` uses)
 *  and fed into triage so the gate judges "is there OWNED work here?" from FACT,
 *  not by guessing intent from message wording. Empty/absent = no active claim. */
export type ClaimsByConvo = Record<string, WorklogEntry[]>

function convoHasClaim(claims: ClaimsByConvo | undefined, conversationId: string): boolean {
  return (claims?.[conversationId]?.length ?? 0) > 0
}

/** A built triage request: either an empty-inbox verdict (no input to judge, no
 *  model call), or the prompt strings to feed the small model. */
export interface TriageRequest {
  verdict?: InboxTriageVerdict
  instructions?: string
  input?: string
  /** Direction-aware fail mode for the daemon's LOCAL triage (model-call path
   *  only). TRUE when this wake is purely AGENT-to-AGENT (no human in the unread
   *  set): a triage FAILURE must then fail CLOSED (suppress), because failing
   *  open wakes the big brain on every flaky-local-model error and AMPLIFIES the
   *  very loop the gate exists to stop. A human in the unread set → FALSE (fail
   *  open; never leave a human hanging). */
  failClosed?: boolean
}

function compactMessages(rows: Array<InboxRow | ContextRow>): string {
  return rows.slice(-40).map((m) => {
    // is_unread / is_self / human_reacted_at are DB FIELDS (not content
    // classification) — surfaced as plain markers so the model can tell what is
    // new, which messages are its own, and where a human reacted (a human
    // watching the thread). The model alone decides what they mean for this turn.
    const unread = 'is_unread' in m && m.is_unread ? 'NEW ' : ''
    const reacted = 'human_reacted_at' in m && m.human_reacted_at ? 'HUMAN-REACTED ' : ''
    const self = 'is_self' in m && m.is_self ? '▸YOU ' : ''
    const convo = `${m.conversation_id} [${m.conversation_kind}]`
    const author = `${m.author_name} (${m.author_kind ?? 'unknown'})`
    const body = (m.kind === 'system' ? '[system]' : m.body).replace(/\s+/g, ' ').slice(0, 500)
    return `${unread}${reacted}${convo} #${m.sequence} ${self}${author}: ${body}`
  }).join('\n')
}

function parseResponseMode(v: unknown): ResponseMode | undefined {
  return v === 'me' || v === 'each' || v === 'one-of-us' ? v : undefined
}

const RATE_LIMIT_RE = /\b(429|503)\b|too many requests|rate.?limit|\bquota\b|resource_exhausted|usage limit|session limit|overloaded|insufficient_quota|service (temporarily )?unavailable/i

/** Is this error a rate-limit / quota / overload signal? Used to decide that a
 *  failed triage must FAIL-CLOSED (back off) instead of fail-open — escalating a
 *  rate-limited cheap call to the expensive big brain just burns more quota and
 *  trips ITS limit too. This classifies an ERROR string (infra), not message
 *  content — it makes no judgment about whether to reply. */
export function isRateLimited(errorText: string): boolean {
  return RATE_LIMIT_RE.test(errorText)
}

/** Pull the JSON object out of a model's raw text: tolerate ```json fences and
 *  any chatter before/after the object (a small local model is chattier than a
 *  json_object-constrained cloud call). This PARSES the model's answer — it does
 *  not make a triage decision. */
function extractJsonObject(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] : raw
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  return start >= 0 && end > start ? body.slice(start, end + 1) : body.trim()
}

export function parseTriage(raw: string): Omit<InboxTriageVerdict, 'source'> | null {
  try {
    const parsed = JSON.parse(extractJsonObject(raw)) as { actionable?: unknown; reason?: unknown; promptNote?: unknown; prompt_note?: unknown; responseMode?: unknown; response_mode?: unknown }
    if (typeof parsed.actionable !== 'boolean') return salvageTriage(raw)
    return {
      actionable: parsed.actionable,
      reason: String(parsed.reason ?? '').slice(0, 500),
      responseMode: parseResponseMode(parsed.responseMode ?? parsed.response_mode),
      promptNote: String(parsed.promptNote ?? parsed.prompt_note ?? '').slice(0, 1200),
    }
  } catch {
    // A chatty LOCAL small model can ramble a long "reason" until the JSON is
    // truncated (no closing brace/fence). Recover the model's own fields — this
    // is output parsing, not a triage decision.
    return salvageTriage(raw)
  }
}

function salvageTriage(raw: string): Omit<InboxTriageVerdict, 'source'> | null {
  const m = raw.match(/"actionable"\s*:\s*(true|false)/i)
  if (!m) return null
  const rm = raw.match(/"response_?mode"\s*:\s*"(me|each|one-of-us)"/i)
  const pn = raw.match(/"prompt_?note"\s*:\s*"((?:[^"\\]|\\.)*)"/i)
  return {
    actionable: m[1].toLowerCase() === 'true',
    reason: 'recovered from a partial/truncated triage output',
    responseMode: parseResponseMode(rm?.[1]),
    promptNote: pn ? pn[1].replace(/\\"/g, '"').slice(0, 1200) : '',
  }
}

/** Turn a parsed verdict into a final one: a verdict with NO promptNote is
 *  valid (the small model legitimately leaves it null when actionable=false —
 *  no reply, nothing to tell the big brain). Only synthesize a generic note
 *  when a reply IS warranted but the note came back empty. */
export function finalizeTriage(
  parsed: Omit<InboxTriageVerdict, 'source'>,
  source: InboxTriageVerdict['source'],
): InboxTriageVerdict {
  const promptNote = parsed.promptNote.trim() || (parsed.actionable
    ? 'Reply appropriately to the unread message addressed to you or the group.'
    : '')
  return { ...parsed, promptNote, source }
}

function buildTriageInstructions(personaName: string): string {
  // The cerebellum is the INTUITION brain and ONLY a gate: it judges actionable
  // yes/no and reads the room. It NEVER writes content, and it does NOT decide WHO
  // replies, HOW, or — for a relay/chain — who continues. The big brain decides all
  // of that in-turn, identically to the cloud pod-agent. Keeping the small brain a
  // pure gate saves tokens AND keeps it free of brittle, scenario-specific
  // classification — a SINGLE principle, no enumerated cases/games.
  return `You are Cumora's inbox triage cerebellum — a fast gate in front of teammate "${personaName}"'s expensive main brain. Each message shows its conversation kind ([direct]/[group]), whether it is NEW (unread), and "▸YOU" for this agent's own messages.

Your ONE job is to keep NOISE off the big brain — that is ALL you suppress. Decide with a single PRINCIPLE, never a checklist of cases:

- If a HUMAN is involved or waiting → actionable=true, ALWAYS. ANY message from a human in a conversation you're in — a DM, a group message, an @mention, a greeting, an emoji, a directive, a question, a complaint, a "thanks" — deserves engagement, no matter how short, how casual, whether it repeats an earlier message, or whether the thread looks "wound down". A human EMOJI REACTION (marked HUMAN-REACTED) is involvement too: a human reacting to the thread is a human watching it live — treat the activity as human-attended, not agent-only. A human reaching out to silence is the single worst failure. Also engage: a human-started activity still in motion, and genuine unfinished work assigned to you — which INCLUDES a peer agent directly asking YOU to decide or do something: any message that needs YOUR answer or action to move forward. That is work you owe, not a loop — actionable=true even though both of you are agents.

- The ONLY thing you suppress (actionable=false): the unread is purely AGENT-to-AGENT with NO authoritative open work behind it. Check "Open work state" in the input — an agent-only thread with NO active claim, where peers are just acking / agreeing / restating / trading open-ended "what do you think?", is exactly the noise you exist to suppress. Suppress it EVEN IF a peer's message is phrased as a question: an open-ended question with no claimed work and no human waiting does NOT obligate a reply — real teammates let such a thread wind down instead of ping-ponging forever. ENGAGE only when a human is involved/waiting, OR an active claim is present and your reply ADVANCES it, OR a peer is genuinely blocked on YOUR specific decision/action to move real work forward.

- When unsure, choose actionable=true. Err toward engaging; never leave a human hanging. You only GATE here — the big brain decides who replies, how, and how briefly by reading the room itself, so you don't need to.

Reply ONLY as strict JSON: {"actionable": boolean, "reason": "short factual reason", "promptNote": "one sentence telling the main brain what's needed (e.g. 'human said hi in a DM — greet them back warmly')"}.
Output ONLY the JSON object — no markdown fences, no text before or after. Keep "reason" to ONE short sentence.`
}

/** HIGH-tier backstop for a CLAIMED conversation (an active work claim = a
 *  game/activity/deliverable someone owns): real work governs its own end, so
 *  only a true runaway this high trips it. This is the belt-and-suspenders floor
 *  UNDER the AI layer — the small brain (fed the claim signal) is the primary,
 *  nuanced wind-down, but a 30/min rate floor only limits the RATE; a slow
 *  ping-pong never trips it and loops forever. Human attention (a message OR an
 *  emoji reaction) ALWAYS resets the count. Kept as a fixed value ON PURPOSE: it almost never fires on real
 *  claimed work, so a high constant is a fine last resort. Unclaimed threads use
 *  the SELF-SCALING floor below instead (no magic number). Computed from
 *  author_kind (a DB field), never content. REGRESSION GUARD: this backstop has
 *  been deleted twice "for AI-native elegance" and loops regressed — do NOT
 *  remove it. */
const HARD_LOOP_CAP = 20

/** Per-conversation state of the agent-only run since a human last SHOWED
 *  ATTENTION, from DB FIELDS (author_kind / author_id / human_reacted_at), never
 *  content: how many agent messages (`sinceHuman`) AND how many DISTINCT agents
 *  produced them (`agents`). The distinct-agent count is "one round" — the size
 *  of the self-scaling unclaimed floor: a run is a dead LOOP once it starts
 *  LAPPING (more messages than distinct agents = someone spoke twice), which
 *  scales with however many agents are actually present instead of a fixed number.
 *
 *  HUMAN ATTENTION = a human MESSAGE, a human EMOJI REACTION, **or** a human
 *  READING the conversation (conversation_reads). A reaction/read counts at ITS
 *  OWN timestamp, not any message's position: a human reacting 👀 to an old post
 *  or sitting in the room with the read cursor advancing is a human watching
 *  NOW. This is what keeps a human-spectated, agent-run activity (a game with an
 *  agent judge, a relay) alive — the human is present, just watching instead of
 *  typing — while a thread NOBODY human is watching still winds down at the same
 *  floors as before. Attention resets the count exactly like a human message
 *  always did. */
function agentRunByConvo(context: ContextRow[]): Map<string, { sinceHuman: number; sawHuman: boolean; agents: Set<string> }> {
  const rowsByConvo = new Map<string, ContextRow[]>()
  for (const m of context) {
    if (m.kind === 'system') continue
    const arr = rowsByConvo.get(m.conversation_id)
    if (arr) arr.push(m)
    else rowsByConvo.set(m.conversation_id, [m])
  }
  const perConvo = new Map<string, { sinceHuman: number; sawHuman: boolean; agents: Set<string> }>()
  for (const [convo, rows] of rowsByConvo) {
    // Order-based run, exactly as before: a human MESSAGE resets it in sequence.
    let runRows: ContextRow[] = []
    let sawHuman = false
    let lastAttentionAt = 0
    for (const m of rows) {
      if (m.author_kind === 'human') { runRows = []; sawHuman = true }
      else runRows.push(m)
      const reacted = m.human_reacted_at ? Date.parse(m.human_reacted_at) || 0 : 0
      if (reacted > lastAttentionAt) lastAttentionAt = reacted
      const read = m.human_last_read_at ? Date.parse(m.human_last_read_at) || 0 : 0
      if (read > lastAttentionAt) lastAttentionAt = read
    }
    // A human REACTION or READ shrinks the run by TIME: everything the run
    // accumulated up to that instant is human-witnessed — only what came after
    // still counts toward the floor. (With neither present this filter is a
    // no-op and the semantics are byte-identical to the original.)
    if (lastAttentionAt > 0) {
      sawHuman = true
      runRows = runRows.filter((m) => (Date.parse(m.created_at) || 0) > lastAttentionAt)
    }
    const agents = new Set<string>(runRows.map((m) => m.author_id))
    perConvo.set(convo, { sinceHuman: runRows.length, sawHuman, agents })
  }
  return perConvo
}

function threadWorkState(context: ContextRow[], claims: ClaimsByConvo): string {
  const lines: string[] = []
  for (const [convo, e] of agentRunByConvo(context)) {
    const held = claims[convo] ?? []
    // Surface a convo when the engage/suppress call is non-obvious: it has any
    // agent-only activity since the last human (a run exists) OR carries a claim.
    if (e.sinceHuman >= 1 || held.length > 0) {
      const claimStr = held.length > 0
        ? `ACTIVE CLAIM: ${held.map((c) => `"${c.subject}" (${c.agentId})`).join(', ')}`
        : 'no active claim'
      lines.push(`  ${convo}: ${e.sinceHuman} agent message(s) since a human last spoke, reacted, or read the room${e.sawHuman ? '' : ' (no human attention in view)'}; ${claimStr}`)
    }
  }
  return lines.join('\n')
}

function buildTriageInput(args: { agentId: string; persona: PersonaRow; inbox: InboxRow[]; context: ContextRow[]; claimsByConvo?: ClaimsByConvo; humanActiveInCompany?: boolean }): string {
  const workState = threadWorkState(args.context, args.claimsByConvo ?? {})
  return [
    `Agent: ${args.persona.name} (${args.agentId})`,
    `Role: ${args.persona.role ?? ''}`,
    // Supervision is a DB fact (read cursors), surfaced so the model knows a
    // human IS overseeing even threads where no human can ever appear.
    ...(args.humanActiveInCompany
      ? ['A human is actively watching this workspace right now (read activity within the last few minutes) — treat in-motion team activities as human-supervised even in rooms the human cannot join.']
      : []),
    '',
    'Unread inbox:',
    compactMessages(args.inbox),
    '',
    'Recent visible context:',
    compactMessages(args.context),
    ...(workState
      ? ['', 'Open work state — for conversations that have drifted agent-only (no human in between) or carry an active work claim. An ACTIVE CLAIM means a teammate owns real work here (a game/activity/deliverable in progress) — engage if your reply ADVANCES it; the task itself governs when it ends. An agent-only run with NO active claim, that is only acks / agreement / restating / open-ended "what do you think?", is a dead loop → actionable=false, EVEN IF the latest message is phrased as a question. This is overridden only when the latest message needs an answer or action from THIS agent (a direct request / your move), or a human is waiting:', workState]
      : []),
    '',
    // The word "json" MUST appear in the INPUT (not just `instructions`) or the
    // Responses API rejects `text.format: json_object` with a 400, which would
    // send every triage down the fail-open path and silently defeat the gate.
    'Respond ONLY with a single JSON object: {"actionable": boolean, "responseMode": "me"|"each"|"one-of-us"|null, "reason": string, "promptNote": string}.',
  ].join('\n')
}

/** Build the triage request. Non-model short-circuits: empty inbox, a
 *  system-only inbox, and the HARD loop cap (every unread thread has run
 *  agent-only past HARD_LOOP_CAP). Everything else — direct, @mention, @all,
 *  greeting, chatter, AND whether an agent-only run is a live game/task to
 *  continue vs a pointless loop to kill — is judged by the small model (see
 *  "Open work state", which feeds it the authoritative claim signal), the
 *  primary nuanced wind-down. The claim-aware loop cap sits UNDERNEATH it as a
 *  deterministic backstop: a 30/min rate floor limits the RATE but never STOPS a
 *  slow loop, so the count cap halts a runaway the model failed to end. The cap
 *  is two-tier — high for a claimed thread, low for unclaimed chatter. */
export function buildTriageRequest(args: {
  agentId: string
  persona: PersonaRow
  inbox: InboxRow[]
  context: ContextRow[]
  /** Active worklog claims per conversation (the "real work here" signal).
   *  Gathered server-side; absent = treat every convo as unclaimed. */
  claimsByConvo?: ClaimsByConvo
  /** Is a HUMAN actively watching this company right now (read activity anywhere
   *  in the company within ~10 min)? The SUPERVISION signal, gathered
   *  server-side (see InprocClient.humanRecentlyActive). Some rooms of a
   *  legitimate activity exclude the human BY THE ACTIVITY'S OWN RULES (a
   *  werewolf wolf-DM, a hidden-role channel) — per-thread attention can never
   *  appear there. While a human supervises the workspace, agent-only threads
   *  use the HIGH backstop (HARD_LOOP_CAP) instead of the lap floor; a true
   *  runaway still dies at the cap, and when the human leaves, everything
   *  reverts to the strict floors. Absent = false (strict). */
  humanActiveInCompany?: boolean
}): TriageRequest {
  if (args.inbox.length === 0) {
    return {
      verdict: {
        actionable: false,
        reason: 'inbox empty',
        promptNote: 'Small-brain inbox triage: inbox is empty; do not reply unless you independently find new unread work.',
        source: 'empty-inbox',
      },
    }
  }
  // A due CALENDAR dispatch addressed to THIS agent is NOT system noise — it is
  // a SELF-SCHEDULED ALARM: an agent explicitly asked to be woken at this time,
  // usually with a prompt for future-self ("tally the vote", "close the
  // phase"). Without this exception the system-only gate below swallows every
  // alarm, so a BYOA judge who says "vote closes in 2 minutes" can never wake
  // itself on time — measured as multi-minute dead-air at every werewolf phase
  // boundary. Deterministic wire-format check (the server wrote this JSON),
  // not content classification. Alarms assigned to OTHER agents still fall
  // through to the system-only gate (only the assignee should wake).
  const dueAlarm = args.inbox.find((m) => {
    if (m.kind !== 'system') return false
    const p = systemPayloadOf(m.body)
    if (!p || p.kind !== 'calendar_event') return false
    return !p.assigneeId || p.assigneeId === args.agentId
  })
  if (dueAlarm) {
    const p = systemPayloadOf(dueAlarm.body)
    const note = [p?.title, p?.agentPrompt].filter((x): x is string => typeof x === 'string' && x.length > 0).join(' — ')
    return {
      verdict: {
        actionable: true,
        reason: 'calendar alarm due — a self-scheduled wake for this agent',
        promptNote: note ? `Your scheduled alarm fired: ${note}` : 'Your scheduled calendar alarm fired — do what future-you planned.',
        source: 'calendar-due',
      },
    }
  }
  // System-only inbox: relays, status pings, membership notices — informational,
  // NOT a task. Spend NO model (small OR big) on these. Deterministic backstop,
  // same class as an empty inbox. This is what stops a recurring/unacked system
  // message from sailing past the empty-inbox check (length > 0) AND the loop cap
  // (which filters out system messages, so it never fires) straight into the small
  // model — which, being stateless, escalates it to the big brain on every poll.
  // That was the "stale-wake storm": opus woken every ~20s to read an inbox the
  // engine itself reports empty. The big brain is for real human/agent content only.
  if (args.inbox.every((m) => m.kind === 'system')) {
    return {
      verdict: {
        actionable: false,
        reason: 'system-only inbox (no human/agent message) — informational, not a task',
        promptNote: '',
        source: 'system-only',
      },
    }
  }
  const realUnread = args.inbox.filter((m) => m.kind !== 'system')
  // A HUMAN message is sacred — DM *or* group: NEVER gate it. The cerebellum's own
  // contract is "if a human is involved → actionable=true, ALWAYS"; against a human
  // message the gate can only ever answer "yes". The one extra it yields is the
  // responseMode hint (each / one-of-us), and NEITHER consumer acts on it — the big
  // brain decides who/how/whether-to-stay-silent by reading the room. So paying the
  // gate on a human message spends a small-model call + its full latency to compute
  // an answer we already know. Skip it and wake the big brain directly. For a group
  // @all this removes ONE redundant gate spawn per agent (7 on the counting-game
  // opener) and their latency; it is also strictly SAFER — a misbehaving gate can no
  // longer drop a human on the floor. Big-brain spend is unchanged (the gate said
  // yes anyway); only the gate's own cost + latency go away. Reaching the big brain
  // is NOT the same as replying: the standing GLANCE_YIELD_RULES still make an agent
  // yield / stay silent when the human named someone else. (A DM keeps its own note
  // so 1:1s never read as "maybe not yours".)
  const humanUnread = realUnread.filter((m) => m.author_kind === 'human')
  if (humanUnread.length > 0) {
    const anyDm = humanUnread.some((m) => m.conversation_kind === 'direct')
    return {
      verdict: {
        actionable: true,
        reason: anyDm ? 'human DM — always engage, no triage gate' : 'human message in group — always engage, no triage gate',
        promptNote: anyDm
          ? 'A human messaged you directly — reply to them.'
          : 'A human posted to the group — read the room and respond if it is yours to answer.',
        source: anyDm ? 'human-dm' : 'human-group',
      },
    }
  }
  // Agent↔agent DM: the agents SHOULD talk, so ENGAGE by default — reply, and do
  // NOT spend the cerebellum on every message (that only burns triage). The gate
  // runs only PERIODICALLY (every Nth message, by sequence) purely as a dead-loop
  // detector: at a checkpoint we fall through to the cerebellum, which can end a
  // pointless back-and-forth; between checkpoints we just reply. Never silences a
  // responsive exchange (making an agent go quiet to a teammate is a bug); runaway
  // cost is still bounded by the per-minute activation rate floor (server-side).
  if (realUnread.length > 0 && realUnread.every((m) => m.conversation_kind === 'direct' && m.author_kind === 'agent')) {
    const latestSeq = realUnread.reduce((mx, m) => Math.max(mx, m.sequence), 0)
    if (latestSeq % DM_AGENT_TRIAGE_EVERY !== 0) {
      return {
        verdict: {
          actionable: true,
          reason: `agent↔agent DM — engage (loop-check runs every ${DM_AGENT_TRIAGE_EVERY} msgs; this one is between checks)`,
          promptNote: 'Reply to your teammate in this DM.',
          source: 'dm-agent-engage',
        },
      }
    }
    // At a loop checkpoint → fall through to the cerebellum, which can stop a dead loop.
  }
  // HARD loop cap (deterministic, no model): if EVERY unread conversation has run
  // agent-only past the cap, STOP — human attention (message or reaction) resets
  // it. The small brain's
  // "thread heat" judgment is the primary wind-down (it distinguishes a live
  // human-started game/relay from a dead ack/ping-pong), but it SOMETIMES won't
  // stop, and the 30/min rate floor only limits the RATE — a slow ping-pong loops
  // forever under it. This count cap is the backstop that halts a runaway anyway.
  // Set high (≈4 rounds for a 4-agent team) so a legitimate multi-round game has
  // almost always finished or drawn a human back in before it fires. Computed
  // from author_kind (a DB field), never from content.
  const runs = agentRunByConvo(args.context)
  const unreadConvos = [...new Set(args.inbox.filter((m) => m.kind !== 'system').map((m) => m.conversation_id))]
  // Claim-aware, SELF-SCALING floor (no magic number for the common case):
  //  - CLAIMED convo → the fixed HIGH backstop (HARD_LOOP_CAP): real owned work
  //    runs to its own end; only a true runaway this high trips it.
  //  - UNCLAIMED convo → suppress once the agent-only run is LAPPING: more
  //    messages than DISTINCT agents since the last human (someone spoke a 2nd
  //    time → a full round completed and it's now repeating, with no claim and no
  //    human). "One round" = however many agents are actually here, so the floor
  //    scales with team size instead of a constant — which is exactly what the
  //    old fixed cap kept getting wrong (a constant < team size killed real
  //    games; a constant > chatter let loops run). The small brain (fed the same
  //    claim signal) is still the primary wind-down; this only catches a runaway.
  //  - SUPERVISED workspace (humanActiveInCompany) → the HIGH backstop for
  //    agent-only threads too: an activity can legitimately run in side rooms
  //    the human is excluded from by the activity's own rules (a werewolf
  //    wolf-DM room), so per-thread attention can never appear there — but a
  //    human actively reading the company IS overseeing the team. Presence
  //    elevates the floor, never removes it: a runaway still dies at the cap,
  //    and when the human leaves, the strict lap floor comes back.
  // Suppress deterministically only when EVERY unread convo is past its floor.
  const pastFloor = (c: string): boolean => {
    const e = runs.get(c)
    const since = e?.sinceHuman ?? 0
    if (convoHasClaim(args.claimsByConvo, c)) return since >= HARD_LOOP_CAP
    if (args.humanActiveInCompany) return since >= HARD_LOOP_CAP
    return since > (e?.agents.size ?? 0)
  }
  if (unreadConvos.length > 0 && unreadConvos.every(pastFloor)) {
    return {
      verdict: {
        actionable: false,
        reason: 'loop cap: every unread thread is a lapping agent-only run (or a claimed/supervised thread past the high backstop) with no human attention (message, reaction, or read) — staying silent until a human re-engages',
        promptNote: '',
        source: 'loop-cap',
      },
    }
  }
  return {
    instructions: buildTriageInstructions(args.persona.name),
    input: buildTriageInput(args),
    // Purely agent-to-agent wake (no human in the unread set) → the daemon's
    // LOCAL triage fails CLOSED on error (a flaky local model must not amplify
    // the loop); a human present → fail open (never leave a human hanging).
    failClosed: !args.inbox.some((m) => m.kind !== 'system' && m.author_kind === 'human'),
  }
}
