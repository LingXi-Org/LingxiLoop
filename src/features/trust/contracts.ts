export type TrustAudienceLevel = 'L2' | 'L3'

export interface TrustContext {
  mode: 'LIVE'
  companyId: string
  projectId: string
  project: { name: string; kind: string; status: string }
  audienceLevel: TrustAudienceLevel
  maximumEvidenceLevel: TrustAudienceLevel
}

export interface TrustKpi {
  id: string
  label: string
  value: number
  threshold: number
  numerator: number
  denominator: number
  window: { from: string; to: string }
  source: string
  dataset: string
  release: string
  updatedAt: string
  evidenceId: string
}

export interface TrustEvalRun {
  id: string
  suiteKey: string
  suiteName: string
  release: string
  status: string
  score: number | null
  passThreshold: number
  caseCount: number
  passedCases: number
  failedCases: number
  updatedAt: string | null
}

export interface TrustEvalCase {
  id: string
  caseId: string
  name: string
  status: string
  score: number | null
  failureCount: number
}

export interface TrustEvidenceRecord {
  id: string
  level: 'L1' | 'L2'
  derivation: 'OBSERVED' | 'COMPUTED' | 'RUBRIC'
  kind: string
  createdBy: { type: 'SYSTEM' } | { type: 'USER' | 'AGENT'; id: string }
  createdAt: string
  links: Array<{
    relation: 'SOURCE' | 'DERIVED_FROM' | 'CORROBORATES'
    targetLevel: 'L0' | 'L1' | 'L2' | 'L3'
    targetKind: string
    targetId: string
  }>
}

export interface TrustSnapshotReceipt {
  id: string
  evidenceId: string
  payloadHash: string
  signature: string
}
