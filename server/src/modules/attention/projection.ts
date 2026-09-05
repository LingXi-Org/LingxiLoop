import { createHash } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { listActiveProjectTeacherIds } from '../access/public.js'
import type { AttentionReason, AttentionRuleSet, AttentionSourceEvent } from './contracts.js'
import {
  acknowledgeDetectedAttention,
  markAttentionEventProjected,
  resolveCaseAttention,
  upsertOpenAttentionItem,
} from './projection-repository.js'

function itemId(event: AttentionSourceEvent, teacherUserId: string, reason: AttentionReason): string {
  return `attention-${createHash('sha256')
    .update([event.company_id, event.project_id, teacherUserId, event.case_id, reason, event.sequence].join('\0'))
    .digest('hex').slice(0, 24)}`
}

export async function projectAttentionEvent(
  db: Queryable,
  event: AttentionSourceEvent,
  rules: AttentionRuleSet,
): Promise<void> {
  const kind = event.payload.kind
  const result = event.payload.result
  const toStatus = event.payload.toStatus
  const reason: AttentionReason | null = event.event_type === 'LEARNING_CASE.DETECTED'
    ? 'CASE_DETECTED'
    : kind === 'ESCALATE' && result === 'APPLIED'
      ? 'CASE_ESCALATED'
      : null

  if (reason) {
    const rule = rules.rules[reason]
    for (const teacherUserId of await listActiveProjectTeacherIds(db, {
      companyId: event.company_id, projectId: event.project_id,
    })) {
      await upsertOpenAttentionItem(db, {
        id: itemId(event, teacherUserId, reason), event, teacherUserId, reason,
        ruleVersion: rules.version, rankScore: rule.rankScore, expectedMinutes: rule.expectedMinutes,
      })
    }
  }
  if (event.event_type === 'LEARNING_CASE.ACTION_APPLIED' && result === 'APPLIED') {
    await acknowledgeDetectedAttention(db, event)
    if (toStatus === 'RESOLVED' || toStatus === 'CLOSED') await resolveCaseAttention(db, event)
  }
  await markAttentionEventProjected(db, event)
}
