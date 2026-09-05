import type { AttentionStatus } from '../../domain/attention/public.js'

export const ATTENTION_REASONS = ['CASE_DETECTED', 'CASE_ESCALATED'] as const
export type AttentionReason = typeof ATTENTION_REASONS[number]

export interface AttentionRuleSet {
  version: string
  rules: Readonly<Record<AttentionReason, { expectedMinutes: number; rankScore: number }>>
}

export interface AttentionItem {
  id: string
  companyId: string
  projectId: string
  teacherUserId: string
  caseId: string
  learnerUserId: string
  knowledgeUnitId: string
  reason: AttentionReason
  status: AttentionStatus
  sourceEventSequence: string
  ruleVersion: string
  rankScore: number
  expectedMinutes: number
  occurrenceCount: number
  version: number
  deferredUntil: string | null
  resolutionReason: string | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

export interface AttentionSourceEvent {
  sequence: string
  company_id: string
  project_id: string
  event_type: 'LEARNING_CASE.DETECTED' | 'LEARNING_CASE.ACTION_APPLIED'
  actor_id: string | null
  payload: Record<string, unknown>
  case_id: string
  learner_user_id: string
  knowledge_unit_id: string
}
