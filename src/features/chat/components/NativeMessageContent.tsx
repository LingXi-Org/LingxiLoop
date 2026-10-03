import { MessagePrimitive, MessagePartPrimitive, useAuiState, type DataMessagePartProps, type FileMessagePartProps,
  type ImageMessagePartProps, type ReasoningMessagePartProps, type SourceMessagePartProps, type TextMessagePartComponent,
  type ToolCallMessagePartProps } from '@assistant-ui/react'
import { createContext, type ReactNode, useContext, useState } from 'react'
import { z } from 'zod'
import { AttachmentCard } from '@/components/assistant-ui/elements/attachment-card'
import { MarkdownText, type MarkdownConfidenceClaim } from '@/components/assistant-ui/markdown-text'
import { MessageFooterContext, MessageFooterContents } from '@/components/assistant-ui/message-footer'
import { styledGenerativeUILibrary } from '@/components/assistant-ui/elements/generative-ui'
import { Button } from '@/components/ui/button'
import { generativeComponentSchemas } from '@/lib/nativeMessage'
import { getMeId } from '@/stores/auth'
import { chatTransport } from '../runtime/transport'
import { userFacingError } from '@/lib/userFacingError'
import { ApprovalRequestCard } from './ApprovalRequestCard'
import type { RunDisplayState } from '@/lib/agentRunSnapshot'
import { AgentHandoffTool, AgentPlanTool, CalendarEventCard, CanvasArtifactTool, CanvasProgressTool, ElicitationFormTool,
  PollFormTool, PresentationArtifactTool, RecommendationTool, TeacherBriefingStatsTool, TOOL_DETAILS } from './ToolRenderers'

const record = (value: unknown) => z.record(z.string(), z.unknown()).parse(value)
const json = (value: unknown) => JSON.stringify(value, null, 2)
const ReadOnlyMessage = createContext(false)

function ReasoningPart({ text, unstable_summary }: ReasoningMessagePartProps) {
  return <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring">{unstable_summary || '推理过程'}</summary><p className="mt-2 whitespace-pre-wrap">{text}</p></details>
}
function SourcePart(part: SourceMessagePartProps) {
  return <div className="rounded-lg border p-3 text-xs"><MessageFooterContents inset={false}>
    {part.sourceType === 'url' ? <a href={part.url} target="_blank" rel="noreferrer" className="text-primary underline">{part.title ?? part.url}</a>
      : <div><p>{part.title}</p><p className="text-muted-foreground">{[part.filename, part.mediaType].filter(Boolean).join(' · ')}</p></div>}
  </MessageFooterContents></div>
}
function ImagePart({ image, filename }: ImageMessagePartProps) { return <AttachmentCard filename={filename ?? '图片'} data={image} mimeType="image/*" sourceType="url" /> }
function FilePart({ data, filename, mimeType, sourceType }: FileMessagePartProps) { return <AttachmentCard filename={filename ?? '附件'} data={data} mimeType={mimeType} sourceType={sourceType} /> }

function BusinessPart({ name, data }: DataMessagePartProps<unknown>) {
  const readOnly = useContext(ReadOnlyMessage)
  const message = useAuiState(state => state.message)
  const replies = useAuiState(state => state.thread.messages)
  const [submitted, setSubmitted] = useState<unknown>()
  const custom = message.metadata.custom
  const value = record(data)
  const answer = replies.find(reply => reply.role === 'user' && reply.metadata.custom.senderId === getMeId()
    && reply.metadata.custom.conversationId === custom.conversationId && reply.metadata.custom.replyToClientMsgNo === message.id
    && (reply.metadata.custom.questionnaireReply as { questionId?: string } | undefined)?.questionId === message.id)
  const recorded = (answer?.metadata.custom.questionnaireReply as { answers?: Record<string, unknown> } | undefined)?.answers
  const items = value.items as Array<{ name: string; required?: boolean; multiple?: boolean; input?: unknown; choices?: Array<{ value: string; disabled?: boolean }> }> | undefined
  const valid = recorded && items?.length && Object.keys(recorded).every(key => items.some(item => item.name === key))
    && items.every(item => {
      const response = recorded[item.name]
      if (response === undefined) return !item.required
      if (Array.isArray(response) && !item.multiple) return false
      const values = Array.isArray(response) ? response : [response]
      return (!item.required || values.length > 0) && values.length <= 12 && values.every(value => typeof value === 'string' && value.length <= 4000
        && (!item.required || value.trim().length > 0) && (item.input || item.choices?.some(choice => choice.value === value && !choice.disabled)))
    })
  const result = submitted ?? (valid ? recorded : undefined)
  const submit = async (answers: unknown) => {
    if (readOnly) throw new Error('子消息只供查看')
    if (typeof custom.conversationId !== 'string') throw new Error('这条消息不可回复')
    await chatTransport.answerQuestionnaire(custom.conversationId, message.id, z.record(z.string(), z.union([z.string(), z.array(z.string())])).parse(answers))
    setSubmitted(answers)
  }
  switch (name) {
    case 'poll': {
      const poll = record(value.poll), tallies = z.array(z.object({ optionId: z.string(), count: z.number(), voterIds: z.array(z.string()) })).parse(value.pollTallies)
      const selected = tallies.filter(tally => tally.voterIds.includes(getMeId() ?? '')).map(tally => tally.optionId)
      return <PollFormTool args={{ id: message.id, title: poll.question, selectionMode: poll.mode, closedAt: poll.closedAt,
        options: z.array(z.object({ id: z.string(), text: z.string() })).parse(poll.options).map(option => ({ id: option.id, label: option.text,
          description: `${tallies.find(tally => tally.optionId === option.id)?.count ?? 0} 票` })) }} result={submitted ?? (selected.length ? selected : undefined)}
        addResult={async selection => { const ids = typeof selection === 'string' ? [selection] : z.array(z.string()).parse(selection); await chatTransport.votePoll(message.id, ids); setSubmitted(ids) }} />
    }
    case 'questionnaire': return <ElicitationFormTool args={{ ...value, id: message.id }} result={result} addResult={submit} />
    case 'recommendation': return <RecommendationTool args={value} result={result} addResult={submit} />
    case 'handoff': return <AgentHandoffTool args={value} />
    case 'learning-mission': return <AgentPlanTool args={{ ...value, id: value.missionId }} />
    case 'canvas': return <><CanvasProgressTool args={{ ...value, id: value.canvasId }} /><CanvasArtifactTool args={{ id: value.canvasId, title: value.title,
      description: value.goal, href: `lingxiloop://canvas/${encodeURIComponent(String(value.canvasId))}` }} /></>
    case 'teacher-briefing': return <TeacherBriefingStatsTool args={record(value.dashboard)} />
    case 'presentation-artifact': return <PresentationArtifactTool args={value} />
    case 'citation-claims': return null // The text renderer displays these beside their exact text ranges.
    case 'document-reference': case 'email': case 'tool-activity': return <details open className="rounded-lg border p-3 text-sm"><summary>{String(value.title ?? name)}</summary><pre className="whitespace-pre-wrap break-words">{json(value)}</pre></details>
    default: throw new Error(`不支持的数据组件：${name}`)
  }
}

function NativeTool(props: ToolCallMessagePartProps) {
  const readOnly = useContext(ReadOnlyMessage)
  const { toolName, argsText, result, isError, approval, interrupt, artifact, timing, messages, respondToApproval, resume } = props
  const custom = useAuiState(state => state.message.metadata.custom)
  const messageStatus = useAuiState(state => state.message.status)
  const [answer, setAnswer] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const pending = approval && approval.approved === undefined && !approval.resolution
  const label = isError ? '执行失败' : approval?.resolution === 'expired' ? '审批已过期'
    : approval?.resolution === 'cancelled' ? '审批已取消' : pending ? '等待审批' : interrupt ? '等待输入'
    : result !== undefined ? '已返回' : messageStatus?.type === 'running' ? '执行中'
    : messageStatus?.type === 'incomplete' && messageStatus.reason === 'cancelled' ? '已取消'
    : messageStatus?.type === 'incomplete' && messageStatus.reason === 'error' ? '执行失败' : '未完成'
  const permitted = !readOnly && custom.harnessControl !== false
  const Detail = TOOL_DETAILS[toolName as keyof typeof TOOL_DETAILS]
  async function act(work: () => unknown | Promise<unknown>) {
    setBusy(true); setError(null)
    try { await work() } catch (cause) { setError(userFacingError(cause, '操作失败，请重试。')) } finally { setBusy(false) }
  }
  return <MessageFooterContents><section aria-label={`工具：${toolName}`} className="min-w-0 rounded-lg border p-3 text-sm">
    <p className="font-medium">{toolName} <span className="text-xs text-muted-foreground">{label}</span></p>
    <details><summary className="cursor-pointer">参数</summary><pre className="whitespace-pre-wrap break-words">{argsText}</pre></details>
    {Detail && result !== undefined && <Detail {...props} />}
    {result !== undefined && <details open={isError}><summary className="cursor-pointer">{isError ? '错误详情' : '结果'}</summary><pre className="whitespace-pre-wrap break-words">{json(result)}</pre></details>}
    {artifact !== undefined && <details><summary className="cursor-pointer">产物</summary><pre className="whitespace-pre-wrap break-words">{json(artifact)}</pre></details>}
    {timing && <p className="text-xs text-muted-foreground">开始：{new Date(timing.startedAt).toLocaleString()}{timing.completedAt !== undefined && ` · 用时 ${timing.completedAt - timing.startedAt} 毫秒`}</p>}
    {approval && <div className="mt-2 space-y-2"><p role="status">{approval.resolution === 'expired' ? '审批已过期' : approval.resolution === 'cancelled' ? '审批已取消' : approval.approved === true ? '已批准' : approval.approved === false ? '已拒绝' : '需要你的批准'}{approval.reason && `：${approval.reason}`}</p>
      {pending && permitted && typeof custom.runId === 'string' ? <ApprovalRequestCard approvalId={approval.id} sender={String(custom.senderName ?? toolName)} busy={busy}
        onApprove={() => act(() => chatTransport.resolveApproval(approval.id, 'approved'))} onDeny={() => act(() => chatTransport.resolveApproval(approval.id, 'denied'))} /> : pending && permitted && <div className="flex flex-wrap gap-2">{approval.options?.length ? approval.options.map(option => <Button key={option.id} size="sm" disabled={busy} onClick={() => {
        if (option.confirm && !window.confirm(typeof option.confirm === 'object' ? option.confirm.description ?? option.confirm.title ?? '确认此操作？' : '确认此操作？')) return
        void act(() => respondToApproval({ optionId: option.id }))
      }}>{option.label ?? option.kind}</Button>) : <><Button size="sm" disabled={busy} onClick={() => void act(() => respondToApproval({ approved: true }))}>批准</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => respondToApproval({ approved: false }))}>拒绝</Button></>}</div>}
    </div>}
    {interrupt && <form className="mt-2 space-y-2" onSubmit={event => { event.preventDefault(); void act(() => {
      const view = custom.harness as RunDisplayState | undefined
      if (typeof custom.conversationId === 'string' && typeof custom.senderId === 'string' && view) return chatTransport.continueRun({ conversationId: custom.conversationId, agentId: custom.senderId, runId: view.runId,
        ...(typeof custom.threadRootId === 'string' ? { threadId: custom.threadRootId } : {}) }, answer, view.requestVersion)
      resume(answer)
    }) }}><p>需要补充信息</p><pre className="whitespace-pre-wrap break-words">{json(interrupt.payload)}</pre><label className="grid gap-1">补充信息<input className="rounded border p-2" value={answer} onChange={event => setAnswer(event.target.value)} /></label><Button type="submit" size="sm" disabled={busy || !answer.trim() || !permitted}>提交</Button></form>}
    {messages?.length ? <div className="mt-2 border-s-2 ps-3"><ReadOnlyMessage.Provider value={true}><MessagePartPrimitive.Messages components={{ Message: NativeMessageContent }} /></ReadOnlyMessage.Provider></div> : null}
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </section></MessageFooterContents>
}

const generativeComponents = Object.fromEntries(Object.entries(generativeComponentSchemas).map(([name, schema]) => [name,
  function NativeComponent({ children, ...props }: { children?: ReactNode }) {
    const parsed = record(schema.parse(props))
    if (name === 'calendar-event') return <CalendarEventCard args={parsed} />
    if (name === 'learning-stats') return <TeacherBriefingStatsTool args={parsed} />
    const Component = styledGenerativeUILibrary[name]!.render
    return <Component {...parsed} $status="done">{children}</Component>
  },
]))
const DefaultText = () => {
  const claims = useAuiState(state => {
    const part = state.message.content.find(part => part.type === 'data' && part.name === 'citation-claims')
    return part?.type === 'data' ? (part.data as { claims: MarkdownConfidenceClaim[] }).claims : undefined
  })
  return <MarkdownText agent confidenceClaims={claims} inlineCitations />
}
const components = { Text: DefaultText, Reasoning: ReasoningPart, Source: SourcePart, Image: ImagePart, File: FilePart,
  tools: { Fallback: NativeTool }, data: { Fallback: BusinessPart }, generativeUI: { components: generativeComponents } }

export function NativeMessageContent({ Text = DefaultText, footer = null, mediaFooter = null }: { Text?: TextMessagePartComponent; footer?: ReactNode; mediaFooter?: ReactNode }) {
  const readOnly = useContext(ReadOnlyMessage)
  const message = useAuiState(state => state.message)
  const attachments = message.role === 'user' ? message.attachments : []
  const last = message.content.reduce((last, part, index) => part.type !== 'data' || part.name !== 'citation-claims' ? index : last, -1)
  return <div className="grid min-w-0 gap-2" data-aui-theme="elements">
    {message.content.map((part, index) => <MessageFooterContext.Provider key={part.type === 'tool-call' ? part.toolCallId : index} value={index === last ? ['image','file'].includes(part.type) ? mediaFooter : footer : null}>
      <fieldset disabled={readOnly && part.type === 'data'} className="min-w-0" data-native-part={part.type}><MessagePrimitive.PartByIndex index={index} components={{ ...components, Text }} /></fieldset>
    </MessageFooterContext.Provider>)}
    {attachments.map(attachment => <div key={attachment.id} data-native-attachment={attachment.id} className="grid gap-1">
      {attachment.content.map((part, index) => <MessageFooterContext.Provider key={index} value={!message.content.length && attachment === attachments.at(-1) && index === attachment.content.length-1 ? mediaFooter : null}><div>{part.type === 'image' ? <AttachmentCard filename={part.filename ?? attachment.name} data={part.image} mimeType={attachment.contentType ?? 'image/*'} sourceType="url" />
        : part.type === 'file' ? <AttachmentCard filename={part.filename ?? attachment.name} data={part.data} mimeType={part.mimeType} sourceType={part.sourceType} />
        : part.type === 'text' ? <p className="whitespace-pre-wrap">{part.text}</p> : <p role="alert">不支持的附件内容</p>}</div></MessageFooterContext.Provider>)}
    </div>)}
  </div>
}
