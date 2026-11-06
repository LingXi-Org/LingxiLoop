import { useAui, useAuiState, type ToolCallMessagePartProps, type ToolCallMessagePartStatus } from '@assistant-ui/react'
import { type ReactNode, useRef, useState } from 'react'
import { ToolCall, ToolFields, type ToolHint, type ToolTone } from '@/components/assistant-ui/elements/tool-call'
import { toolDisplaySchema, canonicalToolName, resolveToolDisplay } from '@/lib/runActivity'
import { ElicitationForm } from '@/components/assistant-ui/elements/elicitation-form'
import { MessageFooterContents } from '@/components/assistant-ui/message-footer'
import type { RunDisplayState } from '@/lib/agentRunSnapshot'
import { userFacingError } from '@/lib/userFacingError'
import { chatTransport } from '../runtime/transport'
import { knowledgeSourceState } from '../runtime/task-progress'
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
  const display = resolveToolDisplay(toolName, resultStatus, result && typeof result === 'object' ? Reflect.get(result, 'display') : undefined,
    result && typeof result === 'object' ? Reflect.get(result, 'sourceStatus') : undefined)
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

  const approvalNeeded = Boolean(pending && ownsGate && permitted && !approval?.options?.length)
  const tone: ToolTone = failed ? 'failed' : cancelled ? 'idle' : pending ? 'attention' : interrupt && !ended ? 'input'
    : /(write|create|update|draft|publish|send|save|edit|delete)/i.test(toolName) ? 'write' : 'read'
  const hint: ToolHint | undefined = accepted && (pending || interrupt) ? { tone: 'syncing', text: '已提交，正在同步任务状态…' }
    : approvalNeeded ? { tone: 'attention', text: '需要批准' }
    : pending && ownsGate && !permitted ? { tone: 'waiting', text: '等待有权限的成员审批' }
    : interrupt && ownsInput && !permitted ? { tone: 'waiting', text: '等待有权限的成员补充信息' }
    : failed ? { tone: 'failed', text: '这一步未完成' }
    : undefined
  const timing = props.timing
  const seconds = timing?.completedAt !== undefined ? (timing.completedAt - timing.startedAt) / 1000 : undefined
  const clock = (ms: number) => new Date(ms).toLocaleTimeString('zh-CN', { hour12: false })
  const fields = [
    ...(publicInput.success ? publicInput.data ?? [] : []),
    ...(display.summary ? [{ label: 'summary', value: display.summary }] : []),
    ...(timing?.completedAt !== undefined ? [{ label: 'time', value: `${clock(timing.startedAt)} → ${clock(timing.completedAt)}` }] : []),
  ]
  const open = detailsOpen || approvalNeeded

  return <section aria-label={display.title} data-tool-state={displayStatus.type} className="grid min-w-0 gap-2 text-sm">
    <MessageFooterContents inset={false}>
      <ToolCall name={display.title} code={toolName} statusLabel={label} tone={tone} running={displayStatus.type === 'running'}
        duration={seconds !== undefined ? `${seconds.toLocaleString('zh-CN', { maximumFractionDigits: 1 })}s` : undefined}
        hint={hint} open={open} onOpenChange={setDetailsOpen}>
        {display.purpose && <p className="text-[12.5px] leading-[1.6] text-fg2">{display.purpose}</p>}
        {approval?.approved === true && <span className="inline-flex items-center gap-1.5">
          <span className="h-[18px] rounded-full bg-[rgb(31_138_91/10%)] px-1.5 text-[11px] font-medium leading-[18px] text-[#1F8A5B]">{approval.isAutomatic ? '自动批准' : '已批准'}</span>
          {approval.reason && <span className="text-[12.5px] text-muted-foreground">{approval.reason}</span>}
        </span>}
        {approval && approval.approved !== true && approval.reason && <p className="text-[12.5px] leading-[1.6] text-fg2"><span className="text-muted-foreground">理由 · </span>{approval.reason}</p>}
        {approval?.options?.length ? <div role="radiogroup" aria-label="审批选项" aria-readonly="true" className="flex flex-col gap-1.5">
          {approval.options.map(option => {
            const chosen = approval.optionId === option.id
            return <div key={option.id} role="radio" aria-checked={chosen} className={chosen ? 'flex gap-2.5 rounded-[10px] bg-[rgb(46_125_91/5%)] px-3 py-[9px] shadow-[inset_0_0_0_1px_rgb(46_125_91/40%)]' : 'flex gap-2.5 rounded-[10px] px-3 py-[9px] shadow-[inset_0_0_0_1px_var(--border)]'}>
              <span aria-hidden="true" className={chosen ? 'mt-0.5 size-4 shrink-0 rounded-full border-[5px] border-brand' : 'mt-0.5 size-4 shrink-0 rounded-full border-[1.5px] border-input'} />
              <span className="flex min-w-0 flex-col gap-px">
                <span className="text-[13px] font-medium">{option.label ?? option.kind}</span>
                {option.description && <span className="text-xs text-muted-foreground">{option.description}</span>}
                {option.grants?.length ? <span className="text-[11.5px] text-muted-foreground">权限范围 · <code className="font-mono text-[11px] text-fg2">{option.grants.join(' · ')}</code></span> : null}
              </span>
            </div>
          })}
          {pending && <p className="text-xs text-muted-foreground">此审批选项暂不支持在消息中提交。</p>}
        </div> : null}
        <ToolFields fields={fields} />
        {approvalNeeded && <div className="flex justify-end gap-1.5">
          <button type="button" disabled={busy || accepted} onClick={() => void approve(false)} className="h-[30px] rounded-[9px] px-2.5 text-[13px] font-medium text-fg2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 max-md:min-h-11">拒绝</button>
          <button type="button" disabled={busy || accepted} onClick={() => void approve(true)} className="h-[30px] rounded-[9px] bg-brand px-3.5 text-[13px] font-medium text-brand-foreground hover:bg-[color-mix(in_srgb,var(--brand)_90%,var(--foreground))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40 max-md:min-h-11">批准</button>
        </div>}
      </ToolCall>
      {hasRichTool(toolName) && (result !== undefined || displayStatus.type === 'running') && <MessagePartBoundary resetKey={result} running={displayStatus.type === 'running'}>
        {Detail && <Detail {...canonicalProps} readOnly={readOnly} />}
        {/^memory(?:\.|__)/.test(toolName) && resultStatus === 'completed' && !isError && memory.success && <MemoryTool memory={memory.data} readOnly={readOnly} />}
        {toolName === 'research.search' && <ResearchSources calls={[canonicalProps]} lifecycle={lifecycle} />}
      </MessagePartBoundary>}
      {interrupt && ownsInput && !ended && !questionnaireWait && <fieldset disabled={!permitted || busy || accepted} className="min-w-0">
        <ElicitationForm server="补充信息" message={typeof interrupt.payload === 'object' && interrupt.payload && 'prompt' in interrupt.payload
          && typeof interrupt.payload.prompt === 'string' ? interrupt.payload.prompt : '请补充信息以继续任务。'}
          fields={[{ name: 'answer', label: '补充信息', kind: 'text', value: answer, required: true }]}
          state={accepted ? 'accepted' : 'request'} acceptDisabled={!permitted || busy || !answer.trim()} acceptLabel={busy ? '正在提交…' : '提交'}
          onFieldChange={(_, value) => setAnswer(String(value))} onAccept={() => void resume()} />
      </fieldset>}
      {children}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </MessageFooterContents>
  </section>
}
