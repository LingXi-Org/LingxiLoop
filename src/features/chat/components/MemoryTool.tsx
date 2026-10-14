import { useAuiState } from '@assistant-ui/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { MemoryChips } from '@/components/assistant-ui/elements/memory-chips'
import type { MemoryActivity } from '@/lib/memoryActivity'
import { getActiveCompanyId } from '@/stores/auth'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { userFacingError } from '@/lib/userFacingError'
import { harnessApi } from '../runtime/harness-api'

export function MemoryTool({ memory, readOnly }: { memory: MemoryActivity; readOnly: boolean }) {
  const custom = useAuiState(state => state.message.metadata.custom)
  const { runId, senderId, conversationId, threadRootId } = custom
  const target = typeof runId === 'string' && typeof senderId === 'string' && typeof conversationId === 'string'
    ? { runId, agentId: senderId, conversationId, ...(typeof threadRootId === 'string' ? { threadId: threadRootId } : {}) } : undefined
  const permitted = !readOnly && custom.harnessControl === true && !!target
  const queryClient = useQueryClient()
  const queryKey = ['run-memory', getActiveCompanyId(), getWorkspaceSession()?.projectId, runId]
  const ids = memory.chips.map(chip => chip.id)
  const current = useQuery({ queryKey: [...queryKey, ids], enabled: permitted && ids.length > 0,
    queryFn: ({ signal }) => harnessApi.memory(target!, ids, signal), retry: false })
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const chips = current.data ? current.data.chips.map(chip => {
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
  return <div aria-busy={busy} className="min-w-0 space-y-2">
    <fieldset disabled={busy || permitted && !current.isSuccess} className="min-w-0">
      <MemoryChips chips={chips} onForget={permitted ? id => void forget(id) : undefined} />
    </fieldset>
    {busy && <p role="status" className="text-xs text-muted-foreground">正在忘记…</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {current.isError && <p role="alert" className="text-xs text-destructive">记忆状态暂时无法加载。<button type="button" className="rounded underline focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void current.refetch()}>重试</button></p>}
  </div>
}
