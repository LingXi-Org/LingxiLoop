import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTriageRequest, parseTriage, finalizeTriage, isRateLimited } from '../agents/triage-core.js'
import type { ContextRow, InboxRow, PersonaRow } from '../agents/runtime/client.js'

const PERSONA: PersonaRow = { id: 'atlas-1234', name: 'Atlas', role: 'Ops', style: 'Short.', model: null, companyId: 'co-1' }

function inboxRow(o: Partial<InboxRow> = {}): InboxRow {
  return {
    id: 'm-1', conversation_id: 'allhands-1', company_id: 'co-1', conversation_title: 'All hands',
    conversation_kind: 'group', conversation_topic: null, author_id: 'human-1', author_kind: 'human', author_name: 'Yetone',
    body: 'hello @all', kind: 'text', sequence: 1, created_at: '2026-05-26T10:00:00Z',
    attachment: null, quoted_message_id: null, quoted: null, ...o,
  }
}
function contextRow(o: Partial<ContextRow> = {}): ContextRow {
  return { ...inboxRow(o), is_unread: true, is_self: false, conversation_topic: null, project_name: null, reactions: [], ...o }
}

test('buildTriageRequest: empty inbox → verdict, no model (nothing to judge — not a classification)', () => {
  const req = buildTriageRequest({ agentId: PERSONA.id, persona: PERSONA, inbox: [], context: [] })
  assert.equal(req.verdict?.actionable, false)
  assert.equal(req.verdict?.source, 'empty-inbox')
  assert.equal(req.instructions, undefined)
})

test('buildTriageRequest: system-only inbox → verdict, no model (informational, not a task — never wake the big brain)', () => {
  // A recurring/unacked system message (relay, status, membership notice) must
  // NOT escalate to a model. It sails past the empty-inbox check (length > 0)
  // and the loop cap (which filters out system rows), so without this short-
  // circuit it reaches the small model, which escalates it to opus on every
  // poll — the "stale-wake storm". The big brain is for real content only.
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [
      inboxRow({ kind: 'system', body: 'Atlas joined the group' }),
      inboxRow({ kind: 'system', body: 'status: online', sequence: 2 }),
    ],
    context: [],
  })
  assert.equal(req.verdict?.actionable, false)
  assert.equal(req.verdict?.source, 'system-only')
  assert.equal(req.instructions, undefined)
})

test('buildTriageRequest: a due CALENDAR alarm assigned to ME is actionable — a self-scheduled wake, not system noise', () => {
  const alarm = JSON.stringify({ kind: 'calendar_event', eventId: 'ce-1', title: 'D1 投票截止', agentPrompt: '结算当前票并进入黑夜', assigneeId: PERSONA.id })
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow({ kind: 'system', body: alarm, author_kind: null as never, author_id: 'calendar' })],
    context: [],
  })
  assert.equal(req.verdict?.actionable, true)
  assert.equal(req.verdict?.source, 'calendar-due')
  assert.ok(req.verdict?.promptNote.includes('D1 投票截止'), 'the alarm title/prompt reaches the big brain')
})

test('buildTriageRequest: a calendar alarm assigned to SOMEONE ELSE stays system-only suppressed (only the assignee wakes)', () => {
  const alarm = JSON.stringify({ kind: 'calendar_event', eventId: 'ce-2', title: 'not yours', assigneeId: 'nova-1' })
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow({ kind: 'system', body: alarm, author_kind: null as never, author_id: 'calendar' })],
    context: [],
  })
  assert.equal(req.verdict?.actionable, false)
  assert.equal(req.verdict?.source, 'system-only')
})

test('buildTriageRequest: a system message MIXED with a real one still goes to the model (not suppressed)', () => {
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [
      inboxRow({ kind: 'system', body: 'Atlas joined the group' }),
      // Agent-authored real message: a human would fast-path; this exercises that a
      // system message doesn't get the pair suppressed as "system-only" — it reaches the model.
      inboxRow({ kind: 'text', author_kind: 'agent', author_id: 'bram-1', author_name: 'Bram', body: 'can someone help?', sequence: 2 }),
    ],
    context: [contextRow({ author_kind: 'agent', author_id: 'bram-1', author_name: 'Bram' })],
  })
  assert.equal(req.verdict, undefined)
  assert.ok(req.instructions && req.instructions.includes('cerebellum'))
})

test('buildTriageRequest: reply frequency is AI-native — the model reads the task, NOT a hardcoded "once" rule', () => {
  // Earlier we hardcoded "round bounded by the human message, reply once" — but the
  // TASK dictates frequency (some say "reply only once", some invite ongoing turns).
  // So: no deterministic reply-status verdict baked into the input; instead the
  // instructions tell the model to READ the task and apply it, using the facts the
  // messages already carry (#N order, (human)/(agent) author, ▸YOU for its own).
  // Unread is a PEER agent continuing the count (a human message would fast-path,
  // never reaching the model) — this is exactly the continuation case where the
  // gate DOES run and must carry no hardcoded reply-status.
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow({ sequence: 9, body: '8', author_kind: 'agent', author_id: 'bram-1', author_name: 'Bram' })],
    context: [
      contextRow({ sequence: 1, body: "let's play a game, count from 1", author_kind: 'human', is_self: false }),
      contextRow({ sequence: 3, body: '3', author_kind: 'agent', author_name: 'Atlas', is_self: true }),
      contextRow({ sequence: 9, body: '8', author_kind: 'agent', author_id: 'bram-1', author_name: 'Bram', is_self: false, is_unread: true }),
    ],
  })
  assert.equal(req.verdict, undefined, 'not hard-skipped — the model decides')
  // NO hardcoded conclusion in the input
  assert.doesNotMatch(String(req.input), /Reply status/)
  // the gate is a SINGLE principle, not a checklist of per-scenario rules
  assert.match(String(req.instructions), /single PRINCIPLE|keep NOISE off the big brain/i)
  // the per-message facts the model reasons from are present
  assert.match(String(req.input), /▸YOU/)
  assert.match(String(req.input), /#9/)
})

test('buildTriageRequest: GROUP AGENT messages go to the small model (no regex decides anything)', () => {
  // @mention / chatter from a PEER in a GROUP — judged by the model, never a regex.
  for (const row of [
    { author_kind: 'agent' as const, author_id: 'bram-1', author_name: 'Bram', body: '@atlas-1234 can you look at this?' },
    { author_kind: 'agent' as const, author_id: 'bram-1', author_name: 'Bram', body: 'nice, sounds good' },
  ]) {
    const req = buildTriageRequest({
      agentId: PERSONA.id, persona: PERSONA,
      inbox: [inboxRow(row)], context: [contextRow(row)],
    })
    assert.equal(req.verdict, undefined, `${JSON.stringify(row)} → no hard verdict`)
    assert.ok(req.instructions && req.instructions.includes('cerebellum'), `${JSON.stringify(row)} → model instructions`)
    assert.match(String(req.input), /json/i)
  }
})

test('buildTriageRequest: a HUMAN in a GROUP fast-paths to actionable=true (source human-group, NO gate) — the gate always said yes anyway', () => {
  // A human @all / greeting / heads-up in a GROUP is never gated: the cerebellum's
  // contract is "human → actionable=true, ALWAYS", so paying it only buys latency +
  // a small-model call to answer "yes". Skip it; the big brain still reads the room
  // and yields/stays silent per GLANCE_YIELD_RULES if the human named someone else.
  for (const body of ['大家好呀', 'hi all 👋', '@all heads up, deploy in 10']) {
    const row = { author_kind: 'human' as const, body }
    const req = buildTriageRequest({
      agentId: PERSONA.id, persona: PERSONA,
      inbox: [inboxRow(row)], context: [contextRow(row)],
    })
    assert.equal(req.instructions, undefined, `${body} → human message must NOT run the cerebellum`)
    assert.equal(req.verdict?.actionable, true, `${body} → actionable`)
    assert.equal(req.verdict?.source, 'human-group', `${body} → human-group source`)
  }
})

test('buildTriageRequest: a HUMAN in a DM short-circuits to actionable=true (NO triage gate, never leave a human hanging)', () => {
  const row = { conversation_id: 'dm-1', conversation_kind: 'direct', author_kind: 'human' as const, body: 'fix the deploy?' }
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow(row)], context: [contextRow(row)],
  })
  assert.equal(req.instructions, undefined, 'human DM must NOT run the cerebellum')
  assert.equal(req.verdict?.actionable, true)
  assert.equal(req.verdict?.source, 'human-dm')
})

test('buildTriageRequest: an agent↔agent DM ENGAGES by default (reply, no cerebellum) between loop-checks — never silence a teammate', () => {
  // seq 3 (not a multiple of 8) → not a checkpoint → engage without the model.
  const row = { conversation_id: 'dm-2', conversation_kind: 'direct', author_kind: 'agent' as const, author_name: 'Bram', body: 'witch, what\'s your move?', sequence: 3 }
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow(row)], context: [contextRow(row)],
  })
  assert.equal(req.instructions, undefined, 'between loop-checks the cerebellum is NOT run')
  assert.equal(req.verdict?.actionable, true, 'agent↔agent DM replies by default')
  assert.equal(req.verdict?.source, 'dm-agent-engage')
})

test('buildTriageRequest: an agent↔agent DM at a loop checkpoint (every Nth msg) falls through to the cerebellum (the dead-loop detector)', () => {
  // seq 8 (a multiple of 8) → checkpoint → run the gate so it can stop a loop.
  const row = { conversation_id: 'dm-3', conversation_kind: 'direct', author_kind: 'agent' as const, author_name: 'Bram', body: 'ok ok', sequence: 8 }
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow(row)], context: [contextRow(row)],
  })
  assert.equal(req.verdict, undefined, 'at a checkpoint the gate runs')
  assert.ok(req.instructions?.includes('cerebellum'))
})

test('buildTriageRequest: a CLAIMED thread under the high backstop goes to the model (the claim protects real work; the self-scaling floor does not apply)', () => {
  // An active work claim = real owned work (a game / deliverable). A CLAIMED
  // convo uses the fixed HIGH backstop (HARD_LOOP_CAP=20), NOT the self-scaling
  // lapping floor — so a 10-message run, even one that is lapping, still reaches
  // the model; the claim gives real work room to run to its own end. WITHOUT the
  // claim the same lapping run is deterministically suppressed (next test). This
  // is what resolves the 8↔20 oscillation: claimed work is protected, unclaimed
  // chatter is not.
  const ctx = [contextRow({ sequence: 1, author_kind: 'human', author_id: 'human-1', author_name: 'Yulemi', body: '来玩成语接龙' })]
  const trio = [['a-1', 'A'], ['b-1', 'B'], ['c-1', 'C']] as const
  for (let i = 2; i <= 11; i++) { const [id, name] = trio[i % 3]; ctx.push(contextRow({ sequence: i, author_kind: 'agent', author_id: id, author_name: name, body: `成语 ${i}` })) }
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow({ author_kind: 'agent', author_id: 'a-1', author_name: 'A', body: '成语', sequence: 11 })],
    context: ctx,
    claimsByConvo: { 'allhands-1': [{ agentId: 'nova-1', taskType: 'activity', subject: '成语接龙', startedAt: 1 }] },
  })
  assert.equal(req.verdict, undefined, 'claimed + under the high backstop → goes to the model (even while lapping)')
  assert.ok(req.instructions && req.instructions.includes('cerebellum'))
  assert.match(String(req.input), /Open work state/, 'surfaces the run + the active claim for the model')
  assert.match(String(req.input), /ACTIVE CLAIM/)
})

test('buildTriageRequest: self-scaling floor — an UNCLAIMED agent-only run that is LAPPING (a repeat speaker) → deterministic suppress', () => {
  // No claim + the run is repeating (2 agents ping-ponging past one round) = a
  // dead loop. "Lapping" = more agent messages than DISTINCT agents since the
  // last human. NO magic number: the floor is one round of whoever is actually
  // here, so it scales with team size. The primary wind-down is still the small
  // brain (fed the claim signal); this only catches a runaway it failed to end.
  const ctx = [contextRow({ sequence: 1, author_kind: 'human', author_id: 'human-1', author_name: 'Yulemi', body: 'hey team' })]
  const pair = [['bram-1', 'Bram'], ['iris-1', 'Iris']] as const
  for (let i = 2; i <= 8; i++) { const [id, name] = pair[i % 2]; ctx.push(contextRow({ sequence: i, author_kind: 'agent', author_id: id, author_name: name, body: `nice, agreed ${i}` })) }
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow({ author_kind: 'agent', author_id: 'bram-1', author_name: 'Bram', body: 'agreed', sequence: 8 })],
    context: ctx,
    // no claimsByConvo → unclaimed → self-scaling lapping floor applies
  })
  assert.equal(req.instructions, undefined, 'lapping unclaimed run → no model call')
  assert.equal(req.verdict?.actionable, false)
  assert.equal(req.verdict?.source, 'loop-cap')
})

test('buildTriageRequest: a HUMAN EMOJI REACTION during a lapping run counts as human attention → NOT suppressed (spectating human keeps the activity alive)', () => {
  // Same lapping fixture as above (would deterministically suppress), except a
  // human REACTED to one of the messages AFTER the run accumulated — the exact
  // werewolf shape: agent judge runs the game, the human watches and reacts
  // (👍👀🔥) instead of typing. Human attention = message OR reaction, so the
  // run resets at the reaction instant and the thread reaches the small brain.
  const ctx = [contextRow({ sequence: 1, author_kind: 'human', author_id: 'human-1', author_name: 'Yulemi', body: 'hey team', created_at: '2026-05-26T10:00:00Z' })]
  const pair = [['bram-1', 'Bram'], ['iris-1', 'Iris']] as const
  for (let i = 2; i <= 8; i++) {
    const [id, name] = pair[i % 2]
    ctx.push(contextRow({ sequence: i, author_kind: 'agent', author_id: id, author_name: name, body: `round ${i}`, created_at: `2026-05-26T10:0${i}:00Z` }))
  }
  // Human reacts at 10:09 — after every agent message above.
  ctx[3] = { ...ctx[3], human_reacted_at: '2026-05-26T10:09:00Z' }
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow({ author_kind: 'agent', author_id: 'bram-1', author_name: 'Bram', body: 'round 8', sequence: 8 })],
    context: ctx,
  })
  assert.equal(req.verdict, undefined, 'human reaction = attention → no deterministic suppress')
  assert.ok(req.instructions && req.instructions.includes('cerebellum'), 'goes to the small brain instead')
  assert.ok(req.input?.includes('HUMAN-REACTED'), 'the reacted message is marked for the model')
})

test('buildTriageRequest: a HUMAN with the room OPEN (recent read cursor) keeps a lapping run alive — watching IS attention', () => {
  // The stalled-werewolf shape: the human is spectating with the room open (a
  // screenshot in hand!) but typed nothing and their last reaction scrolled out
  // of the context window. conversation_reads says a human read the room AFTER
  // every agent message — that is live attention; the cap must not fire.
  const ctx = [contextRow({ sequence: 1, author_kind: 'human', author_id: 'human-1', author_name: 'Yulemi', body: 'hey team', created_at: '2026-05-26T10:00:00Z' })]
  const pair = [['bram-1', 'Bram'], ['iris-1', 'Iris']] as const
  for (let i = 2; i <= 8; i++) {
    const [id, name] = pair[i % 2]
    ctx.push(contextRow({ sequence: i, author_kind: 'agent', author_id: id, author_name: name, body: `round ${i}`, created_at: `2026-05-26T10:0${i}:00Z`, human_last_read_at: '2026-05-26T10:09:00Z' }))
  }
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow({ author_kind: 'agent', author_id: 'bram-1', author_name: 'Bram', body: 'round 8', sequence: 8 })],
    context: ctx,
  })
  assert.equal(req.verdict, undefined, 'human reading the room = attention → no deterministic suppress')
  assert.ok(req.instructions && req.instructions.includes('cerebellum'), 'goes to the small brain instead')
})

test('buildTriageRequest: a STALE human read cursor (human left the room) does not revive a lapping run', () => {
  // The human read up to the opener and left; the whole agent run accumulated
  // after their last read. Backstop semantics unchanged: no attention → suppress.
  const ctx = [contextRow({ sequence: 1, author_kind: 'human', author_id: 'human-1', author_name: 'Yulemi', body: 'hey team', created_at: '2026-05-26T10:00:00Z' })]
  const pair = [['bram-1', 'Bram'], ['iris-1', 'Iris']] as const
  for (let i = 2; i <= 8; i++) {
    const [id, name] = pair[i % 2]
    ctx.push(contextRow({ sequence: i, author_kind: 'agent', author_id: id, author_name: name, body: `round ${i}`, created_at: `2026-05-26T10:0${i}:00Z`, human_last_read_at: '2026-05-26T10:00:30Z' }))
  }
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow({ author_kind: 'agent', author_id: 'bram-1', author_name: 'Bram', body: 'round 8', sequence: 8 })],
    context: ctx,
  })
  assert.equal(req.instructions, undefined, 'stale read cursor → still suppressed')
  assert.equal(req.verdict?.actionable, false)
  assert.equal(req.verdict?.source, 'loop-cap')
})

test('buildTriageRequest: SUPERVISED workspace — a lapping side-room run stays alive under the HIGH backstop (werewolf wolf-DM shape)', () => {
  // The night-phase shape: a side room the human is excluded from BY THE
  // ACTIVITY'S RULES (wolf-DM) — no human message/reaction/read can EVER appear
  // in it — but the human is actively reading the company elsewhere. Presence
  // elevates the floor from "one lap" to HARD_LOOP_CAP, so a short night
  // discussion (here: 7 messages, 2 agents) reaches the small brain.
  const ctx: ContextRow[] = []
  const pair = [['bram-1', 'Bram'], ['iris-1', 'Iris']] as const
  for (let i = 1; i <= 7; i++) { const [id, name] = pair[i % 2]; ctx.push(contextRow({ conversation_id: 'wolf-dm-1', sequence: i, author_kind: 'agent', author_id: id, author_name: name, body: `night talk ${i}` })) }
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow({ conversation_id: 'wolf-dm-1', author_kind: 'agent', author_id: 'bram-1', author_name: 'Bram', body: 'night talk 7', sequence: 7 })],
    context: ctx,
    humanActiveInCompany: true,
  })
  assert.equal(req.verdict, undefined, 'supervised → high backstop, not lap floor → no deterministic suppress')
  assert.ok(req.instructions && req.instructions.includes('cerebellum'), 'goes to the small brain')
  assert.ok(req.input?.includes('human is actively watching'), 'the model is told about supervision')
})

test('buildTriageRequest: SUPERVISION elevates the floor but never grants immunity — a true runaway past HARD_LOOP_CAP still dies', () => {
  const ctx: ContextRow[] = []
  const pair = [['bram-1', 'Bram'], ['iris-1', 'Iris']] as const
  for (let i = 1; i <= 21; i++) { const [id, name] = pair[i % 2]; ctx.push(contextRow({ conversation_id: 'wolf-dm-1', sequence: i, author_kind: 'agent', author_id: id, author_name: name, body: `loop ${i}` })) }
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow({ conversation_id: 'wolf-dm-1', author_kind: 'agent', author_id: 'bram-1', author_name: 'Bram', body: 'loop 21', sequence: 21 })],
    context: ctx,
    humanActiveInCompany: true,
  })
  assert.equal(req.instructions, undefined, 'past the high backstop → suppressed even when supervised')
  assert.equal(req.verdict?.actionable, false)
  assert.equal(req.verdict?.source, 'loop-cap')
})

test('buildTriageRequest: a human reaction OLDER than the whole run does not revive it (attention is timestamped, not positional)', () => {
  // The reaction happened BEFORE the agent run accumulated — the human saw the
  // opener, reacted, then walked away while agents looped. Everything after the
  // reaction instant still counts, the run laps, and the backstop fires.
  const ctx = [contextRow({ sequence: 1, author_kind: 'human', author_id: 'human-1', author_name: 'Yulemi', body: 'hey team', created_at: '2026-05-26T10:00:00Z', human_reacted_at: '2026-05-26T10:00:30Z' })]
  const pair = [['bram-1', 'Bram'], ['iris-1', 'Iris']] as const
  for (let i = 2; i <= 8; i++) {
    const [id, name] = pair[i % 2]
    ctx.push(contextRow({ sequence: i, author_kind: 'agent', author_id: id, author_name: name, body: `round ${i}`, created_at: `2026-05-26T10:0${i}:00Z` }))
  }
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow({ author_kind: 'agent', author_id: 'bram-1', author_name: 'Bram', body: 'round 8', sequence: 8 })],
    context: ctx,
  })
  assert.equal(req.instructions, undefined, 'stale reaction → still suppressed')
  assert.equal(req.verdict?.actionable, false)
  assert.equal(req.verdict?.source, 'loop-cap')
})

test('buildTriageRequest: an UNCLAIMED round where each agent spoke ONCE (no lap) still goes to the model (the floor scales with team size)', () => {
  // 5 DISTINCT agents each posting once = a full round with NO repeat = not a
  // loop. The self-scaling floor does NOT fire (no lap); the small brain decides.
  // This is exactly the case a fixed cap of 6 would have wrongly killed for a
  // bigger team — the reason fixed caps kept getting removed.
  const ctx = [contextRow({ sequence: 1, author_kind: 'human', author_id: 'human-1', author_name: 'Yulemi', body: 'what do you all think?' })]
  const team = [['a-1', 'A'], ['b-1', 'B'], ['c-1', 'C'], ['d-1', 'D'], ['e-1', 'E']] as const
  team.forEach(([id, name], k) => { ctx.push(contextRow({ sequence: 2 + k, author_kind: 'agent', author_id: id, author_name: name, body: `my take ${name}` })) })
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow({ author_kind: 'agent', author_id: 'e-1', author_name: 'E', body: 'my take E', sequence: 6 })],
    context: ctx,
  })
  assert.equal(req.verdict, undefined, 'one round, no lap → goes to the model')
  assert.ok(req.instructions)
})

test('buildTriageRequest: regression guard — a LAPPING agent-only runaway → deterministic suppress, NO model (the backstop)', () => {
  // The belt-and-suspenders backstop the AI layer sits on top of. A 30/min rate
  // floor limits the RATE but never STOPS a slow ping-pong, so when the model
  // won't end an agent-only loop, this deterministic floor halts it until a human
  // re-engages. Now self-scaling (lapping = a repeat speaker past one round), but
  // it MUST still fire on a runaway: 3 agents ping-ponging to 24 messages.
  // REGRESSION GUARD: this backstop has been removed twice "for AI-native
  // elegance" and the loops regressed both times — do NOT delete it.
  const ctx = [contextRow({ sequence: 1, author_kind: 'human', author_id: 'human-1', author_name: 'Yulemi', body: 'kick it off' })]
  const trio = [['a-1', 'A'], ['b-1', 'B'], ['c-1', 'C']] as const
  for (let i = 2; i <= 25; i++) { const [id, name] = trio[i % 3]; ctx.push(contextRow({ sequence: i, author_kind: 'agent', author_id: id, author_name: name, body: `ack ${i}` })) }
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow({ author_kind: 'agent', author_id: 'a-1', author_name: 'A', body: 'ack', sequence: 25 })],
    context: ctx,
  })
  assert.equal(req.instructions, undefined, 'lapping runaway → no model call')
  assert.equal(req.verdict?.actionable, false, 'agents go silent until a human re-engages')
  assert.equal(req.verdict?.source, 'loop-cap')
})

test('buildTriageRequest: a recent human is never capped — fast-paths to actionable even after a long agent-only run', () => {
  // A long agent run that WOULD trip the hard cap, then a human re-engages at the
  // end. The human message fast-paths (actionable=true, no gate) — which is the
  // strongest possible form of "the cap is human-anchored": a human is never
  // suppressed, and here isn't even gated. The team picks right back up.
  const ctx = []
  for (let i = 1; i <= 24; i++) ctx.push(contextRow({ sequence: i, author_kind: 'agent', author_name: `A${i}`, body: `msg ${i}` }))
  ctx.push(contextRow({ sequence: 25, author_kind: 'human', author_name: 'Yulemi', body: 'one more thing — what about X?' }))
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow({ author_kind: 'human', author_name: 'Yulemi', body: 'one more thing — what about X?', sequence: 25 })],
    context: ctx,
  })
  assert.equal(req.verdict?.actionable, true, 'human re-engaged → actionable, not capped despite 24 prior agent msgs')
  assert.equal(req.verdict?.source, 'human-group')
  assert.equal(req.instructions, undefined, 'human never runs the gate')
})

test('buildTriageRequest: surfaces "open work state" when a conversation has gone agent-only (loop signal, each once — not yet lapping)', () => {
  // 4 DISTINCT agents each posting once after the last human → a full round, no
  // lap yet, so it goes to the model with the "Open work state" facts surfaced so
  // the model can decide to let the loop die. Counts come from author_kind /
  // author_id (fields); no regex classifies "this is a loop".
  const agentOnly = [
    contextRow({ sequence: 1, author_kind: 'human', author_id: 'human-1', author_name: 'Yulemi', body: 'what do you all think?' }),
    contextRow({ sequence: 2, author_kind: 'agent', author_id: 'atlas-1', author_name: 'Atlas', body: 'I think X' }),
    contextRow({ sequence: 3, author_kind: 'agent', author_id: 'bram-1', author_name: 'Bram', body: 'agreed, and Y' }),
    contextRow({ sequence: 4, author_kind: 'agent', author_id: 'iris-1', author_name: 'Iris', body: 'also Z' }),
    contextRow({ sequence: 5, author_kind: 'agent', author_id: 'nova-1', author_name: 'Nova', body: 'nice points' }),
  ]
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow({ author_kind: 'agent', author_id: 'nova-1', author_name: 'Nova', body: 'nice points', sequence: 5 })],
    context: agentOnly,
  })
  assert.equal(req.verdict, undefined, 'four distinct agents, one round each, no lap → goes to the model')
  assert.ok(req.instructions, 'goes to model')
  assert.match(String(req.input), /Open work state/)
  assert.match(String(req.input), /4 agent message\(s\) since a human/)
})

test('buildTriageRequest: a recent human is served by the fast-path, never by the open-work suppressor', () => {
  // The open-work "let the thread die" block is a SUPPRESSION signal, and only for
  // agent-only runs. A human message must never be suppressed — and now it never
  // even reaches that logic: a human in the unread set fast-paths to an actionable
  // verdict, so there is no gate input for an open-work block to appear in.
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow({ author_kind: 'human', author_name: 'Yulemi', body: 'thanks, one more thing…', sequence: 2 })],
    context: [
      contextRow({ sequence: 1, author_kind: 'agent', author_id: 'atlas-1', author_name: 'Atlas', body: 'on it' }),
      contextRow({ sequence: 2, author_kind: 'human', author_name: 'Yulemi', body: 'thanks, one more thing…' }),
    ],
  })
  assert.equal(req.verdict?.source, 'human-group', 'human fast-paths — no gate, no open-work block')
  assert.equal(req.input, undefined)
})

test('buildTriageRequest: failClosed is TRUE for a purely agent-to-agent wake (daemon fails CLOSED on local-model error, not open)', () => {
  // The direction-aware fail mode: no human in the unread set → a LOCAL triage
  // failure must suppress, not wake the big brain, or a flaky local model
  // amplifies the loop. This is the flag the daemon reads.
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow({ author_kind: 'agent', author_name: 'Bram', body: 'what do you think?' })],
    context: [contextRow({ author_kind: 'agent', author_name: 'Bram', body: 'what do you think?' })],
  })
  assert.ok(req.instructions, 'model-call path')
  assert.equal(req.failClosed, true)
})

test('buildTriageRequest: a human in the unread set fast-paths to a verdict (never leave a human hanging — the strongest form)', () => {
  // Previously a human in a GROUP fell through to the model with failClosed=false
  // ("fail open, never suppress a human"). Now a human short-circuits to an
  // actionable verdict outright — strictly stronger than fail-open, and it never
  // reaches (or needs) the failClosed computation, which is agent-only from here.
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow({ author_kind: 'human', body: 'hi all 👋' })],
    context: [contextRow({ author_kind: 'human', body: 'hi all 👋' })],
  })
  assert.equal(req.verdict?.actionable, true)
  assert.equal(req.verdict?.source, 'human-group')
})

test('parseTriage: tolerates ```json fences and surrounding chatter (local model output)', () => {
  const raw = 'Here is my verdict:\n```json\n{"actionable": true, "responseMode": "one-of-us", "reason": "greeting", "promptNote": "Say hi back warmly."}\n```\nDone.'
  const v = parseTriage(raw)
  assert.equal(v?.actionable, true)
  assert.equal(v?.responseMode, 'one-of-us')
  assert.equal(v?.promptNote, 'Say hi back warmly.')
})

test('parseTriage: bare object with trailing prose still parses', () => {
  const v = parseTriage('{"actionable": false, "reason": "chatter", "promptNote": "skip"} — nothing for you')
  assert.equal(v?.actionable, false)
  assert.equal(v?.responseMode, undefined)
})

test('parseTriage: garbage → null (caller fail-opens)', () => {
  assert.equal(parseTriage('I think you should reply!'), null)
})

test('isRateLimited: matches throttle/quota/overload signals, not ordinary errors', () => {
  for (const s of ['429 Too Many Requests', 'HTTP 503 Service Unavailable', 'You exceeded your current quota', 'RESOURCE_EXHAUSTED', 'usage limit reached', 'Claude 429 Session Limit', 'model overloaded', 'rate limit exceeded']) {
    assert.equal(isRateLimited(s), true, `should flag: ${s}`)
  }
  for (const s of ['invalid JSON', 'ECONNRESET', 'process exited with code 1', 'no such file or directory']) {
    assert.equal(isRateLimited(s), false, `should NOT flag: ${s}`)
  }
})

test('buildTriageRequest: triage is GATE-ONLY — the cerebellum never writes a reply (no handler/reply)', () => {
  // The small brain only judges (actionable + mode + a directive) and reads the
  // room; the big brain writes ALL replies. So the instructions/JSON must NOT ask
  // the cerebellum to author content.
  // Agent-authored so the request reaches the model (a human message fast-paths).
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow({ author_kind: 'agent', author_id: 'bram-1', author_name: 'Bram', body: 'thoughts on this?' })],
    context: [contextRow({ author_kind: 'agent', author_id: 'bram-1', author_name: 'Bram', body: 'thoughts on this?' })],
  })
  assert.doesNotMatch(String(req.instructions), /handler/)
  assert.doesNotMatch(String(req.input), /"handler"|"reply"/)
  assert.match(String(req.instructions), /the big brain decides who replies/)
})

test('buildTriageRequest: triage is a PURE GATE — no mechanical/handler/sequential/selfServe layer (BYOA == cloud)', () => {
  // There is NO small-brain content classifier layer; the one awake agent
  // self-coordinates via claim + glance. So BYOA triage no longer emits
  // handler="small" mechanical tokens, a `reply`, or a `sequential` flag, and there
  // is no `selfServe` divergence — it's the EXACT same buildTriageRequest the cloud
  // path uses. The big brain decides who/how/relay in-turn by reading the room.
  const req = buildTriageRequest({
    agentId: PERSONA.id, persona: PERSONA,
    inbox: [inboxRow({ author_kind: 'human', body: 'count from 1' })],
    context: [contextRow({ author_kind: 'human', body: 'count from 1' })],
  })
  assert.doesNotMatch(String(req.instructions), /MECHANICAL COORDINATION|handler="small"|"sequential"/)
  assert.doesNotMatch(String(req.input), /"handler"|"reply"|"sequential"/)
  // selfServe is gone from the API surface entirely.
  // @ts-expect-error selfServe was removed from buildTriageRequest's args
  buildTriageRequest({ agentId: PERSONA.id, persona: PERSONA, selfServe: true, inbox: [], context: [] })
})

test('parseTriage: actionable:false with promptNote:null is VALID (not unparseable)', () => {
  // The exact shape Haiku returns for "no reply" — must NOT be rejected, or the
  // gate fail-opens and re-wakes the big brain on chatter.
  const raw = '```json\n{"actionable": false, "responseMode": null, "reason": "chatter", "promptNote": null}\n```'
  const v = parseTriage(raw)
  assert.equal(v?.actionable, false)
  assert.equal(v?.promptNote, '')
})

test('parseTriage: salvages actionable+responseMode from TRUNCATED json (no closing brace)', () => {
  const truncated = '```json\n{\n  "actionable": false,\n  "responseMode": null,\n  "reason": "Yulemi\'s message is a vague request with no clear task and the counting already finished by all four agents so there is nothing left for'
  const v = parseTriage(truncated)
  assert.equal(v?.actionable, false, 'recovers actionable from truncated output')
  assert.match(v!.reason, /partial|truncated/)
})

test('parseTriage: salvages a truncated actionable:true one-of-us', () => {
  const truncated = '{"actionable": true, "responseMode": "one-of-us", "reason": "a human greeted the whole group warmly and someone should'
  const v = parseTriage(truncated)
  assert.equal(v?.actionable, true)
  assert.equal(v?.responseMode, 'one-of-us')
})

test('finalizeTriage: actionable:false keeps empty promptNote (real skip, no fail-open)', () => {
  const v = finalizeTriage({ actionable: false, reason: 'chatter', promptNote: '' }, 'support-model-local')
  assert.equal(v.actionable, false)
  assert.equal(v.promptNote, '')
  assert.equal(v.source, 'support-model-local')
})

test('finalizeTriage: actionable:true with empty promptNote gets a generic one (big brain needs guidance)', () => {
  const v = finalizeTriage({ actionable: true, responseMode: 'me', reason: 'dm', promptNote: '' }, 'support-model')
  assert.ok(v.promptNote.trim().length > 0)
})
