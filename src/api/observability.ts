
import { http } from '@/api/core/http'
import type { ApiAgentRunStatus, ApiAgentRun, ApiAgentEvent } from './contracts'

export const observabilityApi = {
  getAgentRuns: (filters?: { agentId?: string | null; status?: ApiAgentRunStatus | 'all'; limit?: number }) => {
    const q = new URLSearchParams()
    if (filters?.agentId) q.set('agentId', filters.agentId)
    if (filters?.status && filters.status !== 'all') q.set('status', filters.status)
    if (filters?.limit) q.set('limit', String(filters.limit))
    const suffix = q.toString() ? `?${q.toString()}` : ''
    return http<ApiAgentRun[]>(`/agents/observability/runs${suffix}`)
  },
  getAgentRunEvents: (runId: string) =>
    http<ApiAgentEvent[]>(`/agents/observability/runs/${encodeURIComponent(runId)}/events`),
}
