import { useMemo, useState } from 'react'
import { createRunView } from '@lyyzka/lingxios/ui'
import { Button } from '@/components/ui/button'
import { harnessApi } from '../runtime/harness-api'
import { userFacingError } from '@/lib/userFacingError'
import type { LingxiMessageMetadata } from '../runtime/model'
import { chatTransport } from '../runtime/transport'

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
    {view.lifecycle === 'failed' && <p role="status">回复未能完成，请稍后重试。</p>}
    {outcome?.question && <p className="text-sm text-foreground">{outcome.question}</p>}
    {envelope?.artifacts.length ? <div className="grid gap-2" aria-label="交付附件">
      {envelope.artifacts.map(artifact => <div key={artifact.path} className="rounded-lg border border-border px-3 py-2">
        <Button type="button" variant="link" size="sm" className="h-auto max-w-full justify-start p-0 text-start" disabled={busy}
          onClick={() => void perform(() => harnessApi.download(target,artifact))}>
          <span className="break-all">下载 {artifact.path.split('/').at(-1)}</span>
        </Button>
      </div>)}
    </div> : null}
    {envelope?.citations.length ? <details className="rounded-lg border border-border px-3 py-2">
      <summary className="cursor-pointer">引用来源（{envelope.citations.length}）</summary>
      <p className="mt-2">已记录来源版本；引用是否充分支持回答尚未评定。</p>
      <ul className="mt-2 space-y-2">{envelope.citations.map(citation => <li key={citation.start}>
        <p className="text-foreground">{citation.text}</p>
        {citation.sources.map(source => <p key={`${source.sourceId}:${source.sourceVersion}`} className="break-all">
          {source.sourceId} · 版本 {source.sourceVersion}{source.truncated ? ' · 来源节选' : ''}
        </p>)}
      </li>)}</ul>
    </details> : null}
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
