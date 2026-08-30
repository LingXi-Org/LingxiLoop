import type { JsonObject } from '../events/public.js'

export type EvidenceLevel = 'L1' | 'L2'
export type EvidenceDerivation = 'OBSERVED' | 'COMPUTED' | 'RUBRIC'
export type EvidenceActor = { type: 'SYSTEM' } | { type: 'USER' | 'AGENT'; id: string }
export type EvidenceTargetLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4'
export type EvidenceTargetKind =
  | 'DOMAIN_EVENT'
  | 'LEARNING_ATTEMPT'
  | 'LEARNING_EVALUATION'
  | 'CANVAS_REPORT'
  | 'AUDIT_EVENT'
  | 'AGENT_RUN'
  | 'EVIDENCE_RECORD'
export type EvidenceLinkRelation = 'SOURCE' | 'DERIVED_FROM' | 'CORROBORATES'

export interface EvidenceRecord<TData extends JsonObject = JsonObject> {
  id: string
  companyId: string
  projectId: string
  level: EvidenceLevel
  derivation: EvidenceDerivation
  kind: string
  subjectUserId?: string
  data: TData
  createdBy: EvidenceActor
  createdAt: string
}

export interface CreateEvidenceRecordInput<TData extends JsonObject> {
  id: string
  companyId: string
  projectId: string
  level: EvidenceLevel
  derivation: EvidenceDerivation
  kind: string
  subjectUserId?: string
  data: TData
  createdBy: EvidenceActor
}

export interface EvidenceLinkInput {
  relation: EvidenceLinkRelation
  targetLevel: EvidenceTargetLevel
  targetKind: EvidenceTargetKind
  targetId: string
}

export interface CreateEvidenceClaimInput {
  id: string
  companyId: string
  projectId: string
  subjectUserId?: string
  claimType: string
  statement: string
  modelRunId: string
  evidenceIds: string[]
}
