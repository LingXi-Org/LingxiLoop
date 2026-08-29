import { http as rootHttp } from '@/api/core/http'
import type {
  EvalComparison,
  EvalCreateRunRequest,
  EvalDashboardPayload,
  EvalRunDetail,
} from './contracts'

const http = <T>(path: string, init?: RequestInit) => rootHttp<T>(`/admin/eval${path}`, init)

export const evalApi = {
  dashboard: (params: { suiteKey?: string; sinceDays?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams()
    if (params.suiteKey) qs.set('suiteKey', params.suiteKey)
    if (params.sinceDays) qs.set('sinceDays', String(params.sinceDays))
    if (params.limit) qs.set('limit', String(params.limit))
    const suffix = qs.toString()
    return http<EvalDashboardPayload>(suffix ? `/runs?${suffix}` : '/runs')
  },
  run: (id: string) => http<EvalRunDetail>(`/runs/${encodeURIComponent(id)}`),
  createRun: (input: EvalCreateRunRequest) =>
    http<{ id: string; report: Record<string, unknown> }>('/runs', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  comparison: (baseRunId: string, candidateRunId: string) => {
    const qs = new URLSearchParams({ baseRunId, candidateRunId })
    return http<EvalComparison>(`/compare?${qs.toString()}`)
  },
}
