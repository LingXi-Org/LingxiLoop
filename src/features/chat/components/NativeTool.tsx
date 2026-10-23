import { useAui, useAuiState, type ToolCallMessagePartProps, type ToolCallMessagePartStatus } from '@assistant-ui/react'
import { type ReactNode, useRef, useState } from 'react'
import { ToolCall } from '@/components/assistant-ui/elements/tool-call'
import { toolDisplaySchema, canonicalToolName, resolveToolDisplay } from '@/lib/runActivity'
import { ElicitationForm } from '@/components/assistant-ui/elements/elicitation-form'
import { MessageFooterContents } from '@/components/assistant-ui/message-footer'
import type { RunDisplayState } from '@/lib/agentRunSnapshot'
import { userFacingError } from '@/lib/userFacingError'
import { chatTransport } from '../runtime/transport'
import { knowledgeSourceState } from '../runtime/task-progress'
import { ApprovalRequestCard } from './ApprovalRequestCard'
import { MessagePartBoundary } from './MessagePartBoundary'
import { TOOL_DETAILS } from './ToolRenderers'
import { ResearchSources } from './ResearchSources'
import { MemoryTool } from './MemoryTool'
import { memoryActivitySchema } from '@/lib/memoryActivity'
import { hasQuestionnaireWait } from '../runtime/questionnaire-wait'
import { inputOwner, ownsApproval } from './message-presentation'

const richTool = (name: string) => Object.hasOwn(TOOL_DETAILS,name) || /^(email|calendar)\./.test(name) || name === 'research.search'
  || /^memory(?:\.|__)/.test(name)

export const hasRichTool = (name: string) => richTool(canonicalToolName(name))

export function NativeTool(props: ToolCallMessagePartProps & { readOnly: boolean; children?: ReactNode }) {
  const { toolCallId, toolName: receivedToolName, result, isError, approval, interrupt, status, readOnly, children } = props
  const toolName = canonicalToolName(receivedToolName)
  const canonicalProps = { ...props, toolName }
  const Detail = TOOL_DETAILS[toolName as keyof typeof TOOL_DETAILS]
  const aui = useAui()
  const message = useAuiState(state => state.message)
  const custom = message.metadata.custom
  const questionnaireWait = hasQuestionnaireWait(custom)
  const [answer, setAnswer] = useState(''), [busy, setBusy] = useState(false), [accepted, setAccepted] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const publicInput = toolDisplaySchema.shape.input.safeParse(props.args.fields)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const resultStatus = result && typeof result === 'object' && 'status' in result ? result.status : undefined
  const display = resolveToolDisplay(toolName, resultStatus, result && typeof result === 'object' ? Reflect.get(result, 'display') : undefined)
  const memory = memoryActivitySchema.safeParse(result && typeof result === 'object' ? Reflect.get(result, 'memory') : undefined)
  const ended = message.status?.type === 'complete' || message.status?.type === 'incomplete'
  const pending = approval && approval.approved === undefined && !approval.resolution && !ended
  const owner = inputOwner(message)
  const ownsInput = !readOnly && owner.type === 'tool' && owner.toolCallId === toolCallId
  const ownsGate = !readOnly && !!approval && ownsApproval(message, toolCallId, approval.id)
  const permitted = !readOnly && custom.harnessControl === true && typeof custom.runId === 'string'
  const cancelled = approval?.resolution === 'cancelled' || resultStatus === 'cancelled' || status.type === 'incomplete' && status.reason === 'cancelled'
  const unknown = resultStatus === 'unknown'
  const sourceState = knowledgeSourceState(toolName, result)
  const failed = !cancelled && !unknown && (isError || resultStatus === 'failed' || sourceState?.status === 'unavailable' || status.type === 'incomplete' && status.reason === 'error')
  const label = approval?.resolution === 'expired' ? '审批已过期'
    : cancelled ? '已取消' : approval?.approved === false ? '已拒绝' : failed ? sourceState?.status === 'unavailable' ? sourceState.label : '执行失败'
    : pending ? '等待审批' : interrupt && !ended ? questionnaireWait ? '等待问卷回答' : '等待补充信息'
    : unknown ? '结果待核对' : resultStatus === 'completed' ? sourceState?.label ?? '已完成' : status.type === 'running' ? '执行中'
    : approval?.approved ? '已批准 · 等待执行' : '未完成'
  const displayStatus: ToolCallMessagePartStatus = failed ? { type: 'incomplete', reason: 'error' }
    : cancelled || approval?.resolution || approval?.approved === false ? { type: 'incomplete', reason: cancelled ? 'cancelled' : 'other' }
    : pending || interrupt && !ended ? { type: 'requires-action', reason: interrupt ? 'interrupt' : 'tool-calls' }
    : unknown ? { type: 'incomplete', reason: 'other' } : resultStatus === 'completed' ? { type: 'complete' } : status.type === 'running' ? status : { type: 'incomplete', reason: 'other' }
  const lifecycle = cancelled ? 'cancelled' : failed ? 'failed' : unknown ? 'waiting' : displayStatus.type === 'running' ? 'leased' : 'succeeded'

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
    if (!approval || !ownsApproval(current, toolCallId, approval.id) || part?.type !== 'tool-call' || !part.approval || part.approval.id !== approval?.id || part.approval.approved !== undefined
      || part.approval.resolution || part.approval.options?.length) throw new Error('409')
    await chatTransport.resolveApproval(part.approval.id, approved ? 'approved' : 'denied')
  })
  const resume = () => act(async current => {
    const meta = current.metadata.custom, view = meta.harness as RunDisplayState | undefined
    const part = current.content.find(part => part.type === 'tool-call' && part.toolCallId === toolCallId)
    const currentOwner = inputOwner(current)
    if (currentOwner.type !== 'tool' || currentOwner.toolCallId !== toolCallId || part?.type !== 'tool-call' || !part.interrupt || hasQuestionnaireWait(meta) || !answer.trim() || !view || view.runId !== meta.runId
      || view.requestVersion !== (custom.harness as RunDisplayState | undefined)?.requestVersion
      || typeof meta.conversationId !== 'string' || typeof meta.senderId !== 'string') throw new Error('409')
    await chatTransport.continueRun({ conversationId: meta.conversationId, agentId: meta.senderId, runId: view.runId,
      ...(typeof meta.threadRootId === 'string' ? { threadId: meta.threadRootId } : {}) }, answer.trim(), view.requestVersion)
  })

  if (/^(email|calendar)\./.test(toolName)) return <p className="whitespace-pre-wrap text-sm text-muted-foreground">邮件和日历功能已停止支持；此记录仅供查看。</p>

  return <section aria-label={display.title} data-tool-state={displayStatus.type} className="grid min-w-0 gap-2 text-sm">
    <MessageFooterContents inset={false}>
      <ToolCall label={label} activeLabel="正在处理" query={display.title} request={display.purpose}
        result={display.summary ?? (status.type === 'running' ? '正在执行这一步。' : '这一步尚未完成。')}
        running={displayStatus.type === 'running'} outcome={failed ? 'failed' : sourceState?.status === 'processing' || sourceState?.status === 'queued' ? 'pending' : displayStatus.type === 'complete' ? 'complete' : 'pending'}
        open={detailsOpen} onOpenChange={setDetailsOpen} />
      {detailsOpen && <div className="grid gap-2 ps-5 text-sm text-muted-foreground">
        {publicInput.success && publicInput.data?.map(field => <p key={field.label}><span className="font-medium">{field.label}：</span>{field.value}</p>)}
        {props.timing?.completedAt !== undefined && <p>耗时 {((props.timing.completedAt - props.timing.startedAt) / 1000).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 秒</p>}
      </div>}
      {hasRichTool(toolName) && (result !== undefined || displayStatus.type === 'running') && <MessagePartBoundary resetKey={result} running={displayStatus.type === 'running'}>
        {Detail && <Detail {...canonicalProps} readOnly={readOnly} />}
        {/^memory(?:\.|__)/.test(toolName) && resultStatus === 'completed' && !isError && memory.success && <MemoryTool memory={memory.data} readOnly={readOnly} />}
        {toolName === 'research.search' && <ResearchSources calls={[canonicalProps]} lifecycle={lifecycle} />}
      </MessagePartBoundary>}
      {failed && <p role="alert" className="text-xs text-destructive">这一步未完成，请重试。</p>}
      {approval && <div className="space-y-2">
        {approval.approved === true && <p role="status" className="text-xs text-muted-foreground">已批准{approval.isAutomatic ? '（自动审批）' : ''}</p>}
        {approval.reason && <p className="text-xs text-muted-foreground">{approval.reason}</p>}
        {approval.options?.length ? <div className="rounded-xl border border-border/60 p-3">
          <p className="mb-2 text-xs text-muted-foreground">{pending ? '此审批选项暂不支持在消息中提交。' : '审批选项'}</p>
          {approval.options.map(option => <div key={option.id} className="mb-2 last:mb-0">
            <p>{option.label ?? option.kind}{approval.optionId === option.id ? ' · 已选择' : ''}</p>
            {option.description && <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>}
            {option.grants?.length ? <p className="mt-1 break-words text-xs text-muted-foreground">权限范围：{option.grants.join('、')}</p> : null}
          </div>)}
        </div> : pending && ownsGate && permitted && <ApprovalRequestCard approvalId={approval.id} sender={String(custom.senderName ?? '助手')} busy={busy || accepted}
          onApprove={() => approve(true)} onDeny={() => approve(false)} />}
        {pending && ownsGate && !permitted && <p className="text-xs text-muted-foreground">等待有权限的成员审批。</p>}
      </div>}
      {interrupt && ownsInput && !ended && !questionnaireWait && <fieldset disabled={!permitted || busy || accepted} className="min-w-0">
        <ElicitationForm server="补充信息" message={typeof interrupt.payload === 'object' && interrupt.payload && 'prompt' in interrupt.payload
          && typeof interrupt.payload.prompt === 'string' ? interrupt.payload.prompt : '请补充信息以继续任务。'}
          fields={[{ name: 'answer', label: '补充信息', kind: 'text', value: answer, required: true }]}
          state={accepted ? 'accepted' : 'request'} acceptDisabled={!permitted || busy || !answer.trim()} acceptLabel={busy ? '正在提交…' : '提交'}
          onFieldChange={(_, value) => setAnswer(String(value))} onAccept={() => void resume()} />
      </fieldset>}
      {interrupt && ownsInput && !permitted && <p className="text-xs text-muted-foreground">等待有权限的成员补充信息。</p>}
      {accepted && (pending || interrupt) && <p role="status" className="text-xs text-muted-foreground">已提交，正在同步任务状态…</p>}
      {children}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </MessageFooterContents>
  </section>
}
