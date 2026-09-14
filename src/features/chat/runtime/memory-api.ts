import type { MemoryAPI, MemoryApplyInput, MemoryListQuery, MemoryRestoreInput, MemoryScope, MemorySearchQuery } from '@lyyzka/lingxios'
import { http } from '@/api/core/http'
import type { AgentRunTarget } from './harness-api'

type Result<K extends keyof MemoryAPI> = Awaited<ReturnType<MemoryAPI[K]>>
const path = (target: AgentRunTarget) => `/im/channels/${encodeURIComponent(target.conversationId)}/agents/${encodeURIComponent(target.agentId)}/runs/${encodeURIComponent(target.runId)}/memory`
const query = (target: AgentRunTarget, values: Record<string, unknown> = {}) => new URLSearchParams(Object.entries({ threadId: target.threadId,...values })
  .filter(([,value])=>value !== undefined).map(([key,value])=>[key,String(value)])).toString()
const scoped = (scope: MemoryScope) => ({ scopeType: scope.scopeType,scopeId: scope.scopeId })

export const memoryApi = {
  scopes: (target: AgentRunTarget,signal?: AbortSignal)=>http<Result<'scopes'>>(`${path(target)}/scopes?${query(target)}`,{ signal }),
  list: (target: AgentRunTarget,scope: MemoryScope,options: MemoryListQuery = {})=>http<Result<'list'>>(`${path(target)}/documents?${query(target,{ ...scoped(scope),...options })}`),
  read: (target: AgentRunTarget,scope: MemoryScope,id: string,version?: number)=>http<NonNullable<Result<'read'>>>(`${path(target)}/documents/${encodeURIComponent(id)}?${query(target,{ ...scoped(scope),version })}`),
  history: (target: AgentRunTarget,scope: MemoryScope,id: string,cursor?: string)=>http<Result<'history'>>(`${path(target)}/documents/${encodeURIComponent(id)}/history?${query(target,{ ...scoped(scope),cursor,limit: 20 })}`),
  search: (target: AgentRunTarget,scope: MemoryScope,options: MemorySearchQuery)=>http<Result<'search'>>(`${path(target)}/search?${query(target,{ ...scoped(scope),...options })}`),
  doctor: (target: AgentRunTarget,scope: MemoryScope,cursor?: string)=>http<Result<'doctor'>>(`${path(target)}/doctor?${query(target,{ ...scoped(scope),cursor })}`),
  apply: (target: AgentRunTarget,input: MemoryApplyInput)=>http<Result<'apply'>>(`${path(target)}/apply?${query(target)}`,{ method: 'POST',body: JSON.stringify(input) }),
  restore: (target: AgentRunTarget,input: MemoryRestoreInput)=>http<Result<'restore'>>(`${path(target)}/restore?${query(target)}`,{ method: 'POST',body: JSON.stringify(input) }),
  reflect: (target: AgentRunTarget,scope: MemoryScope)=>http<Result<'reflect'>>(`${path(target)}/reflect?${query(target)}`,{ method: 'POST',body: JSON.stringify(scope) }),
  forget: (target: AgentRunTarget,scope: MemoryScope)=>http<Result<'forget'>>(`${path(target)}/forget?${query(target)}`,{ method: 'POST',body: JSON.stringify(scope) }),
  evolution: (target: AgentRunTarget,scope: MemoryScope)=>http<Record<string,unknown>[]>(`${path(target)}/evolution?${query(target,scoped(scope))}`),
  rollbackEvolution: (target: AgentRunTarget,scope: MemoryScope,activeId: string,expectedVersion: number,targetId: string | null)=>http<{ activeId: string | null }>(`${path(target)}/evolution/rollback?${query(target)}`,{ method: 'POST',body: JSON.stringify({ scope,activeId,expectedVersion,targetId }) }),
}
