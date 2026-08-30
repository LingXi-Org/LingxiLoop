import { http } from '@/api/core/http'
import type {
  TrustContext,
  TrustEvalCase,
  TrustEvalRun,
  TrustEvidenceRecord,
  TrustKpi,
  TrustSnapshotReceipt,
} from './contracts'

const projectPath = (projectId: string) => `/trust/projects/${encodeURIComponent(projectId)}`

export const trustApi = {
  context: (projectId: string) => http<TrustContext>(`${projectPath(projectId)}/context?mode=LIVE`),
  kpis: (projectId: string) => http<TrustKpi[]>(`${projectPath(projectId)}/kpis?mode=LIVE`),
  evalTrend: (projectId: string) => http<TrustEvalRun[]>(`${projectPath(projectId)}/eval-trend?mode=LIVE`),
  evalCases: (projectId: string, runId: string) => http<TrustEvalCase[]>(
    `${projectPath(projectId)}/eval-cases?mode=LIVE&runId=${encodeURIComponent(runId)}`,
  ),
  evidenceChain: (projectId: string) => http<TrustEvidenceRecord[]>(
    `${projectPath(projectId)}/evidence-chain?mode=LIVE`,
  ),
  createSnapshot: (projectId: string, idempotencyKey: string) => http<TrustSnapshotReceipt>(
    `${projectPath(projectId)}/snapshots`,
    { method: 'POST', body: JSON.stringify({ idempotencyKey }) },
  ),
}
