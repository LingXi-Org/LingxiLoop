
import { http as rootHttp } from '@/api/core/http'

const http = <T>(path: string, init?: RequestInit) => rootHttp<T>(`/admin${path}`, init)

export interface AdminUser {
  id: string
  email: string
  name: string
  /** Persisted user avatar URL. */
  avatarUrl: string | null
  isAdmin: boolean
  createdAt: string
  lastLoginAt: string | null
  companyCount: number
  /** Suspension snapshot. `suspended` is the derived boolean the row
   *  badges off; the timestamp + reason + actor are surfaced in the
   *  detail drawer. All three nested fields are null when the account
   *  is active. */
  suspended: boolean
  suspendedAt: string | null
  suspensionReason: string | null
  suspendedBy: string | null
}

export interface AdminUserDetail extends AdminUser {
  companies: Array<{
    id: string
    name: string
    slug: string
    role: string
    createdAt: string
    agentCount: number
  }>
}

export interface AdminWaitlistEntry {
  id: string
  provider: string
  providerId: string
  email: string
  displayName: string
  avatarUrl: string | null
  status: 'pending' | 'approved' | 'rejected'
  note: string | null
  requestedAt: string
  decidedAt: string | null
  decidedBy: string | null
}

export interface AdminSettings {
  waitlist_enabled: boolean
  signups_paused: boolean
}

export interface AdminStats {
  users: { total: number; admins: number }
  waitlist: { pending: number; approved: number; rejected: number }
  companies: number
  agents: number
}

export type EvalDimensionName = 'answer' | 'teaching' | 'rag' | 'tools' | 'safety' | 'task' | 'collaboration' | 'efficiency'
export type EvalStageName = 'ingest' | EvalDimensionName | 'aggregate'
export type EvalStageStatus = 'pass' | 'fail' | 'skipped' | 'error'

export interface EvalFinding {
  checkId: string
  status: 'pass' | 'fail' | 'not_observed'
  severity: 'info' | 'warning' | 'error'
  message: string
  category?: string
  expected?: unknown
  actual?: unknown
}

export interface EvalStageResult {
  stage: EvalStageName
  status: EvalStageStatus
  score: number | null
  durationMs: number
  findings: EvalFinding[]
  metrics: Record<string, number | string | boolean | null>
  failureReason: string | null
}

export interface EvalRunSummary {
  caseCount: number
  passedCases: number
  failedCases: number
  errorCases: number
  stageScores: Record<EvalDimensionName, number | null>
  stageStatuses: Record<EvalDimensionName, EvalStageStatus>
  failureCategories: Record<string, number>
  resources: {
    averageLatencyMs: number | null
    totalTokens: number
    totalCostUsd: number
    modelCalls: number
    ipythonCells: number
    toolCalls: number
  }
}

export interface EvalDashboardRun {
  id: string
  suiteKey: string
  suiteName: string
  version: string
  target: { commitSha?: string; promptVersion?: string; model?: string }
  baselineRunId: string | null
  status: 'pass' | 'fail' | 'error'
  score: number
  passThreshold: number
  caseCount: number
  passedCases: number
  failedCases: number
  errorCases: number
  source: 'inline' | 'agent-os' | 'mixed'
  summary: EvalRunSummary
  metadata: Record<string, unknown>
  createdBy: string
  createdAt: string
  finishedAt: string
  baselineScore: number | null
  scoreDelta: number | null
}

export interface EvalDashboardPayload {
  summary: {
    totalRuns: number
    passRate: number
    averageScore: number
    failedRuns: number
    suites: number
    averageLatencyMs: number | null
    totalTokens: number
    totalCostUsd: number
  }
  runs: EvalDashboardRun[]
  stageAverages: EvalRunSummary['stageScores']
  failureClusters: Array<{ category: string; count: number; runCount: number }>
}

export interface EvalTraceEvent {
  id: string
  kind: 'input' | 'decision' | 'model' | 'ipython' | 'host_action' | 'approval' | 'canvas' | 'answer'
  label: string
  status: 'started' | 'completed' | 'failed' | 'pending' | 'skipped'
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  agentId?: string
  hop?: number
  cellId?: string
  action?: string
  input?: unknown
  output?: unknown
  metadata?: Record<string, unknown>
}

export interface EvalCaseDetail {
  id: string
  caseId: string
  name: string
  position: number
  sourceAgentRunId: string | null
  status: 'pass' | 'fail' | 'error'
  score: number
  observation: Record<string, unknown>
  expectations: Record<string, unknown>
  failureReasons: string[]
  failureCategories: string[]
  stages: EvalStageResult[]
}

export interface EvalRunDetail extends EvalDashboardRun {
  cases: EvalCaseDetail[]
}

export interface EvalCreateRunRequest {
  schemaVersion?: 'lingxiloop.eval.v1'
  suiteKey: string
  suiteName?: string
  version: string
  target?: { commitSha?: string; promptVersion?: string; model?: string }
  baselineRunId?: string
  passThreshold?: number
  cases: Array<{
    caseId: string
    name?: string
    sourceAgentRunId?: string
    observation?: Record<string, unknown>
    expectations: Record<string, unknown>
    metadata?: Record<string, unknown>
  }>
  metadata?: Record<string, unknown>
}

export interface EvalComparison {
  base: EvalDashboardRun
  candidate: EvalDashboardRun
  scoreDelta: number
  targetChanges: Array<{ field: 'commitSha' | 'promptVersion' | 'model'; base: string | null; candidate: string | null }>
  stageDeltas: Array<{ stage: EvalDimensionName; base: number | null; candidate: number | null; delta: number | null }>
  caseDeltas: Array<{
    caseId: string
    name: string
    base: number | null
    candidate: number | null
    delta: number | null
    status: 'improved' | 'regressed' | 'unchanged' | 'added' | 'removed'
    stageDeltas: Array<{ stage: EvalDimensionName; base: number | null; candidate: number | null; delta: number | null }>
    addedFailureCategories: string[]
    resolvedFailureCategories: string[]
  }>
}

export const adminApi = {
  me: () => http<{ userId: string; isAdmin: true }>('/me'),
  stats: () => http<AdminStats>('/stats'),

  evalDashboard: (params: { suiteKey?: string; sinceDays?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams()
    if (params.suiteKey) qs.set('suiteKey', params.suiteKey)
    if (params.sinceDays) qs.set('sinceDays', String(params.sinceDays))
    if (params.limit) qs.set('limit', String(params.limit))
    const suffix = qs.toString()
    return http<EvalDashboardPayload>(suffix ? `/eval/runs?${suffix}` : '/eval/runs')
  },
  evalRun: (id: string) => http<EvalRunDetail>(`/eval/runs/${encodeURIComponent(id)}`),
  createEvalRun: (input: EvalCreateRunRequest) =>
    http<{ id: string; report: Record<string, unknown> }>('/eval/runs', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  evalComparison: (baseRunId: string, candidateRunId: string) => {
    const qs = new URLSearchParams({ baseRunId, candidateRunId })
    return http<EvalComparison>(`/eval/compare?${qs.toString()}`)
  },

  settings: () => http<AdminSettings>('/settings'),
  setSettings: (patch: Partial<AdminSettings>) =>
    http<AdminSettings>('/settings', { method: 'PUT', body: JSON.stringify(patch) }),

  listUsers: (params: { q?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams()
    if (params.q)      qs.set('q', params.q)
    if (params.limit)  qs.set('limit', String(params.limit))
    if (params.offset) qs.set('offset', String(params.offset))
    const s = qs.toString()
    return http<{ items: AdminUser[]; total: number; limit: number; offset: number }>(
      s ? `/users?${s}` : '/users',
    )
  },
  getUser: (id: string) => http<AdminUserDetail>(`/users/${id}`),
  patchUser: (
    id: string,
    patch: { isAdmin?: boolean; suspended?: boolean; suspensionReason?: string | null },
  ) =>
    http<AdminUser>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  /** Convenience wrappers around patchUser — the panel uses these for the
   *  two suspend/unsuspend buttons. Server-side they hit the same PATCH
   *  endpoint; keeping the call sites readable. */
  suspendUser: (id: string, reason: string | null) =>
    http<AdminUser>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ suspended: true, suspensionReason: reason }),
    }),
  unsuspendUser: (id: string) =>
    http<AdminUser>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ suspended: false }),
    }),

  listWaitlist: (params: {
    status?: 'pending' | 'approved' | 'rejected'
    q?: string
    limit?: number
    offset?: number
  } = {}) => {
    const qs = new URLSearchParams()
    if (params.status) qs.set('status', params.status)
    if (params.q) qs.set('q', params.q)
    if (params.limit)  qs.set('limit', String(params.limit))
    if (params.offset) qs.set('offset', String(params.offset))
    const s = qs.toString()
    return http<{ items: AdminWaitlistEntry[]; total: number; limit: number; offset: number }>(
      s ? `/waitlist?${s}` : '/waitlist',
    )
  },
  approveWaitlist: (id: string) =>
    http<{ userId: string; companyId: string | null }>(`/waitlist/${id}/approve`, { method: 'POST' }),
  rejectWaitlist: (id: string, note?: string) =>
    http<{ ok: true }>(`/waitlist/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(note ? { note } : {}),
    }),
}
