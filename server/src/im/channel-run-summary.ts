import type { createLingxiOS, RunSnapshot } from '@lyyzka/lingxios'
import type { ConversationRunSummary } from '../../../src/lib/conversationRunSummary.js'
import type { Queryable } from '../db/queryable.js'

type Runtime = Pick<Awaited<ReturnType<typeof createLingxiOS>>, 'listRuns' | 'readRun' | 'readApproval'>
type Record = Awaited<ReturnType<Runtime['listRuns']>>['items'][number]
type Scope = { companyId: string; userId: string; projectId: string }
type Action = 'conversation:read' | 'conversation:write' | 'agent_run:control'
interface Infrastructure {
  db: Queryable
  runtime: Runtime | (() => Promise<Runtime>)
  can(conversationId: string, action: Action): Promise<boolean>
}
interface Binding {
  run_id: string; conversation_id: string; session_id: string; agent_id: string; principal_id: string; thread_id: string | null
}
const STATUSES = ['waiting', 'leased', 'queued'] as const
const MAX_PAGES = 4
const PAGE_SIZE = 100
const MAX_WAIT_CHECKS = 6

function matches(run: Record, binding: Binding, scope: Scope): boolean {
  return run.id === binding.run_id && run.identity.runId === run.id
    && run.identity.tenantId === scope.companyId && run.identity.principalId === scope.userId
    && binding.principal_id === scope.userId && run.identity.agentId === binding.agent_id
    && run.identity.sessionId === binding.session_id && (run.identity.threadId ?? null) === binding.thread_id
}
function projection(run: RunSnapshot, actor: ConversationRunSummary['actor'] = 'system'): ConversationRunSummary {
  const base = { runId: run.id, requestVersion: run.requestVersion, fence: run.fence, actor }
  const kind = run.status === 'leased' ? 'processing' : run.status === 'succeeded' ? 'completed'
    : run.status === 'blocked' ? 'unknown' : run.status === 'waiting' ? 'unknown' : run.status
  return { ...base, kind }
}

/** Only bounded active metadata through the formal API. Never events, messages,
 * native SQL, worker admission or an inferred human actor. No cross-request cache. */
export async function readChannelRunSummaries(scope: Scope, channelIds: readonly string[], infrastructure: Infrastructure): Promise<{ [channelId: string]: ConversationRunSummary }> {
  if (!channelIds.length) return {}
  const { db, can } = infrastructure
  const sessions = (await db.query<{ conversation_id: string; session_id: string }>(`SELECT DISTINCT binding.conversation_id,binding.session_id
    FROM agent_run_bindings binding JOIN conversations room ON room.id=binding.conversation_id AND room.company_id=binding.company_id
    WHERE binding.company_id=$1 AND binding.principal_id=$2 AND room.project_id=$3
      AND room.members @> to_jsonb(ARRAY[$2::text]) AND binding.conversation_id=ANY($4::text[])
      AND NOT binding.internal AND binding.message_protocol=2`, [scope.companyId, scope.userId, scope.projectId, channelIds])).rows
  if (!sessions.length) return {}
  const runtime = typeof infrastructure.runtime === 'function' ? await infrastructure.runtime() : infrastructure.runtime
  const visible = new Set(sessions.map(row => row.conversation_id))
  const sessionIds = new Set(sessions.map(row => row.session_id))
  const pages = STATUSES.map(status => ({ status, cursor: undefined as string | undefined, done: false, frontier: Infinity }))
  const candidates = new Map<string, Record>()
  for (let round = 0; round < MAX_PAGES; round++) {
    const pending = pages.filter(page => !page.done)
    if (!pending.length) break
    const batches = await Promise.all(pending.map(async page => {
      const result = await runtime.listRuns({ tenantId: scope.companyId, principalId: scope.userId,
        ...(sessionIds.size === 1 ? { sessionId: [...sessionIds][0] } : {}), status: page.status, limit: PAGE_SIZE,
        ...(page.cursor ? { cursor: page.cursor } : {}) })
      page.cursor = result.nextCursor ?? undefined
      page.done = !result.nextCursor
      page.frontier = result.items.length ? Date.parse(result.items.at(-1)!.createdAt) : -Infinity
      return result.items.filter(run => run.identity.tenantId === scope.companyId && run.identity.principalId === scope.userId
        && sessionIds.has(run.identity.sessionId) && run.status === page.status
        && Number.isSafeInteger(run.requestVersion) && run.requestVersion > 0 && Number.isSafeInteger(run.fence) && run.fence >= 0)
    }))
    const runs = batches.flat()
    if (runs.length) {
      const bindings = (await db.query<Binding>(`SELECT binding.run_id,binding.conversation_id,binding.session_id,binding.agent_id,binding.principal_id,binding.thread_id
        FROM agent_run_bindings binding JOIN conversations room ON room.id=binding.conversation_id AND room.company_id=binding.company_id
        WHERE binding.company_id=$1 AND binding.principal_id=$2 AND room.project_id=$3
          AND binding.run_id=ANY($4::text[]) AND binding.conversation_id=ANY($5::text[])
          AND room.members @> to_jsonb(ARRAY[$2::text]) AND NOT binding.internal AND binding.message_protocol=2`,
      [scope.companyId, scope.userId, scope.projectId, runs.map(run => run.id), [...visible]])).rows
      const byId = new Map(bindings.map(binding => [binding.run_id, binding]))
      for (const run of runs) {
        const binding = byId.get(run.id)
        if (!binding || !visible.has(binding.conversation_id) || !matches(run, binding, scope)) continue
        const previous = candidates.get(binding.conversation_id)
        if (!previous || Date.parse(run.createdAt) > Date.parse(previous.createdAt)
          || run.createdAt === previous.createdAt && run.id > previous.id) candidates.set(binding.conversation_id, run)
      }
    }
    // All remaining pages are older than every selected latest-active run.
    if (candidates.size === visible.size) {
      const floor = Math.min(...[...candidates.values()].map(run => Date.parse(run.createdAt)))
      for (const page of pages) if (page.frontier <= floor) page.done = true
    }
  }
  const incompleteFrontier = Math.max(-Infinity, ...pages.filter(page => !page.done).map(page => page.frontier))
  const result: { [channelId: string]: ConversationRunSummary } = {}
  let waitChecks = 0
  for (const channelId of visible) {
    if (!await can(channelId, 'conversation:read')) continue
    const candidate = candidates.get(channelId)
    if (!candidate || Date.parse(candidate.createdAt) < incompleteFrontier) {
      if (incompleteFrontier > -Infinity) result[channelId] = { kind: 'unknown', actor: 'unknown' }
      continue
    }
    let current: RunSnapshot | null = candidate
    if (candidate.status === 'waiting') {
      if (waitChecks++ >= MAX_WAIT_CHECKS) { result[channelId] = { kind: 'unknown', actor: 'unknown' }; continue }
      // Recheck only selected waits, never every historical run. The formal read
      // fences cancellation/revision before assigning the next actor.
      current = await runtime.readRun(candidate.identity)
      if (!current || current.id !== candidate.id) continue
    }
    const summary = { ...projection(current), agentId: candidate.identity.agentId }
    if (current.status !== 'waiting') { result[channelId] = summary; continue }
    const outcome = current.goalOutcome
    if (!outcome || outcome.requestVersion !== current.requestVersion || current.requestVersion !== candidate.requestVersion || current.fence !== candidate.fence) {
      result[channelId] = { ...summary, kind: 'unknown', actor: 'unknown' }; continue
    }
    if (outcome.status === 'awaiting_approval') {
      const approval = await runtime.readApproval({ tenantId: scope.companyId, principalId: scope.userId, approvalId: outcome.approvalId })
      if (!approval || approval.approvalId !== outcome.approvalId || approval.runId !== current.id || approval.requestVersion !== current.requestVersion
        || approval.agentId !== candidate.identity.agentId || approval.principalId !== scope.userId) {
        result[channelId] = { ...summary, kind: 'unknown', actor: 'unknown' }; continue
      }
      const confirmed = await runtime.readRun(candidate.identity)
      if (!confirmed || confirmed.id !== current.id || confirmed.requestVersion !== current.requestVersion || confirmed.fence !== current.fence
        || confirmed.status !== 'waiting') {
        result[channelId] = confirmed ? { ...projection(confirmed), agentId: candidate.identity.agentId } : { kind: 'unknown', actor: 'unknown' }
        continue
      }
      result[channelId] = { ...summary, kind: approval.decision === null ? 'waiting_approval' : 'submitted',
        actor: approval.decision === null ? await can(channelId, 'agent_run:control') ? 'you' : 'unknown' : 'system' }
    } else if (outcome.status === 'awaiting_input') {
      const question = (await db.query<{ question_id: string; principal_id: string; submission_nonce: string | null }>(`SELECT question_id,principal_id,submission_nonce FROM im_questionnaires
        WHERE company_id=$1 AND channel_id=$2 AND run_id=$3 AND request_version=$4 AND agent_id=$5 AND principal_id=$6
          AND session_id=$7 AND thread_id IS NOT DISTINCT FROM $8 AND delivered_at IS NOT NULL`,
      [scope.companyId, channelId, current.id, current.requestVersion, candidate.identity.agentId, scope.userId,
        candidate.identity.sessionId, candidate.identity.threadId ?? null])).rows[0]
      result[channelId] = { ...summary, kind: question?.submission_nonce ? 'unknown' : 'waiting_input',
        actor: question && !question.submission_nonce && await can(channelId, 'conversation:write') ? 'you' : 'unknown' }
    } else result[channelId] = { ...summary, kind: outcome.status === 'delegated' ? 'delegated' : 'unknown', actor: outcome.status === 'delegated' ? 'system' : 'unknown' }
  }
  return result
}
