import { useAuiState } from '@assistant-ui/react'
import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useRef, useState, useSyncExternalStore } from 'react'
import { MemoryChips } from '@/components/assistant-ui/elements/memory-chips'
import type { MemoryActivity } from '@/lib/memoryActivity'
import { useAuth } from '@/stores/auth'
import { getActiveProjectId } from '@/lib/workspaceSession'
import { userFacingError } from '@/lib/userFacingError'
import { harnessApi } from '../runtime/harness-api'
import { memoryQueryClient } from '../runtime/memory-query'
import { ErrorState } from '@/components/assistant-ui/elements/error-state'

function subscribeWorkspace(change: () => void) {
  window.addEventListener('lingxiloop-workspace-changed', change)
  return () => window.removeEventListener('lingxiloop-workspace-changed', change)
}

export function MemoryTool(props: { memory: MemoryActivity; readOnly: boolean }) {
  return <QueryClientProvider client={memoryQueryClient}><MemoryToolContents {...props} /></QueryClientProvider>
}

function MemoryToolContents({ memory, readOnly }: { memory: MemoryActivity; readOnly: boolean }) {
  const custom = useAuiState(state => state.message.metadata.custom)
  const { runId, senderId, conversationId, threadRootId } = custom
  const target = typeof runId === 'string' && typeof senderId === 'string' && typeof conversationId === 'string'
    ? { runId, agentId: senderId, conversationId, ...(typeof threadRootId === 'string' ? { threadId: threadRootId } : {}) } : undefined
  const permitted = !readOnly && custom.harnessControl === true && !!target
  const principalId = useAuth(state => state.user?.id)
  const companyId = useAuth(state => state.activeCompanyId)
  const projectId = useSyncExternalStore(subscribeWorkspace, getActiveProjectId, () => null)
  const queryClient = memoryQueryClient
  const queryKey = ['run-memory', companyId, principalId, projectId, runId, senderId, conversationId, threadRootId]
  const versions = memory.chips.map(chip => [chip.id, chip.version])
  const ids = memory.chips.map(chip => chip.id)
  const current = useQuery({ queryKey: [...queryKey, versions], enabled: permitted && ids.length > 0,
    queryFn: ({ signal }) => harnessApi.memory(target!, ids, signal), retry: false }, queryClient)
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const chips = permitted && current.data ? current.data.chips.map(chip => {
    const original = memory.chips.find(item => item.id === chip.id)
    return { ...chip, change: original?.version === chip.version ? original.change : chip.change }
  }) : memory.chips
  async function forget(id: string) {
    const chip = chips.find(chip => chip.id === id)
    if (!permitted || !target || !chip || inFlight.current || !current.isSuccess) return
    inFlight.current = true; setBusy(true); setError(null)
    try {
      await harnessApi.forgetMemory(target, id, chip.version)
      queryClient.setQueriesData<MemoryActivity>({ queryKey }, value => value && { chips: value.chips.filter(chip => chip.id !== id) })
      await queryClient.invalidateQueries({ queryKey })
    } catch (cause) { setError(userFacingError(cause, '忘记失败，请重试。')); void current.refetch() }
    finally { inFlight.current = false; setBusy(false) }
  }
  const loading = permitted && ids.length > 0 && current.isPending
  const unavailable = permitted && current.isError
  return <div aria-busy={busy || loading} className="min-w-0 space-y-2">
    <fieldset disabled={busy || permitted && !current.isSuccess} className="min-w-0">
      {!loading && !unavailable && <MemoryChips chips={chips} onForget={permitted ? id => void forget(id) : undefined} />}
      {!loading && !unavailable && chips.length === 0 && <p role="status" className="text-xs text-muted-foreground">当前没有可显示的记忆。</p>}
    </fieldset>
    {loading && <p role="status" className="text-xs text-muted-foreground">正在核对记忆状态…</p>}
    {busy && <p role="status" className="text-xs text-muted-foreground">正在忘记…</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {unavailable && <ErrorState title="记忆状态暂时无法加载。" detail="请重试以核对当前可用的记忆。" retrying={current.isFetching} onRetry={() => void current.refetch()} />}
  </div>
}
