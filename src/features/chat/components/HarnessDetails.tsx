import { useMemo, useState } from 'react'
import { createRunView } from '@lyyzka/lingxios/ui'
import { Button } from '@/components/ui/button'
import { harnessApi } from '../runtime/harness-api'
import { userFacingError } from '@/lib/userFacingError'
import type { LingxiMessageMetadata } from '../runtime/model'
import { chatTransport } from '../runtime/transport'
import { harnessFailure, harnessLabel } from '../runtime/harness'

export function HarnessDetails({ metadata }: { metadata: LingxiMessageMetadata }) {
  const target = useMemo(() => ({ conversationId: metadata.conversationId, agentId: metadata.senderId, runId: metadata.runId!,
    ...(metadata.threadRootId ? { threadId: metadata.threadRootId } : {}) }),
  [metadata.conversationId,metadata.senderId,metadata.runId,metadata.threadRootId])
  const view = metadata.harness ?? createRunView(target.runId)
  const outcome = view.goalOutcome, envelope = view.message?.envelope
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = view.lifecycle === 'queued' || view.lifecycle === 'leased' || view.lifecycle === 'waiting'
  async function perform(action: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await action(); await chatTransport.refreshRun(target) }
    catch (cause) { setError(userFacingError(cause, '操作未完成，请稍后重试。')) }
    finally { setBusy(false) }
  }

  return <section aria-label="任务结果与操作" className="mt-2 grid w-full max-w-xl gap-2 text-xs text-muted-foreground empty:hidden">
    {!active && <p role="status">{harnessLabel(view)}</p>}
    {metadata.harnessError && <p role="alert">{harnessFailure(metadata.harnessError)}</p>}
    {outcome && 'gaps' in outcome && outcome.gaps?.length ? <details open className="rounded-lg border border-border px-3 py-2">
      <summary className="cursor-pointer">未完成原因</summary>
      <ul className="mt-2 list-disc space-y-1 pl-4">{[...new Set(outcome.gaps)].map(gap => <li key={gap}>{harnessFailure(gap)}</li>)}</ul>
    </details> : null}
    {outcome?.question && <p className="text-sm text-foreground">{outcome.question}</p>}
    {envelope?.artifacts.length ? <div className="grid gap-2" aria-label="交付附件">
      {envelope.artifacts.map(artifact => <div key={artifact.path} className="rounded-lg border border-border px-3 py-2">
        <Button type="button" variant="link" size="sm" className="h-auto max-w-full justify-start p-0 text-start" disabled={busy}
          onClick={() => void perform(() => harnessApi.download(target,artifact))}>
          <span className="break-all">下载 {artifact.path.split('/').at(-1)}</span>
        </Button>
      </div>)}
    </div> : null}
    {metadata.harnessControl && ((active && outcome?.status === 'awaiting_approval') || view.delivery === 'failed') && <>
      <div className="flex flex-wrap gap-2">
        {outcome?.status === 'awaiting_approval' && <>
          <Button type="button" size="sm" disabled={busy} onClick={() => void perform(() => chatTransport.resolveApproval(outcome.approvalId,'approved'))}>批准并继续</Button>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void perform(() => chatTransport.resolveApproval(outcome.approvalId,'denied'))}>拒绝</Button>
        </>}
        {view.delivery === 'failed' && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void perform(() => harnessApi.retryDelivery(target))}>重试投递</Button>}
      </div>
    </>}
    {error && <div role="alert" className="text-destructive">
      <p>{error}</p>
      <Button type="button" variant="link" size="sm" disabled={busy} onClick={() => void perform(() => chatTransport.refreshRun(target))}>刷新状态</Button>
    </div>}
  </section>
}
