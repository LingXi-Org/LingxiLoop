
import { http } from '@/api/core/http'
import type { ApiAgentRunStatus, ApiAgentRun, ApiTriageEconomics, ApiAgentEvent, ApiDevtoolsCapabilities, ApiAgentWorkspaceFile, ApiAgentWorkspaceFileContent, } from './contracts'

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
  getTriageEconomics: (filters?: { agentId?: string | null; sinceHours?: number }) => {
    const q = new URLSearchParams()
    if (filters?.agentId) q.set('agentId', filters.agentId)
    if (filters?.sinceHours) q.set('sinceHours', String(filters.sinceHours))
    const suffix = q.toString() ? `?${q.toString()}` : ''
    return http<ApiTriageEconomics>(`/agents/observability/triage${suffix}`)
  },
  getDevtoolsCapabilities: () => http<ApiDevtoolsCapabilities>('/devtools/capabilities'),
  listAgentWorkspace: (agentId: string) =>
    http<ApiAgentWorkspaceFile[]>(`/devtools/agent-workspace?agentId=${encodeURIComponent(agentId)}`),
  readAgentWorkspaceFile: (agentId: string, path: string) =>
    http<ApiAgentWorkspaceFileContent>(
      `/devtools/agent-workspace/file?agentId=${encodeURIComponent(agentId)}&path=${encodeURIComponent(path)}`,
    )
}
