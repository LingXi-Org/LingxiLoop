import { useMemo, useRef, useState } from 'react'
import { ErrorPrimitive, useAui, useAuiState } from '@assistant-ui/react'
import { Button } from '@/components/ui/button'
import { ApprovalRequestCard } from './ApprovalRequestCard'
import { harnessApi } from '../runtime/harness-api'
import { userFacingError } from '@/lib/userFacingError'
import type { LingxiMessageMetadata } from '../runtime/model'
import { chatTransport } from '../runtime/transport'
import { DeliveryCard } from './RunResultCards'

export function HarnessDetails({ metadata }: { metadata: LingxiMessageMetadata }) {
  const aui = useAui()
  const target = useMemo(() => ({ conversationId: metadata.conversationId, agentId: metadata.senderId, runId: metadata.runId!,
    ...(metadata.threadRootId ? { threadId: metadata.threadRootId } : {}) }),
  [metadata.conversationId,metadata.senderId,metadata.runId,metadata.threadRootId])
  const view = metadata.harness!
  const content = useAuiState(state => state.message.content)
  const tools = useMemo(() => content.filter(part => part.type === 'tool-call'), [content])
  const outcome = view.goalOutcome
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolvedApproval, setResolvedApproval] = useState<string | null>(null)
  const inFlight = useRef(false)
  const active = view.lifecycle === 'queued' || view.lifecycle === 'leased' || view.lifecycle === 'waiting'
  const hasAnswer = content.some(part => part.type === 'text' ? Boolean(part.text.trim()) : ['image', 'file', 'generative-ui'].includes(part.type))
  async function perform(action: () => Promise<unknown>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true); setError(null)
    try { await action(); await chatTransport.refreshRun(target) }
    catch (cause) { setError(userFacingError(cause, '操作未完成，请稍后重试。')) }
    finally { inFlight.current = false; setBusy(false) }
  }
  const approve = (id: string, approved: boolean) => perform(async () => {
    const current = aui.message.getState().metadata.custom as LingxiMessageMetadata
    const gate = current.harness?.goalOutcome
    if (!current.harnessControl || resolvedApproval === id || gate?.status !== 'awaiting_approval' || gate.approvalId !== id
      || !['queued', 'leased', 'waiting'].includes(current.harness?.lifecycle ?? '')) throw new Error('409')
    await chatTransport.resolveApproval(id, approved ? 'approved' : 'denied')
    setResolvedApproval(id)
  })

  return <section aria-label="答复附件与操作" className="mt-2 grid w-full max-w-xl gap-2 text-xs text-muted-foreground empty:hidden">
    {view.lifecycle === 'cancelled' && <p role="status">已取消</p>}
    {view.lifecycle === 'succeeded' && !hasAnswer && (outcome?.status === 'partial' || outcome?.status === 'blocked') && <ErrorPrimitive.Root className="text-destructive">本次请求未能生成答复，请补充信息后重试。</ErrorPrimitive.Root>}
    {view.delivery === 'failed' && <ErrorPrimitive.Root className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      <p>答复投递失败，请重试。</p>
      {metadata.harnessControl && <Button type="button" size="sm" className="mt-2" disabled={busy} onClick={() => void perform(() => harnessApi.retryDelivery(target))}>重试投递</Button>}
    </ErrorPrimitive.Root>}
    {outcome?.question && <p className="text-sm text-foreground">{outcome.question}</p>}
    {view.artifacts.length ? <DeliveryCard artifacts={view.artifacts} busy={busy} onDownload={artifact => void perform(() => harnessApi.download(target,artifact))} /> : null}
    {metadata.harnessControl && active && outcome?.status === 'awaiting_approval' && !tools.some(tool => tool.approval?.id === outcome.approvalId) && <ApprovalRequestCard
          key={outcome.approvalId} approvalId={outcome.approvalId} sender={metadata.senderName} busy={busy || resolvedApproval === outcome.approvalId}
          onApprove={() => approve(outcome.approvalId, true)}
          onDeny={() => approve(outcome.approvalId, false)}
        />}
    {outcome?.status === 'awaiting_approval' && resolvedApproval === outcome.approvalId && <p role="status">已提交，正在同步任务状态…</p>}
    {error && <ErrorPrimitive.Root className="text-destructive">
      <p>{error}</p>
      <Button type="button" variant="link" size="sm" disabled={busy} onClick={() => void perform(() => chatTransport.refreshRun(target))}>刷新状态</Button>
    </ErrorPrimitive.Root>}
  </section>
}
