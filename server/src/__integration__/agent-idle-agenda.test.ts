/**
 * Heartbeat agenda pre-check integration tests.
 *
 * The idle scheduler must inspect each quiet agent's Kanban + Calendar
 * footprint and route the wake on three axes:
 *   1. No agenda items at all          → generic idle wake (preserves
 *                                         spontaneous-thought behavior).
 *   2. Agenda + classifier "actionable" → background_scan wake with a
 *                                         focused brief from agenda_scheduler.
 *   3. Agenda + classifier "skip"      → NO wake at all (cost-saving).
 *   4. Agenda + classifier ERROR        → fall back to generic idle wake
 *                                         (outage safety).
 *   5. Done-column cards must be excluded from the agenda load.
 *   6. Calendar events in the current ±slot window must surface in the
 *      brief; events outside the window must not.
 */
import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { pool } from '../db/pool.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'
import {
  runIdleTick,
  __setIdleWakeForTesting,
  __setIdleClassifierForTesting,
  _resetIdleForTests,
} from '../agents/idle.js'
import { AGENDA_CLASSIFIER_ERROR } from '../agents/agenda.js'
import { invalidatePersonaCache } from '../agents/personas.js'
import { __setLlmClientOverrideForTesting } from '../llm.js'
import type { wakeAgent } from '../agents/scheduler.js'

interface CapturedWake {
  agentId: string
  reason: Parameters<typeof wakeAgent>[1]
  conversationId: string | null
  options: Parameters<typeof wakeAgent>[4]
}

before(async () => {
  await ensureSchemaOnce()
})

beforeEach(async () => {
  await resetAllTables()
  _resetIdleForTests()
  invalidatePersonaCache()
  __setLlmClientOverrideForTesting(null)
})

after(async () => {
  _resetIdleForTests()
  invalidatePersonaCache()
  __setLlmClientOverrideForTesting(null)
  await teardownAll()
})

interface Seeded {
  companyId: string
  agentId: string
  humanId: string
  boardId: string
  todoColumnId: string
  doneColumnId: string
}

async function seedCompanyWithAgent(): Promise<Seeded> {
  const companyId = `c-${randomUUID().slice(0, 8)}`
  const agentId = `agent-${randomUUID().slice(0, 8)}`
  const humanId = `u-${randomUUID().slice(0, 8)}`

  await pool.query(
    `INSERT INTO users (id, email, display_name, tier) VALUES ($1, $2, $3, 'free')`,
    [humanId, `${humanId}@test.local`, humanId],
  )
  await pool.query(
    `INSERT INTO companies (id, name, slug, owner_user_id) VALUES ($1, $2, $3, $4)`,
    [companyId, `Test ${companyId}`, companyId, humanId],
  )
  await pool.query(
    `INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [companyId, humanId],
  )
  await pool.query(
    `INSERT INTO participants (id, company_id, kind, name, role, initial, avatar_bg, status)
     VALUES ($1, $2, 'human', $3, 'owner', $4, '#abcdef', 'avail')`,
    [humanId, companyId, humanId, humanId.slice(2, 3).toUpperCase()],
  )
  await pool.query(
    `INSERT INTO participants (id, company_id, kind, name, role, initial, avatar_bg, status, bio, system_prompt)
     VALUES ($1, $2, 'agent', 'Atlas', 'Operator', 'A', '#abcdef', 'avail',
             'Operator agent for ops work.',
             'You are Atlas. You move ops work forward concretely.')`,
    [agentId, companyId],
  )

  // Old last-spoke so pickAgent treats this agent as quiet enough.
  await pool.query(
    `INSERT INTO conversations (id, kind, title, members, tag, company_id)
     VALUES ($1, 'group', 'Test', $2::jsonb, 'team', $3)`,
    [`group-${companyId}`, JSON.stringify([humanId, agentId]), companyId],
  )

  const boardId = `b-${randomUUID().slice(0, 8)}`
  await pool.query(
    `INSERT INTO boards (id, company_id, title, created_by)
     VALUES ($1, $2, 'Ops Board', $3)`,
    [boardId, companyId, humanId],
  )
  const todoColumnId = `col-todo-${randomUUID().slice(0, 6)}`
  const doneColumnId = `col-done-${randomUUID().slice(0, 6)}`
  await pool.query(
    `INSERT INTO board_columns (id, board_id, title, position) VALUES
       ($1, $2, 'To Do', 0),
       ($3, $2, 'Done', 100)`,
    [todoColumnId, boardId, doneColumnId],
  )
  return { companyId, agentId, humanId, boardId, todoColumnId, doneColumnId }
}

async function insertCard(args: {
  boardId: string; columnId: string; title: string;
  assigneeId: string | null; mentions: string[]; createdBy: string;
}): Promise<string> {
  const id = `card-${randomUUID().slice(0, 8)}`
  await pool.query(
    `INSERT INTO board_cards (id, board_id, column_id, title, position, assignee_id, mentions, created_by)
     VALUES ($1, $2, $3, $4, 0, $5, $6::jsonb, $7)`,
    [id, args.boardId, args.columnId, args.title, args.assigneeId, JSON.stringify(args.mentions), args.createdBy],
  )
  return id
}

async function insertCalendarEvent(args: {
  companyId: string; createdBy: string; assigneeId: string; title: string;
  startAt: Date; agentPrompt: string | null;
}): Promise<string> {
  const id = `evt-${randomUUID().slice(0, 8)}`
  await pool.query(
    `INSERT INTO calendar_events (id, company_id, created_by, kind, title, assignee_id, agent_prompt, start_at, status)
     VALUES ($1, $2, $3, 'agent_task', $4, $5, $6, $7, 'active')`,
    [id, args.companyId, args.createdBy, args.title, args.assigneeId, args.agentPrompt, args.startAt],
  )
  return id
}

async function latestIdleLog(agentId: string): Promise<{ ref: Record<string, unknown> } | null> {
  const { rows } = await pool.query<{ ref: Record<string, unknown> }>(
    `SELECT ref FROM agent_log
      WHERE agent_id = $1
        AND ref ->> 'source' = 'idle_scheduler'
      ORDER BY created_at DESC LIMIT 1`,
    [agentId],
  )
  return rows[0] ?? null
}

test('[integration] empty agenda → generic idle wake fires', async () => {
  const { agentId, companyId } = await seedCompanyWithAgent()
  const wakes: CapturedWake[] = []
  __setIdleWakeForTesting(async (id, reason, conversationId, _steer, options) => {
    wakes.push({ agentId: id, reason, conversationId: conversationId ?? null, options })
  })

  await runIdleTick()

  assert.equal(wakes.length, 1)
  assert.equal(wakes[0].agentId, agentId)
  assert.equal(wakes[0].reason, 'idle')
  assert.equal(wakes[0].options?.backgroundBrief, undefined)
  assert.match(wakes[0].options?.idleReason ?? '', /idle heartbeat/)

  const log = await latestIdleLog(agentId)
  assert.ok(log, 'idle log row should be written')
  assert.equal(log.ref.agendaVerdict, 'empty')
  assert.equal(log.ref.agendaCards, 0)
  assert.equal(log.ref.agendaEvents, 0)
  assert.equal(log.ref.companyId, companyId)
})

test('[integration] agenda + classifier=actionable → background_scan wake with focused brief', async () => {
  const { agentId, boardId, todoColumnId, humanId } = await seedCompanyWithAgent()
  const cardId = await insertCard({
    boardId, columnId: todoColumnId, title: 'Ship the migration',
    assigneeId: agentId, mentions: [], createdBy: humanId,
  })
  const wakes: CapturedWake[] = []
  __setIdleWakeForTesting(async (id, reason, conversationId, _steer, options) => {
    wakes.push({ agentId: id, reason, conversationId: conversationId ?? null, options })
  })
  __setIdleClassifierForTesting(async () => ({
    actionable: true,
    focus: 'Ship the migration before EOD',
    reason: 'one assigned card in the To Do column',
  }))

  await runIdleTick()

  assert.equal(wakes.length, 1)
  assert.equal(wakes[0].agentId, agentId)
  assert.equal(wakes[0].reason, 'background_scan')
  const brief = wakes[0].options?.backgroundBrief
  assert.ok(brief, 'backgroundBrief must be attached')
  assert.equal(brief.source, 'agenda_scheduler')
  assert.equal(brief.title, 'Ship the migration before EOD')
  assert.match(brief.body, new RegExp(cardId))
  assert.match(brief.body, /Ship the migration before EOD/)
  // Action override (gap #3 fix) must be present so the brain doesn't
  // inherit the default "do nothing" stance from background_scan framing.
  assert.match(brief.body, /pick the most timely item/i)

  const log = await latestIdleLog(agentId)
  assert.equal(log?.ref.agendaVerdict, 'actionable')
  assert.equal(log?.ref.agendaCards, 1)
  assert.equal(log?.ref.agendaFocus, 'Ship the migration before EOD')
})

test('[integration] agenda + classifier=skip → NO wake fires (cost-saving path)', async () => {
  const { agentId, boardId, todoColumnId, humanId } = await seedCompanyWithAgent()
  await insertCard({
    boardId, columnId: todoColumnId, title: 'Vague brainstorm',
    assigneeId: agentId, mentions: [], createdBy: humanId,
  })
  const wakes: CapturedWake[] = []
  __setIdleWakeForTesting(async (id, reason, conversationId, _steer, options) => {
    wakes.push({ agentId: id, reason, conversationId: conversationId ?? null, options })
  })
  __setIdleClassifierForTesting(async () => ({
    actionable: false,
    focus: '',
    reason: 'card is too vague to act on',
  }))

  await runIdleTick()

  assert.equal(wakes.length, 0, 'classifier said skip → no brain wake should fire')

  const log = await latestIdleLog(agentId)
  assert.equal(log?.ref.agendaVerdict, 'skip', 'still log the tick for telemetry')
  assert.equal(log?.ref.agendaCards, 1)
})

test('[integration] classifier ERROR → fall back to generic idle wake (outage safety)', async () => {
  const { agentId, boardId, todoColumnId, humanId } = await seedCompanyWithAgent()
  await insertCard({
    boardId, columnId: todoColumnId, title: 'Real work',
    assigneeId: agentId, mentions: [], createdBy: humanId,
  })
  const wakes: CapturedWake[] = []
  __setIdleWakeForTesting(async (id, reason, conversationId, _steer, options) => {
    wakes.push({ agentId: id, reason, conversationId: conversationId ?? null, options })
  })
  // Classifier returns the AGENDA_CLASSIFIER_ERROR sentinel — same as if
  // the LLM call threw. We must NOT silence the agent in this case.
  __setIdleClassifierForTesting(async () => ({
    actionable: false,
    focus: '',
    reason: AGENDA_CLASSIFIER_ERROR,
  }))

  await runIdleTick()

  assert.equal(wakes.length, 1, 'classifier outage must fall back to a generic idle wake')
  assert.equal(wakes[0].reason, 'idle')
  assert.match(wakes[0].options?.idleReason ?? '', /agenda triage unavailable/)

  const log = await latestIdleLog(agentId)
  assert.equal(log?.ref.agendaVerdict, 'classifier_error')
})

test('[integration] done-column cards are excluded from the agenda load', async () => {
  const { agentId, boardId, doneColumnId, humanId } = await seedCompanyWithAgent()
  // Card lives in the "Done" column — must be filtered out, so the agent
  // ends up with an empty agenda and gets the generic idle wake (not the
  // skip-with-no-wake path).
  await insertCard({
    boardId, columnId: doneColumnId, title: 'Already finished',
    assigneeId: agentId, mentions: [], createdBy: humanId,
  })
  const wakes: CapturedWake[] = []
  let classifierCalled = false
  __setIdleWakeForTesting(async (id, reason, conversationId, _steer, options) => {
    wakes.push({ agentId: id, reason, conversationId: conversationId ?? null, options })
  })
  __setIdleClassifierForTesting(async () => {
    classifierCalled = true
    return { actionable: true, focus: 'should not happen', reason: 'should not happen' }
  })

  await runIdleTick()

  assert.equal(classifierCalled, false, 'classifier must not be called when agenda is empty')
  assert.equal(wakes.length, 1, 'empty agenda still gets the generic idle wake')
  assert.equal(wakes[0].reason, 'idle')

  const log = await latestIdleLog(agentId)
  assert.equal(log?.ref.agendaVerdict, 'empty')
  assert.equal(log?.ref.agendaCards, 0)
})

test('[integration] calendar event in current slot is surfaced in the brief; out-of-window events are not', async () => {
  const { agentId, companyId, humanId } = await seedCompanyWithAgent()
  const now = new Date()
  // In-window: 5 minutes from now (inside the +30m lookahead).
  const inWindow = await insertCalendarEvent({
    companyId, createdBy: humanId, assigneeId: agentId,
    title: 'Live standup', startAt: new Date(now.getTime() + 5 * 60_000),
    agentPrompt: 'Lead the standup',
  })
  // Out-of-window: 2 hours from now (outside the +30m lookahead).
  const outOfWindow = await insertCalendarEvent({
    companyId, createdBy: humanId, assigneeId: agentId,
    title: 'Future event', startAt: new Date(now.getTime() + 2 * 60 * 60_000),
    agentPrompt: 'too far out',
  })
  const wakes: CapturedWake[] = []
  __setIdleWakeForTesting(async (id, reason, conversationId, _steer, options) => {
    wakes.push({ agentId: id, reason, conversationId: conversationId ?? null, options })
  })
  __setIdleClassifierForTesting(async (args) => {
    // Sanity: classifier sees exactly one event, not both.
    assert.equal(args.agenda.events.length, 1, 'only the in-window event should reach the classifier')
    assert.equal(args.agenda.events[0].id, inWindow)
    return { actionable: true, focus: 'Lead standup now', reason: 'event in current slot' }
  })

  await runIdleTick()

  assert.equal(wakes.length, 1)
  const brief = wakes[0].options?.backgroundBrief
  assert.ok(brief)
  assert.match(brief.body, new RegExp(inWindow))
  assert.equal(brief.body.includes(outOfWindow), false, 'out-of-window events must not appear in the brief')
  assert.match(brief.body, /Lead the standup/)
})

test('[integration] mentions-only card (assignee=null, mentions=[me]) surfaces in the agenda', async () => {
  const { agentId, boardId, todoColumnId, humanId } = await seedCompanyWithAgent()
  // assignee_id=null but mentions contains the agent — must still surface.
  const cardId = await insertCard({
    boardId, columnId: todoColumnId, title: 'Review handoff doc',
    assigneeId: null, mentions: [agentId], createdBy: humanId,
  })
  const wakes: CapturedWake[] = []
  __setIdleWakeForTesting(async (id, reason, conversationId, _steer, options) => {
    wakes.push({ agentId: id, reason, conversationId: conversationId ?? null, options })
  })
  __setIdleClassifierForTesting(async (args) => {
    assert.equal(args.agenda.cards.length, 1, 'mentions-only card should reach the classifier')
    assert.equal(args.agenda.cards[0].id, cardId)
    assert.equal(args.agenda.cards[0].assignee_id, null)
    assert.deepEqual(args.agenda.cards[0].mentions, [agentId])
    return { actionable: true, focus: 'Handle the review', reason: '@mention from human' }
  })

  await runIdleTick()

  assert.equal(wakes.length, 1)
  assert.equal(wakes[0].reason, 'background_scan')
  // Brief renders the @-mention tag, not the assigned tag.
  assert.match(wakes[0].options?.backgroundBrief?.body ?? '', /@you mentioned/)
})

test('[integration] stale card (>30 days old) is excluded by the SQL filter', async () => {
  const { agentId, boardId, todoColumnId, humanId } = await seedCompanyWithAgent()
  const staleId = await insertCard({
    boardId, columnId: todoColumnId, title: 'Forgotten work',
    assigneeId: agentId, mentions: [], createdBy: humanId,
  })
  // Rewind updated_at to 45 days ago — outside the 30-day window.
  await pool.query(
    `UPDATE board_cards SET updated_at = NOW() - INTERVAL '45 days' WHERE id = $1`,
    [staleId],
  )
  const wakes: CapturedWake[] = []
  let classifierCalled = false
  __setIdleWakeForTesting(async (id, reason, conversationId, _steer, options) => {
    wakes.push({ agentId: id, reason, conversationId: conversationId ?? null, options })
  })
  __setIdleClassifierForTesting(async () => {
    classifierCalled = true
    return { actionable: true, focus: 'should not happen', reason: 'should not happen' }
  })

  await runIdleTick()

  assert.equal(classifierCalled, false, 'classifier must not see the stale card')
  assert.equal(wakes.length, 1, 'empty agenda → generic idle wake fires')
  assert.equal(wakes[0].reason, 'idle')
})

test('[integration] paused calendar event is excluded by the status filter', async () => {
  const { agentId, companyId, humanId } = await seedCompanyWithAgent()
  const now = new Date()
  const pausedId = await insertCalendarEvent({
    companyId, createdBy: humanId, assigneeId: agentId,
    title: 'On hold', startAt: new Date(now.getTime() + 5 * 60_000),
    agentPrompt: 'Do not fire',
  })
  await pool.query(
    `UPDATE calendar_events SET status = 'paused' WHERE id = $1`,
    [pausedId],
  )
  const wakes: CapturedWake[] = []
  let classifierCalled = false
  __setIdleWakeForTesting(async (id, reason, conversationId, _steer, options) => {
    wakes.push({ agentId: id, reason, conversationId: conversationId ?? null, options })
  })
  __setIdleClassifierForTesting(async () => {
    classifierCalled = true
    return { actionable: true, focus: 'should not happen', reason: 'should not happen' }
  })

  await runIdleTick()

  assert.equal(classifierCalled, false, 'paused event must not reach the classifier')
  assert.equal(wakes.length, 1, 'empty agenda → generic idle wake fires')
  assert.equal(wakes[0].reason, 'idle')
})

test('[integration] two tenants are evaluated independently — agendas do not bleed', async () => {
  // Tenant A: actionable agenda. Tenant B: empty agenda. Each must end up
  // on its own wake path without the other's data leaking in.
  const a = await seedCompanyWithAgent()
  const b = await seedCompanyWithAgent()
  // Cross-check the seeding produced two distinct tenants.
  assert.notEqual(a.companyId, b.companyId)
  assert.notEqual(a.agentId, b.agentId)

  await insertCard({
    boardId: a.boardId, columnId: a.todoColumnId, title: 'Tenant-A real work',
    assigneeId: a.agentId, mentions: [], createdBy: a.humanId,
  })
  // Tenant B has a board but no cards.

  const wakes: CapturedWake[] = []
  __setIdleWakeForTesting(async (id, reason, conversationId, _steer, options) => {
    wakes.push({ agentId: id, reason, conversationId: conversationId ?? null, options })
  })
  const seenByClassifier: string[] = []
  __setIdleClassifierForTesting(async (args) => {
    seenByClassifier.push(args.persona.name)
    // Cards on the classifier input must all be tenant-A only.
    assert.equal(args.companyId, a.companyId, 'classifier should only see tenant-A')
    return { actionable: true, focus: 'Tenant-A focus', reason: 'one card' }
  })

  await runIdleTick()

  // Each tenant gets exactly one wake. A goes via the agenda path; B via
  // the empty-agenda generic path. Order is not guaranteed (random()
  // inside pickAgent, dict-order on companies query).
  assert.equal(wakes.length, 2, 'each tenant should produce one wake')
  const aWake = wakes.find((w) => w.agentId === a.agentId)
  const bWake = wakes.find((w) => w.agentId === b.agentId)
  assert.ok(aWake, 'tenant A agent should be woken')
  assert.ok(bWake, 'tenant B agent should be woken')
  assert.equal(aWake.reason, 'background_scan')
  assert.equal(bWake.reason, 'idle')
  assert.equal(seenByClassifier.length, 1, 'classifier should run only for tenant A')

  // Tenant-B's brief must NOT mention tenant-A's card title.
  if (bWake.options?.backgroundBrief) {
    assert.equal(bWake.options.backgroundBrief.body.includes('Tenant-A real work'), false)
  }
})

test('[integration] pickAgent skips agents who recently authored a message', async () => {
  // IDLE_MIN_QUIET_MIN defaults to 25 minutes. An agent who spoke 5
  // minutes ago must NOT be eligible for an idle wake regardless of
  // agenda. This guards the heartbeat from interrupting an agent in
  // the middle of an active conversation.
  const { agentId, companyId, humanId, boardId, todoColumnId } = await seedCompanyWithAgent()
  // Give them an agenda so the tick has SOMETHING to triage if it ever
  // got past pickAgent — that way the test fails loudly if the cutoff
  // breaks (we'd see a background_scan wake fire).
  await insertCard({
    boardId, columnId: todoColumnId, title: 'Real work',
    assigneeId: agentId, mentions: [], createdBy: humanId,
  })
  // Author a recent message FROM the agent into the conversation. The
  // `messages` table is the source pickAgent reads for `last_spoke`.
  await pool.query(
    `INSERT INTO conversations (id, kind, title, members, tag, company_id)
       VALUES ($1, 'group', 'recent talk', $2::jsonb, 'team', $3)
       ON CONFLICT (id) DO NOTHING`,
    [`conv-recent-${companyId}`, JSON.stringify([humanId, agentId]), companyId],
  )
  await pool.query(
    `INSERT INTO messages (id, conversation_id, author_id, kind, body, sequence, company_id, created_at)
       VALUES ($1, $2, $3, 'text', 'just spoke', 1, $4, NOW() - INTERVAL '5 minutes')`,
    [`m-${randomUUID()}`, `conv-recent-${companyId}`, agentId, companyId],
  )

  const wakes: CapturedWake[] = []
  let classifierCalled = false
  __setIdleWakeForTesting(async (id, reason, conversationId, _steer, options) => {
    wakes.push({ agentId: id, reason, conversationId: conversationId ?? null, options })
  })
  __setIdleClassifierForTesting(async () => {
    classifierCalled = true
    return { actionable: true, focus: 'should not happen', reason: 'should not happen' }
  })

  await runIdleTick()

  assert.equal(wakes.length, 0, 'recently-talkative agent must not be woken')
  assert.equal(classifierCalled, false, 'agenda triage must not even run for an ineligible agent')

  const log = await latestIdleLog(agentId)
  assert.equal(log, null, 'no idle log row should be written for skipped agents')
})

test('[integration] tenant with zero agents is handled gracefully (no wake, no error)', async () => {
  // Seed a company that has no agent participants. runIdleTick iterates
  // every company; an empty-roster tenant must be a clean no-op.
  const companyId = `c-${randomUUID().slice(0, 8)}`
  const humanId = `u-${randomUUID().slice(0, 8)}`
  await pool.query(
    `INSERT INTO users (id, email, display_name, tier) VALUES ($1, $2, $3, 'free')`,
    [humanId, `${humanId}@test.local`, humanId],
  )
  await pool.query(
    `INSERT INTO companies (id, name, slug, owner_user_id) VALUES ($1, $2, $3, $4)`,
    [companyId, `Test ${companyId}`, companyId, humanId],
  )
  await pool.query(
    `INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [companyId, humanId],
  )
  await pool.query(
    `INSERT INTO participants (id, company_id, kind, name, role, initial, avatar_bg, status)
       VALUES ($1, $2, 'human', $3, 'owner', $4, '#abcdef', 'avail')`,
    [humanId, companyId, humanId, 'H'],
  )
  // NO agent participants. pickAgent should return null.

  const wakes: CapturedWake[] = []
  __setIdleWakeForTesting(async (id, reason, conversationId, _steer, options) => {
    wakes.push({ agentId: id, reason, conversationId: conversationId ?? null, options })
  })
  // No classifier stub — we expect it to never be called.

  await assert.doesNotReject(async () => { await runIdleTick() })

  assert.equal(wakes.length, 0)
  const { rowCount } = await pool.query(
    `SELECT 1 FROM agent_log WHERE ref ->> 'source' = 'idle_scheduler' AND ref ->> 'companyId' = $1`,
    [companyId],
  )
  assert.equal(rowCount, 0, 'no idle log row for an empty-roster tenant')
})

test('[integration] off-boarded agent is filtered at pickAgent (departed_at IS NULL gate)', async () => {
  // Off-board the agent BEFORE the tick runs. pickAgent's
  // `departed_at IS NULL` predicate must exclude them so the
  // persona-null defensive branch never even has to fire.
  const { agentId, boardId, todoColumnId, humanId } = await seedCompanyWithAgent()
  await insertCard({
    boardId, columnId: todoColumnId, title: 'Work for an absent agent',
    assigneeId: agentId, mentions: [], createdBy: humanId,
  })
  await pool.query(
    `UPDATE participants SET departed_at = NOW() WHERE id = $1`, [agentId],
  )
  invalidatePersonaCache(agentId)

  const wakes: CapturedWake[] = []
  let classifierCalled = false
  __setIdleWakeForTesting(async (id, reason, conversationId, _steer, options) => {
    wakes.push({ agentId: id, reason, conversationId: conversationId ?? null, options })
  })
  __setIdleClassifierForTesting(async () => {
    classifierCalled = true
    return { actionable: true, focus: '', reason: '' }
  })

  await runIdleTick()

  assert.equal(wakes.length, 0, 'departed agent must not be woken')
  assert.equal(classifierCalled, false, 'departed agent must not reach the classifier')
})

test('[integration] agent_log row carries the documented shape (kind, body, full ref)', async () => {
  // Strengthens an assumption other tests rely on implicitly: the log
  // row's `kind`, `body`, and `ref` columns. If schema or shape drifts,
  // pin it here so the broken contract is loud.
  const { agentId, companyId, boardId, todoColumnId, humanId } = await seedCompanyWithAgent()
  await insertCard({
    boardId, columnId: todoColumnId, title: 'Driving force',
    assigneeId: agentId, mentions: [], createdBy: humanId,
  })
  __setIdleWakeForTesting(async () => { /* swallow */ })
  __setIdleClassifierForTesting(async () => ({
    actionable: true, focus: 'Drive it', reason: 'one card',
  }))

  await runIdleTick()

  const { rows } = await pool.query<{
    kind: string; body: string; company_id: string | null; ref: Record<string, unknown>
  }>(
    `SELECT kind, body, company_id, ref FROM agent_log
      WHERE agent_id = $1 AND ref ->> 'source' = 'idle_scheduler'
      ORDER BY created_at DESC LIMIT 1`,
    [agentId],
  )
  assert.equal(rows.length, 1, 'one log row written')
  const row = rows[0]
  assert.equal(row.kind, 'note', 'idle wakes log as `note` kind')
  assert.match(row.body, /^idle wake queued for /)
  assert.match(row.body, /Atlas/, 'body should include the agent display name')
  assert.equal(row.company_id, companyId, 'company_id column populated (gap #2 fix)')
  // Every documented ref field must be present.
  assert.equal(row.ref.source, 'idle_scheduler')
  assert.equal(row.ref.companyId, companyId)
  assert.equal(row.ref.status, 'avail')
  assert.equal(row.ref.agendaCards, 1)
  assert.equal(row.ref.agendaEvents, 0)
  assert.equal(row.ref.agendaVerdict, 'actionable')
  assert.equal(row.ref.agendaFocus, 'Drive it')
  assert.equal(Object.hasOwn(row.ref, 'lastSpoke'), true)
})

test('[integration] real classifyAgendaActionable wired through the LLM stub returns a clean verdict', async () => {
  // All other tests stub classifyAgendaActionable directly. This one
  // exercises the PRODUCTION classifier function so the prompt shape,
  // OpenAI client routing (getLlmClient → __setLlmClientOverrideForTesting),
  // JSON parsing, and the env.OPENAI_MODEL_SUPPORT model-arg are
  // actually covered. The LLM is stubbed to return canned JSON; no
  // network call happens.
  const { agentId, boardId, todoColumnId, humanId } = await seedCompanyWithAgent()
  await insertCard({
    boardId, columnId: todoColumnId, title: 'Ship the migration',
    assigneeId: agentId, mentions: [], createdBy: humanId,
  })

  let capturedModel: string | null = null
  let capturedFormat: unknown = null
  // The override expects `OpenAI`, but our classifier only touches
  // `responses.create` + the resulting `output_text`. Cast through
  // `unknown` to skip the bulk of the OpenAI surface area.
  __setLlmClientOverrideForTesting((async () => {
    return {
      responses: {
        create: async (req: { model?: string; text?: unknown }) => {
          capturedModel = req.model ?? null
          capturedFormat = req.text ?? null
          return {
            output_text: JSON.stringify({
              actionable: true,
              focus: 'Push the migration to staging',
              reason: 'one fresh assigned card',
            }),
          }
        },
      },
    }
  }) as unknown as Parameters<typeof __setLlmClientOverrideForTesting>[0])

  const wakes: CapturedWake[] = []
  __setIdleWakeForTesting(async (id, reason, conversationId, _steer, options) => {
    wakes.push({ agentId: id, reason, conversationId: conversationId ?? null, options })
  })
  // Deliberately DO NOT stub the classifier — we want the real one.
  // (Default state after _resetIdleForTests in beforeEach.)

  await runIdleTick()

  assert.equal(wakes.length, 1, 'real classifier should drive exactly one wake')
  assert.equal(wakes[0].reason, 'background_scan')
  const brief = wakes[0].options?.backgroundBrief
  assert.ok(brief)
  assert.equal(brief.title, 'Push the migration to staging')
  assert.match(brief.body, /Push the migration to staging/)

  // Cerebellum routing assertions — confirms the env wiring works
  // end-to-end. The model must be the SUPPORT tier, never the brain.
  assert.ok(capturedModel, 'model arg should be passed to responses.create')
  assert.notEqual(capturedModel, null)
  // We don't pin the exact model string (operators can override via env);
  // we pin the fact that strict-JSON formatting is requested, which is
  // the contract this classifier depends on.
  assert.deepEqual(capturedFormat, { format: { type: 'json_object' } })
})
