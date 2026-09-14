
import { http } from '@/api/core/http'
import type { HarnessContext } from '@lyyzka/lingxios'
import type {
  AgentInput,
  ApiAutonomy,
  CoworkerActivity,
  ApiParticipant,
} from './contracts'

export const agentsApi = {
  getHarness: () => http<HarnessContext>('/agents/harness'),
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
}
