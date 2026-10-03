import { useMemo, useState } from 'react'
import { useAuiState } from '@assistant-ui/react'
import { Button } from '@/components/ui/button'
import { ApprovalRequestCard } from './ApprovalRequestCard'
import { harnessApi } from '../runtime/harness-api'
import { userFacingError } from '@/lib/userFacingError'
import type { LingxiMessageMetadata } from '../runtime/model'
import { chatTransport } from '../runtime/transport'
import { harnessLabel } from '../runtime/harness'
import { DeliveryCard, RunProgressCard } from './RunResultCards'
import { ProgressTracker } from '@/components/tool-ui/progress-tracker'
import { knowledgeProgress } from '../runtime/task-progress'
import { ResearchSources } from './ResearchSources'

export function HarnessDetails({ metadata }: { metadata: LingxiMessageMetadata }) {
  const target = useMemo(() => ({ conversationId: metadata.conversationId, agentId: metadata.senderId, runId: metadata.runId!,
    ...(metadata.threadRootId ? { threadId: metadata.threadRootId } : {}) }),
  [metadata.conversationId,metadata.senderId,metadata.runId,metadata.threadRootId])
  const view = metadata.harness!
  const tools = useAuiState(state => state.message.content.filter(part => part.type === 'tool-call'))
  const outcome = view.goalOutcome
  const retrieval = knowledgeProgress(target.runId, tools, view.lifecycle, metadata.senderName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = view.lifecycle === 'queued' || view.lifecycle === 'leased' || view.lifecycle === 'waiting'
  const needsAttention = view.delivery === 'failed' || view.lifecycle === 'failed' || view.lifecycle === 'cancelled'
    || outcome?.status === 'partial' || outcome?.status === 'blocked' || Boolean(metadata.harnessError)
  async function perform(action: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await action(); await chatTransport.refreshRun(target) }
    catch (cause) { setError(userFacingError(cause, '操作未完成，请稍后重试。')) }
    finally { setBusy(false) }
  }

  return <section aria-label="任务结果与操作" className="mt-2 grid w-full max-w-xl gap-2 text-xs text-muted-foreground empty:hidden">
    <ResearchSources calls={tools} lifecycle={view.lifecycle} />
    {retrieval && <ProgressTracker {...retrieval} />}
    {needsAttention ? <RunProgressCard view={view} error={metadata.harnessError}>
      {metadata.harnessControl && view.delivery === 'failed' && <div className="mt-3 flex justify-end"><Button type="button" size="sm" disabled={busy} onClick={() => void perform(() => harnessApi.retryDelivery(target))}>重试投递</Button></div>}
    </RunProgressCard> : !active && outcome?.status !== 'satisfied' && <p role="status">{harnessLabel(view)}</p>}
    {outcome?.question && <p className="text-sm text-foreground">{outcome.question}</p>}
    {view.artifacts.length ? <DeliveryCard artifacts={view.artifacts} busy={busy} onDownload={artifact => void perform(() => harnessApi.download(target,artifact))} /> : null}
    {metadata.harnessControl && active && outcome?.status === 'awaiting_approval' && !tools.some(tool => tool.approval?.id === outcome.approvalId) && <ApprovalRequestCard
          key={outcome.approvalId} approvalId={outcome.approvalId} sender={metadata.senderName} busy={busy}
          onApprove={() => perform(() => chatTransport.resolveApproval(outcome.approvalId,'approved'))}
          onDeny={() => perform(() => chatTransport.resolveApproval(outcome.approvalId,'denied'))}
        />}
    {error && <div role="alert" className="text-destructive">
      <p>{error}</p>
      <Button type="button" variant="link" size="sm" disabled={busy} onClick={() => void perform(() => chatTransport.refreshRun(target))}>刷新状态</Button>
    </div>}
  </section>
}
