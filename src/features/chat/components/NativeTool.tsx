import { useAui, useAuiState, type ToolCallMessagePartProps, type ToolCallMessagePartStatus } from '@assistant-ui/react'
import { type ReactNode, useRef, useState } from 'react'
import { ToolFallback } from '@/components/assistant-ui/elements/tool-fallback'
import { ElicitationForm } from '@/components/assistant-ui/elements/elicitation-form'
import { MessageFooterContents } from '@/components/assistant-ui/message-footer'
import { ProgressTracker } from '@/components/tool-ui/progress-tracker'
import { Button } from '@/components/ui/button'
import type { RunDisplayState } from '@/lib/agentRunSnapshot'
import { userFacingError } from '@/lib/userFacingError'
import { chatTransport } from '../runtime/transport'
import { knowledgeProgress } from '../runtime/task-progress'
import { ApprovalRequestCard } from './ApprovalRequestCard'
import { MessagePartBoundary } from './MessagePartBoundary'
import { ResearchSources } from './ResearchSources'
import { TOOL_DETAILS } from './ToolRenderers'

export const hasRichTool = (name: string) => Object.hasOwn(TOOL_DETAILS, name) || name === 'research.search'
  || ['knowledge.search', 'knowledge.read_source', 'knowledge.list_sources'].includes(name)

export function NativeTool(props: ToolCallMessagePartProps & { readOnly: boolean; children?: ReactNode }) {
  const { toolCallId, toolName, argsText, result, isError, approval, interrupt, artifact, status, readOnly, children } = props
  const aui = useAui()
  const message = useAuiState(state => state.message)
  const custom = message.metadata.custom
  const [answer, setAnswer] = useState(''), [busy, setBusy] = useState(false), [accepted, setAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const resultStatus = result && typeof result === 'object' && 'status' in result ? result.status : undefined
  const ended = message.status?.type === 'complete' || message.status?.type === 'incomplete'
  const pending = approval && approval.approved === undefined && !approval.resolution && !ended
  const permitted = !readOnly && custom.harnessControl === true && typeof custom.runId === 'string'
  const cancelled = approval?.resolution === 'cancelled' || resultStatus === 'cancelled' || status.type === 'incomplete' && status.reason === 'cancelled'
  const failed = isError || resultStatus === 'failed' || status.type === 'incomplete' && status.reason === 'error'
  const label = approval?.resolution === 'expired' ? '审批已过期'
    : cancelled ? '已取消' : approval?.approved === false ? '已拒绝' : failed ? '执行失败'
    : pending ? '等待审批' : interrupt && !ended ? '等待补充信息'
    : result !== undefined ? '已完成' : status.type === 'running' ? '执行中'
    : approval?.approved ? '已批准 · 等待执行' : '未完成'
  const displayStatus: ToolCallMessagePartStatus = failed ? { type: 'incomplete', reason: 'error' }
    : cancelled || approval?.resolution || approval?.approved === false ? { type: 'incomplete', reason: cancelled ? 'cancelled' : 'other' }
    : pending || interrupt && !ended ? { type: 'requires-action', reason: interrupt ? 'interrupt' : 'tool-calls' }
    : result !== undefined ? { type: 'complete' } : status.type === 'running' ? status : { type: 'incomplete', reason: 'other' }
  const lifecycle = cancelled ? 'cancelled' : failed ? 'failed' : displayStatus.type === 'running' ? 'leased' : 'succeeded'
  const Detail = TOOL_DETAILS[toolName as keyof typeof TOOL_DETAILS]
  const retrieval = knowledgeProgress(toolCallId, [props], lifecycle, String(custom.senderName ?? '助手'))

  async function act(work: (current: ReturnType<typeof aui.message.getState>) => Promise<void>) {
    if (inFlight.current || accepted) return
    inFlight.current = true; setBusy(true); setError(null)
    try {
      const current = aui.message.getState()
      if (readOnly || current.metadata.custom.harnessControl !== true || current.status?.type !== 'requires-action') throw new Error('403')
      await work(current)
      setAccepted(true)
    } catch (cause) { setError(userFacingError(cause, '操作失败，请重试。')) }
    finally { inFlight.current = false; setBusy(false) }
  }
  const approve = (approved: boolean) => act(async current => {
    const part = current.content.find(part => part.type === 'tool-call' && part.toolCallId === toolCallId)
    if (part?.type !== 'tool-call' || !part.approval || part.approval.id !== approval?.id || part.approval.approved !== undefined
      || part.approval.resolution || part.approval.options?.length) throw new Error('409')
    await chatTransport.resolveApproval(part.approval.id, approved ? 'approved' : 'denied')
  })
  const resume = () => act(async current => {
    const meta = current.metadata.custom, view = meta.harness as RunDisplayState | undefined
    const part = current.content.find(part => part.type === 'tool-call' && part.toolCallId === toolCallId)
    if (part?.type !== 'tool-call' || !part.interrupt || !answer.trim() || !view || view.runId !== meta.runId
      || view.requestVersion !== (custom.harness as RunDisplayState | undefined)?.requestVersion
      || typeof meta.conversationId !== 'string' || typeof meta.senderId !== 'string') throw new Error('409')
    await chatTransport.continueRun({ conversationId: meta.conversationId, agentId: meta.senderId, runId: view.runId,
      ...(typeof meta.threadRootId === 'string' ? { threadId: meta.threadRootId } : {}) }, answer.trim(), view.requestVersion)
  })

  return <section aria-label={`工具：${toolName}`} data-tool-state={displayStatus.type} className="grid min-w-0 gap-2 text-sm">
    <MessageFooterContents inset={false}>
      <ToolFallback.Root>
        <ToolFallback.Trigger toolName={toolName} label={label} status={displayStatus} />
        <ToolFallback.Content>
          <ToolFallback.Args argsText={argsText} />
          <ToolFallback.Result result={result} label={failed ? '错误详情' : '结果'} />
          <ToolFallback.Result result={artifact} label="产物详情" />
        </ToolFallback.Content>
      </ToolFallback.Root>
      {hasRichTool(toolName) && (result !== undefined || displayStatus.type === 'running') && <MessagePartBoundary resetKey={result} running={displayStatus.type === 'running'}>
        {Detail && <Detail {...props} />}
        {toolName === 'research.search' && <ResearchSources calls={[props]} lifecycle={lifecycle} />}
        {retrieval && <ProgressTracker {...retrieval} />}
      </MessagePartBoundary>}
      {failed && <p role="alert" className="text-xs text-destructive">工具执行失败，已有结果已保留。可展开查看详情。</p>}
      {approval && <div className="space-y-2">
        {approval.approved === true && <p role="status" className="text-xs text-muted-foreground">已批准{approval.isAutomatic ? '（自动审批）' : ''}</p>}
        {approval.reason && <p className="text-xs text-muted-foreground">{approval.reason}</p>}
        {approval.options?.length ? <div className="rounded-xl border border-border/60 p-3">
          <p className="mb-2 text-xs text-muted-foreground">{pending ? '此审批选项暂不支持在消息中提交。' : '审批选项'}</p>
          {approval.options.map(option => <div key={option.id} className="mb-2 last:mb-0">
            <Button type="button" size="sm" variant="outline" disabled>{option.label ?? option.kind}{approval.optionId === option.id ? ' · 已选择' : ''}</Button>
            {option.description && <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>}
            {option.grants?.length ? <p className="mt-1 break-words text-xs text-muted-foreground">权限范围：{option.grants.join('、')}</p> : null}
          </div>)}
        </div> : pending && permitted && <ApprovalRequestCard approvalId={approval.id} sender={String(custom.senderName ?? toolName)} busy={busy || accepted}
          onApprove={() => approve(true)} onDeny={() => approve(false)} />}
        {pending && !permitted && <p className="text-xs text-muted-foreground">等待有权限的成员审批。</p>}
      </div>}
      {interrupt && !ended && <fieldset disabled={!permitted || busy || accepted} className="min-w-0">
        <ElicitationForm server="补充信息" message={typeof interrupt.payload === 'object' && interrupt.payload && 'prompt' in interrupt.payload
          && typeof interrupt.payload.prompt === 'string' ? interrupt.payload.prompt : '请补充信息以继续任务。'}
          fields={[{ name: 'answer', label: '补充信息', kind: 'text', value: answer, required: true }]}
          state={accepted ? 'accepted' : 'request'} acceptDisabled={!permitted || busy || !answer.trim()} acceptLabel={busy ? '正在提交…' : '提交'}
          onFieldChange={(_, value) => setAnswer(String(value))} onAccept={() => void resume()} />
      </fieldset>}
      {accepted && (pending || interrupt) && <p role="status" className="text-xs text-muted-foreground">已提交，正在同步任务状态…</p>}
      {children}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </MessageFooterContents>
  </section>
}
