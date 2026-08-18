/**
 * Kanban / pull-group benchmark — actual-deliverable production capability.
 *
 * Structural scoring (the harness checks DB state, not artifact quality):
 *   - Did the assigned card MOVE to a "done"-pattern column within the
 *     wall-clock budget? (The single most decisive signal: someone
 *     actually drove the card to completion, not just chatted about it.)
 *   - Did at least 2 distinct agents post messages in the convo? (No
 *     single-agent monologue — multi-agent handoff actually happened.)
 *   - Did the card description GROW significantly? (Optional positive
 *     signal that real work landed in the card, not just chat.)
 *
 * What we DON'T test (would need an LLM judge or human review):
 *   - Quality of the produced artifact (is the doc good? is the code
 *     correct?). The bar here is "the coord stack drove a card to done";
 *     content quality is a separate eval.
 *
 * Setup contract:
 *   - The harness needs a `BENCH_KANBAN_BOARD_ID` env var pointing at an
 *     EXISTING board the benchmark can append cards to. We do NOT create
 *     boards/columns here because their lifecycle is operator-owned and
 *     leaving leftover boards on every run pollutes the company.
 *   - That board MUST have columns named in a recognizable pattern; the
 *     setup picks the first non-done column for the card's initial home
 *     and the first done-pattern column as the target. (Same regex the
 *     agenda module already uses for "card is in non-done.")
 *   - The harness creates a card per trial; teardown is NOT automated
 *     (cards stay so trends can be reviewed). If that's a problem,
 *     periodically run a cleanup script on cards with title prefix
 *     "bench:kanban".
 *
 * Configurable inputs:
 *   - BENCH_KANBAN_BOARD_ID — required (set in CI secrets).
 *   - BENCH_KANBAN_AGENTS — comma-separated. The first listed becomes
 *     the card's primary assignee; the rest are @-mentioned.
 *   - BENCH_KANBAN_CARD_TITLE — title for the test card (default
 *     "bench:kanban TASK").
 *   - BENCH_KANBAN_CARD_BODY — initial card body. Default is a small,
 *     actionable doc-writing task.
 *   - BENCH_KANBAN_TIMEOUT_MS — wall-clock budget (default 30min).
 *   - BENCH_KANBAN_TRIALS — number of independent trials (default 2).
 */

import { randomUUID } from 'node:crypto'
import type { Scenario, TrialMetrics } from '../lib/types.ts'

const DEFAULT_AGENTS = 'atlas-e346,bram-a520,ethan-caldwell,iris-7c5e,marcus-reed,nova-877e'
const DEFAULT_TITLE = 'bench:kanban TASK'
const DEFAULT_BODY = `Quick collaborative deliverable: produce a short markdown doc
(~150 words, 3 paragraphs) explaining what makes a multi-agent team
coordinate well. The doc should be ONE shared file; please claim the
work via \`cumora card claim\`, write the draft, post-link the doc in
this conversation, and move the card to a done column when finished.`

const DONE_COLUMN_RE = /\b(done|complete|completed|shipped|archive|closed|完成|已完成)\b/i

function envInt(name: string, dflt: number): number {
  const v = process.env[name]
  if (!v) return dflt
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : dflt
}
function envStr(name: string, dflt: string): string { return process.env[name] || dflt }

const agentIds = envStr('BENCH_KANBAN_AGENTS', DEFAULT_AGENTS).split(',').map((s) => s.trim()).filter(Boolean)
const cardTitle = envStr('BENCH_KANBAN_CARD_TITLE', DEFAULT_TITLE)
const cardBody = envStr('BENCH_KANBAN_CARD_BODY', DEFAULT_BODY)

interface KanbanScratch {
  boardId: string
  cardId: string
  startColumnId: string
  startColumnTitle: string
  initialBodyLen: number
  /** Map of column_id → title, captured at trial-start so computeMetrics
   *  knows which columns are "done"-pattern without re-fetching. */
  columnTitles: Record<string, string>
}

async function setupTrial({ pool, conversationId, benchCompany, benchUser, scratch }: {
  pool: import('pg').Pool
  conversationId: string
  benchCompany: string
  benchUser: string
  scratch: Record<string, unknown>
}): Promise<void> {
  const boardId = process.env.BENCH_KANBAN_BOARD_ID
  if (!boardId) throw new Error('BENCH_KANBAN_BOARD_ID required for kanban benchmark')

  // Pull the board's columns in position order so we can pick a non-done
  // start column and detect done columns later.
  const { rows: cols } = await pool.query<{ id: string; title: string; position: number }>(
    `SELECT id, title, position FROM board_columns WHERE board_id = $1 ORDER BY position ASC`,
    [boardId],
  )
  if (cols.length < 2) {
    throw new Error(`kanban board ${boardId} needs at least 2 columns (got ${cols.length}); add a todo + done column`)
  }
  const nonDone = cols.find((c) => !DONE_COLUMN_RE.test(c.title))
  if (!nonDone) {
    throw new Error(`kanban board ${boardId} has no non-done columns — all look done-shaped: ${cols.map((c) => c.title).join(', ')}`)
  }

  const cardId = `card-${randomUUID().slice(0, 8)}`
  // Primary assignee is the first agent in the list; rest are @-mentioned.
  const [primaryAssignee, ...rest] = agentIds
  if (!primaryAssignee) throw new Error('kanban: at least one agent required')
  await pool.query(
    `INSERT INTO board_cards (id, board_id, column_id, title, description, position, assignee_id, mentions, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 0, $6, $7::jsonb, $8, NOW(), NOW())`,
    [cardId, boardId, nonDone.id, `${cardTitle} ${conversationId.slice(2)}`, cardBody, primaryAssignee, JSON.stringify(rest), benchUser],
  )

  const k: KanbanScratch = {
    boardId,
    cardId,
    startColumnId: nonDone.id,
    startColumnTitle: nonDone.title,
    initialBodyLen: cardBody.length,
    columnTitles: Object.fromEntries(cols.map((c) => [c.id, c.title])),
  }
  Object.assign(scratch, k)
}

async function computeMetrics(ctx: Parameters<Scenario['computeMetrics']>[0]): Promise<TrialMetrics> {
  const s = ctx.scratch as Record<string, unknown> & Partial<KanbanScratch>
  const agentPosts = ctx.messages.filter((m) => m.sequence > 1 && m.kind === 'text').filter((m) => !m.body.startsWith('{'))

  let cardMovedToDone = false
  let currentColumnTitle = s.startColumnTitle ?? '(unknown)'
  let currentBodyLen = s.initialBodyLen ?? 0
  if (ctx.pool && s.cardId && s.columnTitles) {
    const { rows } = await ctx.pool.query<{ column_id: string; description: string }>(
      `SELECT column_id, description FROM board_cards WHERE id = $1`,
      [s.cardId],
    )
    if (rows.length === 1) {
      const row = rows[0]!
      currentColumnTitle = s.columnTitles[row.column_id] ?? '(unknown)'
      currentBodyLen = (row.description ?? '').length
      cardMovedToDone = DONE_COLUMN_RE.test(currentColumnTitle)
    }
  }

  const bodyGrew = (currentBodyLen - (s.initialBodyLen ?? 0)) > 100  // ~100 chars = meaningful edit
  const uniqueContributors = new Set(agentPosts.map((m) => m.authorId)).size
  const multiAgent = uniqueContributors >= 2

  return {
    complete: cardMovedToDone && multiAgent,
    durationMs: ctx.durationMs,
    totalPosts: agentPosts.length,
    uniqueContributors,
    verbatimCollisions: 0,
    extra: {
      cardId: s.cardId ?? null,
      startColumnTitle: s.startColumnTitle ?? null,
      currentColumnTitle,
      cardMovedToDone,
      bodyGrew,
      initialBodyLen: s.initialBodyLen ?? 0,
      currentBodyLen,
      multiAgent,
    },
  }
}

export const kanbanScenario: Scenario = {
  id: 'kanban',
  description: 'Pull-group on a real card; tests actual-deliverable production via agenda heartbeat + multi-agent handoff.',
  agents: agentIds.map((id) => ({ id })),
  seed: `@all 我们一起把卡片 "${cardTitle}" 做掉。看板里已经创建好了，认领→做→挪到 done 列。`,
  setupTrial,
  timeoutMs: envInt('BENCH_KANBAN_TIMEOUT_MS', 30 * 60_000),
  trials: envInt('BENCH_KANBAN_TRIALS', 2),
  computeMetrics,
  passCriterion: (all) => {
    if (all.length === 0) return { pass: false, reason: 'no trials ran' }
    const completed = all.filter((m) => m.complete).length
    const rate = completed / all.length
    // Kanban floor: ≥50% trials must have the card moved to done AND
    // multi-agent participation. The bar is similar to werewolf — these
    // games are long, stochastic, and end-to-end. One failure in two
    // is acceptable on a single benchmark run; a TREND of failures is
    // what indicates regression.
    if (rate < 0.5) {
      return { pass: false, score: rate, reason: `card-to-done rate ${(rate * 100).toFixed(0)}% < 50% floor` }
    }
    return { pass: true, score: rate }
  },
}
