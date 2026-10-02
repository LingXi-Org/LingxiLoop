import { AssistantStream, AssistantTransportDecoder, AssistantTransportDeltaTracker } from 'assistant-stream'
import type { ResponseEnvelope, RunState } from '@lyyzka/lingxios/ui'
import { API, http } from '@/api/core/http'
import { lingxiApiFetch } from '@/api/transport'
import { getActiveCompanyId } from '@/stores/auth'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import type { AgentRunSnapshot } from '@/lib/agentRunSnapshot'

export interface AgentRunTarget { conversationId: string; agentId: string; runId: string; threadId?: string }
export type AgentRunResponse = AgentRunSnapshot
export interface MemorySummaryPage {
  items: Array<{ id: string; text: string; agentId: string; agentName: string }>
  nextCursor: string | null
}
const path = (target: AgentRunTarget) => `/im/channels/${encodeURIComponent(target.conversationId)}/agents/${encodeURIComponent(target.agentId)}/runs/${encodeURIComponent(target.runId)}`
const thread = (target: AgentRunTarget): Record<string, string> => target.threadId ? { threadId: target.threadId } : {}

export const harnessApi = {
  memories: (conversationId: string, query: { threadId?: string; cursor?: string }, signal?: AbortSignal) => http<MemorySummaryPage>(
    `/im/channels/${encodeURIComponent(conversationId)}/memories?${new URLSearchParams(query)}`, { signal }),
  readApproval: (id: string, signal?: AbortSignal) => http<unknown>(`/im/approvals/${encodeURIComponent(id)}`, { signal }),
  list: (conversationId: string, signal?: AbortSignal) => http<(AgentRunTarget & Pick<RunState['run'], 'requestVersion' | 'fence' | 'status'>)[]>(`/im/channels/${encodeURIComponent(conversationId)}/runs`,{ signal }),
  async subscribe(target: AgentRunTarget, receive: (snapshot: AgentRunSnapshot) => void, signal: AbortSignal): Promise<void> {
    const company = getActiveCompanyId()
    if (!company) throw new Error('请先选择工作空间')
    const workspace = getWorkspaceSession()
    const headers = new Headers({ 'x-company-id': company, Accept: 'text/event-stream' })
    if (workspace?.companyId === company) headers.set('x-project-id', workspace.projectId)
    const url = `${API}/im/companies/${encodeURIComponent(company)}${path(target).slice(3)}/stream?${new URLSearchParams(thread(target))}`
    const response = await lingxiApiFetch(url, { credentials: 'include', headers, signal })
    if (!response.ok) throw new Error(`任务进度暂不可用（${response.status}）`)
    if (!response.body || !response.headers.get('content-type')?.startsWith('text/event-stream')) throw new Error('运行流协议不正确')
    const reader = AssistantStream.fromResponse(response, new AssistantTransportDecoder()).getReader()
    const state = new AssistantTransportDeltaTracker()
    try {
      while (true) {
        signal.throwIfAborted()
        const { value, done } = await reader.read()
        if (done) break
        if (value.type === 'error') throw new Error('运行流中断，请重新连接')
        if (value.type !== 'update-state') throw new Error('运行流包含不支持的消息')
        if (!value.operations.length) continue
        state.append(value.operations)
        const snapshot = state.state as unknown as AgentRunSnapshot
        if (!snapshot || snapshot.runId !== target.runId || snapshot.view?.runId !== target.runId
          || !Array.isArray(snapshot.content) || !snapshot.status) throw new Error('运行流消息身份或内容不正确')
        receive(snapshot)
      }
    } finally { await reader.cancel(); reader.releaseLock() }
  },
  read(target: AgentRunTarget, signal?: AbortSignal): Promise<AgentRunSnapshot> {
    return http(`${path(target)}?${new URLSearchParams(thread(target))}`, {
      signal: AbortSignal.any([AbortSignal.timeout(30_000), ...(signal ? [signal] : [])]),
    })
  },
  cancel: (target: AgentRunTarget) => http<{ cancelled: boolean }>(path(target),{ method: 'DELETE', body: JSON.stringify(thread(target)) }),
  revise: (target: AgentRunTarget, text: string) => http<{ revised: boolean }>(path(target),{ method: 'PATCH', body: JSON.stringify({ text,...thread(target) }) }),
  continue: (target: AgentRunTarget, clientMsgNo: string, requestVersion: number) => http(`${path(target)}/input`,{
    method: 'POST', body: JSON.stringify({ clientMsgNo,requestVersion }) }),
  retryDelivery: (target: AgentRunTarget) => http(`${path(target)}/delivery/retry`,{ method: 'POST', body: JSON.stringify(thread(target)) }),
  reconcile: (target: AgentRunTarget, actionKey: string) => http(`${path(target)}/reconcile`,{ method: 'POST', body: JSON.stringify({ actionKey,...thread(target) }) }),
  async download(target: AgentRunTarget, artifact: ResponseEnvelope['artifacts'][number]) {
    const company = getActiveCompanyId(), workspace = getWorkspaceSession()
    const headers = new Headers()
    if (company) headers.set('x-company-id',company)
    if (workspace?.companyId === company) headers.set('x-project-id',workspace.projectId)
    const response = await lingxiApiFetch(`${API}${path(target)}/artifact?${new URLSearchParams({ path: artifact.path,...thread(target) })}`,{
      credentials: 'include', headers, signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`附件读取失败（${response.status}）`)
    const bytes = await response.arrayBuffer()
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value => value.toString(16).padStart(2,'0')).join('')
    if (bytes.byteLength !== artifact.size || hash !== artifact.sha256.toLowerCase()) throw new Error('附件内容与交付清单不一致，请刷新后重试')
    const url = URL.createObjectURL(new Blob([bytes],{ type: artifact.mime }))
    const link = document.createElement('a')
    link.href = url; link.download = artifact.path.split('/').at(-1) ?? '附件'; link.rel = 'noopener'
    document.body.append(link); link.click(); link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url),1000)
  },
}
