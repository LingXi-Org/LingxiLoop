import { randomUUID } from 'node:crypto'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { sendAgentChannelMessage } from '../../im/public.js'
import type { WorkerTaskHandle } from '../../runtime/lifecycle.js'
import { listBriefingAttentionItemIds } from '../attention/public.js'
import { findTeacherOperationsContextForTeacher } from '../context-threads/public.js'
import { summarizeProjectEventWindow } from '../events/public.js'
import { TEACHER_BRIEFING_POLICY_V1 } from './policy.js'
import { teacherBriefingIdentity } from './identity.js'
import { teacherBriefingDashboard } from './dashboard.js'
import {
  claimTeacherBriefings,
  insertTeacherBriefing,
  listBriefingVisitCandidates,
  listPreviousTeacherBriefingStatistics,
  lockProjectVisit,
  markTeacherBriefingFailed,
  markTeacherBriefingSent,
} from './repository.js'

async function materializePendingBriefings(): Promise<void> {
  for (const candidate of await listBriefingVisitCandidates(pool)) {
    await withTransaction(pool, async (db) => {
      const visit = await lockProjectVisit(db, candidate)
      if (!visit
        || visit.meaningful_visit_version !== candidate.meaningful_visit_version
        || Number(visit.visit_event_sequence) <= Number(visit.event_sequence_watermark)) return
      const context = await findTeacherOperationsContextForTeacher(db, {
        companyId: visit.company_id,
        projectId: visit.project_id,
        teacherUserId: visit.user_id,
      })
      if (!context) return
      const window = {
        companyId: visit.company_id,
        projectId: visit.project_id,
        afterSequence: Number(visit.event_sequence_watermark),
        throughSequence: Number(visit.visit_event_sequence),
      }
      const [eventTypes, attentionItemIds] = await Promise.all([
        summarizeProjectEventWindow(db, window),
        listBriefingAttentionItemIds(db, {
          ...window,
          teacherUserId: visit.user_id,
          limit: TEACHER_BRIEFING_POLICY_V1.maxAttentionItems,
        }),
      ])
      const eventCount = Object.values(eventTypes).reduce((sum, count) => sum + count, 0)
      const statistics = { eventCount, attentionCount: attentionItemIds.length, ...eventTypes }
      const summary = `自上次简报后有 ${eventCount} 项更新，${attentionItemIds.length} 项需要关注。`
      const identity = teacherBriefingIdentity({
        companyId: visit.company_id,
        projectId: visit.project_id,
        teacherUserId: visit.user_id,
        meaningfulVisitVersion: visit.meaningful_visit_version,
      })
      await insertTeacherBriefing(db, {
        id: identity.id,
        visit,
        contextThreadId: context.id,
        channelId: context.channelId,
        senderAgentId: context.agentId,
        policyVersion: TEACHER_BRIEFING_POLICY_V1.version,
        statistics,
        summary,
        clientMsgNo: identity.clientMsgNo,
        attentionItemIds,
      })
    })
  }
}

async function deliverPendingBriefings(now: Date): Promise<void> {
  const leaseToken = randomUUID()
  for (const briefing of await withTransaction(pool, (db) => claimTeacherBriefings(db, now, leaseToken))) {
    try {
      const previousStatistics = await listPreviousTeacherBriefingStatistics(pool, briefing)
      const sent = await sendAgentChannelMessage({
        companyId: briefing.company_id,
        agentId: briefing.agent_id,
        channelId: briefing.channel_id,
        clientNonce: briefing.client_msg_no,
        payload: {
          version: 1,
          kind: 'system',
          clientMsgNo: briefing.client_msg_no,
          body: briefing.summary,
          refs: { briefingId: briefing.id, attentionItemIds: briefing.attention_item_ids },
          data: {
            type: 'teacher_briefing',
            dashboard: teacherBriefingDashboard(briefing, previousStatistics),
          },
        },
      })
      if (sent.kind !== 'accepted') throw new Error(`Teacher Briefing send rejected: ${sent.kind}`)
      await withTransaction(pool, (db) => markTeacherBriefingSent(db, {
        id: briefing.id,
        leaseToken: briefing.lease_token,
        messageId: sent.messageId,
        messageSequence: sent.sequence,
      }))
    } catch (error) {
      await withTransaction(pool, (db) => markTeacherBriefingFailed(db, {
        id: briefing.id,
        leaseToken: briefing.lease_token,
        error: error instanceof Error ? error.message : String(error),
      }))
    }
  }
}

export async function runTeacherBriefingSweep(now = new Date()): Promise<void> {
  await materializePendingBriefings()
  await deliverPendingBriefings(now)
}

export function startTeacherBriefingWorker(
  intervalMs = Number(process.env.TEACHER_BRIEFING_INTERVAL_MS ?? 10_000),
): WorkerTaskHandle | null {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null
  const tick = () => void runTeacherBriefingSweep().catch((error) => {
    console.warn('[briefings] sweep failed:', error instanceof Error ? error.message : String(error))
  })
  const immediate = setImmediate(tick)
  const timer = setInterval(tick, Math.max(5_000, intervalMs))
  timer.unref?.()
  return { stop: () => { clearImmediate(immediate); clearInterval(timer) } }
}
