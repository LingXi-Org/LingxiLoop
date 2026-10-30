import { useAuiState, type DataMessagePartProps } from '@assistant-ui/react'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { questionnaireAnswersSchema, type QuestionnaireState } from '@/api/questionnaires'
import { DocumentReference } from '@/components/assistant-ui/elements/document-reference'
import { ProgressCard, type ProgressStep } from '@/components/assistant-ui/elements/progress-card'
import { MessageFooterContents, MessageFooterContext } from '@/components/assistant-ui/message-footer'
import { userFacingError } from '@/lib/userFacingError'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { readComposerDraft, saveComposerDraft, type ComposerDraftScope } from '../drafts'
import { getMeId, useAuth } from '@/stores/auth'
import { chatTransport } from '../runtime/transport'
import { CanvasArtifactTool, CanvasProgressTool, ElicitationFormTool,
  PollFormTool, RecommendationTool } from './ToolRenderers'

const record = (value: unknown) => z.record(z.string(), z.unknown()).parse(value)
const emailSchema = z.object({ from: z.string(), to: z.array(z.string()), cc: z.array(z.string()).default([]),
  subject: z.string(), body: z.string(), outcome: z.enum(['sent', 'cancelled']).optional() })
const documentSchema = z.object({ title: z.string(), pages: z.number().int().positive().optional(),
  anchors: z.array(z.object({ page: z.number().int().positive(), quote: z.string() })).default([]) })
const activityStatus: Record<string, ProgressStep['status']> = { running: 'running', working: 'running', completed: 'complete',
  complete: 'complete', failed: 'failed', cancelled: 'stopped', stopped: 'stopped', 完成: 'complete' }

export function BusinessMessagePart({ name, data, readOnly }: DataMessagePartProps<unknown> & { readOnly: boolean }) {
  const message = useAuiState(state => state.message)
  const identity = useAuth(state => `${state.user?.id}:${state.activeCompanyId}`)
  return name === 'questionnaire'
    ? <DurableQuestionnaire key={`${identity}:${message.metadata.custom.conversationId}:${message.id}`} data={data} readOnly={readOnly} />
    : <LegacyBusinessMessagePart name={name} data={data} readOnly={readOnly} />
}

function DurableQuestionnaire({ data, readOnly }: { data: unknown; readOnly: boolean }) {
  const message = useAuiState(state => state.message)
  const conversationId = message.metadata.custom.conversationId
  const companyId = useAuth(auth => auth.activeCompanyId)
  const userId = useAuth(auth => auth.user?.id ?? null)
  const [draftScope] = useState<ComposerDraftScope>(() => ({ companyId, userId,
    projectId: getWorkspaceSession()?.projectId ?? null, conversationId: String(conversationId), threadRootId: message.id, kind: 'questionnaire' }))
  const [initialAnswers] = useState(() => {
    try {
      const text = !readOnly && readComposerDraft(draftScope)?.text
      const parsed = questionnaireAnswersSchema.safeParse(text ? JSON.parse(text) : {})
      return parsed.success ? parsed.data : {}
    } catch { return {} }
  })
  const [state, setState] = useState<QuestionnaireState | null>(null)
  useEffect(() => {
    // A durable server receipt supersedes local unsent answers. Unavailable
    // includes cancellation, expiry and revoked access; it cannot be replayed.
    if (state && state.status !== 'waiting') saveComposerDraft(draftScope, { text: '', attachments: [] })
  }, [state, draftScope])
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null), [reload, setReload] = useState(0)
  const inFlight = useRef(false), lifecycle = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    lifecycle.current = controller
    setState(null); setLoading(true); setError(null)
    const load = async () => {
      try {
        if (typeof conversationId !== 'string') throw new Error('这条消息不可回复')
        const saved = await chatTransport.readQuestionnaire(conversationId, message.id, controller.signal)
        if (!controller.signal.aborted) setState(saved)
      } catch (cause) {
        if (!controller.signal.aborted) setError(userFacingError(cause, '问卷状态加载失败，请重新载入。'))
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [conversationId, message.id, readOnly, reload])
  useEffect(() => {
    if (state?.status !== 'pending' && state?.status !== 'resuming' || typeof conversationId !== 'string') return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const saved = await chatTransport.readQuestionnaire(conversationId, message.id, controller.signal)
        if (!controller.signal.aborted && !inFlight.current) { setState(saved); setError(null) }
      } catch (cause) {
        if (!controller.signal.aborted) setError(userFacingError(cause, '提交状态暂未确认，可重新载入。'))
      } finally { if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 3000) }
    }
    timer = setTimeout(() => void poll(), 3000)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [state?.status, conversationId, message.id])
  const disabled = readOnly || loading || busy || !state || state.readOnly || state.status !== 'waiting'
  async function submit(answers: unknown) {
    const retrying = (state?.status === 'pending' || state?.status === 'resuming' && state.retryable) && !readOnly && !loading && !busy
    if (disabled && !retrying || inFlight.current || typeof conversationId !== 'string') return
    const controller = lifecycle.current
    inFlight.current = true; setBusy(true); setError(null)
    try {
      const saved = await chatTransport.answerQuestionnaire(conversationId, message.id, questionnaireAnswersSchema.parse(answers))
      if (!controller?.signal.aborted) setState(saved)
    } catch (cause) {
      if (!controller?.signal.aborted) setError(userFacingError(cause, '提交状态未确认，请重试或重新载入。'))
    } finally {
      inFlight.current = false
      if (!controller?.signal.aborted) setBusy(false)
    }
  }
  return <div className="grid min-w-0 gap-2">
    <fieldset disabled={disabled} aria-busy={loading || busy}>
      <ElicitationFormTool args={{ ...record(data), id: message.id, acceptedLabel: state?.status === 'pending' ? '回答已保存，正在确认提交' : state?.status === 'resuming' ? '回答已提交，等待继续' : undefined }}
        initialAnswers={initialAnswers} onAnswersChange={answers => {
          if (!disabled) saveComposerDraft(draftScope, { text: JSON.stringify(answers), attachments: [] })
        }}
        result={state?.status === 'submitted' || state?.status === 'pending' || state?.status === 'resuming' ? state.answers : undefined} addResult={submit} />
    </fieldset>
    {loading && <p role="status" className="text-xs text-muted-foreground">正在读取问卷状态…</p>}
    {busy && <p role="status" className="text-xs text-muted-foreground">正在提交…</p>}
    {state?.status === 'pending' && !readOnly && <button type="button" disabled={busy || loading}
      className="w-fit rounded px-2 py-1 text-xs underline focus-visible:outline-2" onClick={() => void submit(state.answers)}>重试提交</button>}
    {state?.status === 'resuming' && state.retryable && !readOnly && <button type="button" disabled={busy || loading}
      className="w-fit rounded px-2 py-1 text-xs underline focus-visible:outline-2" onClick={() => void submit(state.answers)}>重试继续</button>}
    {state?.status === 'unavailable' && <p className="text-xs text-muted-foreground">这份问卷已不可提交。</p>}
    {state?.status === 'waiting' && state.readOnly && <p className="text-xs text-muted-foreground">这份问卷仅供查看。</p>}
    {error && <><p role="alert" className="text-xs text-destructive">{error}</p>
      <button type="button" disabled={busy || loading} className="w-fit rounded px-2 py-1 text-xs underline focus-visible:outline-2" onClick={() => setReload(value => value + 1)}>重新载入</button></>}
  </div>
}

function LegacyBusinessMessagePart({ name, data, readOnly }: Pick<DataMessagePartProps<unknown>, 'name' | 'data'> & { readOnly: boolean }) {
  const message = useAuiState(state => state.message)
  const replies = useAuiState(state => state.thread.messages)
  const [submitted, setSubmitted] = useState<unknown>()
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const custom = message.metadata.custom
  const value = record(data)
  const answer = replies.find(reply => reply.role === 'user' && reply.metadata.custom.senderId === getMeId()
    && reply.metadata.custom.delivery === 'sent' && reply.metadata.custom.conversationId === custom.conversationId
    && reply.metadata.custom.replyToClientMsgNo === message.id
    && ((reply.metadata.custom.recommendationReply ?? reply.metadata.custom.questionnaireReply) as { questionId?: string } | undefined)?.questionId === message.id)
  const recorded = ((answer?.metadata.custom.recommendationReply ?? answer?.metadata.custom.questionnaireReply) as { answers?: Record<string, unknown> } | undefined)?.answers
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
  async function perform(work: () => Promise<void>) {
    if (readOnly || inFlight.current) return
    inFlight.current = true; setBusy(true); setError(null)
    try { await work() } catch (cause) { setError(userFacingError(cause, '提交失败，请重试。')) }
    finally { inFlight.current = false; setBusy(false) }
  }
  const submit = (answers: unknown) => perform(async () => {
    if (result !== undefined) return
    if (typeof custom.conversationId !== 'string') throw new Error('这条消息不可回复')
    await chatTransport.answerRecommendation(custom.conversationId, message.id, z.record(z.string(), z.union([z.string(), z.array(z.string())])).parse(answers))
    setSubmitted(answers)
  })

  let content
  switch (name) {
    case 'poll': {
      const poll = record(value.poll), tallies = z.array(z.object({ optionId: z.string(), count: z.number(), voterIds: z.array(z.string()) })).parse(value.pollTallies)
      const selected = tallies.filter(tally => tally.voterIds.includes(getMeId() ?? '')).map(tally => tally.optionId)
      content = <PollFormTool args={{ id: message.id, title: poll.question, selectionMode: poll.mode, closedAt: poll.closedAt,
        options: z.array(z.object({ id: z.string(), text: z.string() })).parse(poll.options).map(option => ({ id: option.id, label: option.text,
          description: `${tallies.find(tally => tally.optionId === option.id)?.count ?? 0} 票` })) }} result={submitted ?? (selected.length ? selected : undefined)}
        addResult={selection => perform(async () => {
          if (submitted !== undefined || selected.length || poll.closedAt) return
          const ids = typeof selection === 'string' ? [selection] : z.array(z.string()).parse(selection)
          await chatTransport.votePoll(message.id, ids); setSubmitted(ids)
        })} />
      break
    }
    case 'recommendation': content = <MessageFooterContents inset={false}><RecommendationTool args={value} result={result} addResult={submit} /></MessageFooterContents>; break
    case 'handoff': content = <p className="whitespace-pre-wrap break-words text-sm">{[value.title, value.task, value.context, value.result, value.error].filter((part): part is string => typeof part === 'string' && Boolean(part)).join('\n') || '历史协作记录'}</p>; break
    case 'canvas': content = <>
      <MessageFooterContext.Provider value={null}><CanvasProgressTool args={{ ...value, id: value.canvasId }} /></MessageFooterContext.Provider>
      <CanvasArtifactTool args={{ id: value.canvasId, title: value.title, description: value.goal, href: `lingxiloop://canvas/${encodeURIComponent(String(value.canvasId))}` }} />
    </>; break
    case 'citation-claims': return null
    case 'document-reference': content = <MessageFooterContents inset={false}><DocumentReference {...documentSchema.parse(value)} activePage={-1} /></MessageFooterContents>; break
    case 'email': {
      const email = emailSchema.parse(value)
      content = <div className="whitespace-pre-wrap text-sm"><p>{email.subject}</p><p>{email.body}</p><p className="text-muted-foreground">邮件功能已停止支持；此记录仅供查看。</p></div>
      break
    }
    case 'tool-activity': {
      const activity = z.object({ title: z.string().optional(), status: z.string().optional(), description: z.string().optional(),
        steps: z.array(z.object({ id: z.string(), label: z.string(), status: z.string(), description: z.string().optional() })).optional() }).parse(value)
      content = <ProgressCard title={activity.title ?? '工具活动'} steps={(activity.steps ?? [{ id: message.id, label: activity.title ?? '工具活动',
        status: activity.status ?? 'pending', description: activity.description }]).map(step => ({ id: step.id, label: step.label,
        status: activityStatus[step.status] ?? 'pending', detail: step.description }))} />
      break
    }
    case 'learning-mission': case 'teacher-briefing': return <p className="text-sm text-muted-foreground">历史学习记录已归档。</p>
    default: throw new Error('不支持的数据组件')
  }
  return <fieldset disabled={readOnly || busy} aria-busy={busy} className="grid min-w-0 gap-2">
    {content}
    {busy && <p role="status" className="text-xs text-muted-foreground">正在提交…</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </fieldset>
}
