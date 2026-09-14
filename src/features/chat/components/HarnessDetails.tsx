import { useEffect, useMemo, useState } from 'react'
import { createRunView } from '@lyyzka/lingxios/ui'
import { Button } from '@/components/ui/button'
import { harnessApi } from '../runtime/harness-api'
import { harnessLabel } from '../runtime/harness'
import type { LingxiMessageMetadata } from '../runtime/model'
import { chatTransport } from '../runtime/transport'
import { MemoryManager } from './MemoryManager'

export function HarnessDetails({ metadata }: { metadata: LingxiMessageMetadata }) {
  const target = useMemo(() => ({ conversationId: metadata.conversationId, agentId: metadata.senderId, runId: metadata.runId!,
    ...(metadata.threadRootId ? { threadId: metadata.threadRootId } : {}) }),
  [metadata.conversationId,metadata.senderId,metadata.runId,metadata.threadRootId])
  const view = metadata.harness ?? createRunView(target.runId)
  const outcome = view.goalOutcome, envelope = view.message?.envelope
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const active = view.lifecycle === 'queued' || view.lifecycle === 'leased' || view.lifecycle === 'waiting'
  const waitingForInput = outcome?.status === 'awaiting_input'
  const editable = waitingForInput || active && outcome?.status !== 'awaiting_approval'
    || outcome?.status === 'partial' || outcome?.status === 'blocked'

  useEffect(() => {
    if (metadata.harnessControl === false) return
    void chatTransport.refreshRun(target)
    if (!active && view.delivery !== 'pending' && view.lifecycle !== null) return
    const timer = window.setInterval(() => { void chatTransport.refreshRun(target) },3000)
    return () => window.clearInterval(timer)
  },[target,active,view.delivery,view.lifecycle,metadata.harnessControl])

  async function perform(action: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await action(); await chatTransport.refreshRun(target) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败，请重试') }
    finally { setBusy(false) }
  }

  return <section aria-label="任务结果与操作" className="mt-2 grid w-full max-w-xl gap-2 text-xs text-muted-foreground">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1" role="status">
      <span className="font-medium text-foreground">{harnessLabel(view)}</span>
      {outcome && <span>{outcome.verification === 'passed' ? '验收通过' : outcome.verification === 'not_run' ? '尚未验收' : '验收证据不足'}</span>}
      {view.delivery === 'failed' && <span className="text-destructive">消息投递失败</span>}
      {view.delivery === 'pending' && <span>结果已保存，正在投递消息</span>}
    </div>
    {outcome?.question && <p className="text-sm text-foreground">{outcome.question}</p>}
    {outcome?.gaps?.length ? <ul className="list-disc space-y-1 ps-4">{outcome.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul> : null}
    {envelope && envelope.requestVersion < view.requestVersion && <p>下方保留上次交付的内容；当前修订仍待验收。</p>}
    {envelope?.artifacts.length ? <div className="grid gap-2" aria-label="交付附件">
      {envelope.artifacts.map(artifact => <div key={artifact.path} className="rounded-lg border border-border px-3 py-2">
        <Button type="button" variant="link" size="sm" className="h-auto max-w-full justify-start p-0 text-start" disabled={busy}
          onClick={() => void perform(() => harnessApi.download(target,artifact))}>
          <span className="break-all">下载 {artifact.path.split('/').at(-1)}</span>
        </Button>
        <details className="mt-1 break-all"><summary className="cursor-pointer">文件信息 · {artifact.size.toLocaleString()} 字节</summary>
          <p className="mt-1">SHA-256：{artifact.sha256}</p>
          {artifact.source && <p>来源：{artifact.source.ref} · 版本 {artifact.source.version}</p>}
        </details>
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
    {envelope?.presentations?.length ? <details className="rounded-lg border border-border px-3 py-2">
      <summary className="cursor-pointer">卡片来源版本</summary>
      {envelope.presentations.flatMap(item => item.sources.map(source => <p key={`${item.hash}:${source.ref}`} className="mt-1 break-all">
        {source.ref} · {source.version} · {source.observedAt}
      </p>))}
    </details> : null}
    {metadata.harnessControl && <>
      <div className="flex flex-wrap gap-2">
        <MemoryManager key={target.runId} target={target} />
        {outcome?.status === 'awaiting_approval' && <>
          <Button type="button" size="sm" disabled={busy} onClick={() => void perform(() => chatTransport.resolveApproval(outcome.approvalId,'approved'))}>批准并继续</Button>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void perform(() => chatTransport.resolveApproval(outcome.approvalId,'denied'))}>拒绝</Button>
        </>}
        {active && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void perform(() => harnessApi.cancel(target))}>取消任务</Button>}
        {view.delivery === 'failed' && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void perform(() => harnessApi.retryDelivery(target))}>重试投递</Button>}
        {metadata.unresolvedActions?.map(action => <Button key={action.actionKey} type="button" variant="outline" size="sm" disabled={busy}
          onClick={() => void perform(() => harnessApi.reconcile(target,action.actionKey))}>复核 {action.action}</Button>)}
      </div>
      {editable && <details open={waitingForInput}>
        <summary className="cursor-pointer">{waitingForInput ? '补充信息并继续' : '补充或修订任务'}</summary>
        <form className="mt-2 grid gap-2" onSubmit={event => {
          event.preventDefault()
          if (!text.trim() || busy) return
          void perform(async () => {
            if (waitingForInput) await chatTransport.continueRun(target,text,view.requestVersion)
            else if (!(await harnessApi.revise(target,text)).revised) throw new Error('任务状态已变化，请刷新后重试')
            setText('')
          })
        }}>
          <label className="grid gap-1">{waitingForInput ? '补充信息' : '任务修订'}
            <textarea className="min-h-20 w-full rounded-md border border-input bg-background p-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required maxLength={8000} value={text} disabled={busy} onChange={event => setText(event.target.value)} />
          </label>
          <Button type="submit" size="sm" className="w-fit" disabled={busy || !text.trim()}>{waitingForInput ? '发送并继续' : '提交修订'}</Button>
        </form>
      </details>}
    </>}
    {(error || metadata.harnessError) && <div role="alert" className="text-destructive">
      <p>{error ?? metadata.harnessError}</p>
      <Button type="button" variant="link" size="sm" disabled={busy} onClick={() => void perform(() => chatTransport.refreshRun(target))}>刷新状态</Button>
    </div>}
  </section>
}
