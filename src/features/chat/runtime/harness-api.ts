import type { createLingxiOS } from '@lyyzka/lingxios'
import type { RunEvent, RunState, ResponseEnvelope, RunStreamEvent } from '@lyyzka/lingxios/ui'
import { API, http } from '@/api/core/http'
import { lingxiApiFetch } from '@/api/transport'
import { getActiveCompanyId } from '@/stores/auth'
import { getWorkspaceSession } from '@/lib/workspaceSession'

export interface AgentRunTarget { conversationId: string; agentId: string; runId: string; threadId?: string }
type Diagnostics = Awaited<ReturnType<Awaited<ReturnType<typeof createLingxiOS>>['readDiagnostics']>>
export type AgentRunResponse = RunState & { events: RunEvent[]; nextSeq: number; diagnostics: Diagnostics; canControl: boolean }
const path = (target: AgentRunTarget) => `/im/channels/${encodeURIComponent(target.conversationId)}/agents/${encodeURIComponent(target.agentId)}/runs/${encodeURIComponent(target.runId)}`
const thread = (target: AgentRunTarget): Record<string, string> => target.threadId ? { threadId: target.threadId } : {}

export const harnessApi = {
  list: (conversationId: string, signal?: AbortSignal) => http<(AgentRunTarget & Pick<RunState['run'], 'requestVersion' | 'fence' | 'status'>)[]>(`/im/channels/${encodeURIComponent(conversationId)}/runs`,{ signal }),
  subscribe(target: AgentRunTarget, receive: (event: RunStreamEvent) => void, failed: () => void): EventSource {
    const company = getActiveCompanyId()
    if (!company) throw new Error('请先选择工作空间')
    const url = `${API}/im/companies/${encodeURIComponent(company)}${path(target).slice(3)}/stream?${new URLSearchParams(thread(target))}`
    const source = new EventSource(url,{ withCredentials: true })
    for (const type of ['state','event','preview','reset']) source.addEventListener(type,(event) => {
      try {
        const item = JSON.parse((event as MessageEvent<string>).data) as RunStreamEvent
        receive(item)
        if (item.type === 'state' && !['queued','leased','waiting'].includes(item.state.run.status) && item.state.delivery !== 'pending') source.close()
      } catch { source.close(); failed() }
    })
    source.onerror = failed
    return source
  },
  read: (target: AgentRunTarget, afterSeq: number, signal?: AbortSignal) => http<AgentRunResponse>(
    `${path(target)}?${new URLSearchParams({ afterSeq: String(afterSeq), ...thread(target) })}`,{ signal }),
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
