
import { http } from '@/api/core/http'
import type {
  AgentInput,
  ApiAutonomy,
  ApiAutonomyRule,
  CoworkerActivity,
  ApiLearnedMemory,
  ApiParticipant,
} from './contracts'

export const agentsApi = {
  getParticipants: () => http<ApiParticipant[]>('/participants'),
  stopAgentRun: (agentId: string, channelId: string) =>
    http<{ ok: boolean; workId: string }>('/im/runs/stop', {
      method: 'POST', body: JSON.stringify({ agentId, channelId }),
    }),
  steerAgentRun: (agentId: string, channelId: string, text: string) =>
    http<{ ok: boolean; workId: string; steerId: string }>('/im/runs/steer', {
      method: 'POST', body: JSON.stringify({ agentId, channelId, text, clientRequestId: crypto.randomUUID() }),
    }),
  createAgent: (input: AgentInput) =>
    http<{ id: string }>('/agents', { method: 'POST', body: JSON.stringify(input) }),
  updateAgent: (id: string, input: AgentInput) =>
    http<{ ok: boolean }>(`/agents/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }),
  offboardAgent: (id: string) =>
    http<{ ok: boolean; departedAt: string }>(`/agents/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  rehireAgent: (id: string) =>
    http<{ ok: boolean }>(`/agents/${encodeURIComponent(id)}/rehire`, { method: 'POST' }),
  getPreferences: () => http<Record<string, unknown>>('/me/preferences'),
  putPreferences: (prefs: Record<string, unknown>) =>
    http<{ ok: boolean }>('/me/preferences', { method: 'PUT', body: JSON.stringify(prefs) }),
  getAllAutonomy: () => http<ApiAutonomy[]>('/agents/autonomy'),
  putAutonomy: (agentId: string, threshold: number) =>
    http<{ ok: boolean; threshold: number }>(`/agents/${encodeURIComponent(agentId)}/autonomy`, {
      method: 'PUT',
      body: JSON.stringify({ threshold }),
    }),
  getCoworkerActivity: (conversationId: string) =>
    http<CoworkerActivity[]>(`/coworker/activity?conversationId=${encodeURIComponent(conversationId)}`),
  resolveApproval: (approvalId: string, decision: 'approved' | 'rejected') => {
    const path = `/im/approvals/${encodeURIComponent(approvalId)}/resolve`
    const init = { method: 'POST', body: JSON.stringify({ approved: decision === 'approved' }) }
    return http<{ ok: boolean; approved: boolean; result?: unknown; error?: string | null }>(path, init)
  },
  supersedeApproval: (approvalId: string, input: { args: Record<string, unknown>; summary?: string }) =>
    http<{ approvalId: string; supersedesApprovalId: string }>(`/im/approvals/${encodeURIComponent(approvalId)}/supersede`, {
      method: 'POST', body: JSON.stringify(input),
    }),
  getLearnedMemories: () => http<ApiLearnedMemory[]>('/coworker/memories'),
  updateLearnedMemory: (input: { agentId: string; path: string; body: string }) =>
    http<ApiLearnedMemory>('/coworker/memories', { method: 'PATCH', body: JSON.stringify(input) }),
  forgetLearnedMemory: (agentId: string, path: string) =>
    http<{ ok: boolean }>(`/coworker/memories?agentId=${encodeURIComponent(agentId)}&path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
  getAutonomyRules: () => http<ApiAutonomyRule[]>('/coworker/autonomy-rules'),
  putAutonomyRule: (input: { agentId: string; scope: string; operation: string; mode: 'allow' | 'ask' | 'deny' }) =>
    http<ApiAutonomyRule>('/coworker/autonomy-rules', { method: 'PUT', body: JSON.stringify(input) }),
  deleteAutonomyRule: (id: string) =>
    http<{ ok: boolean }>(`/coworker/autonomy-rules/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
