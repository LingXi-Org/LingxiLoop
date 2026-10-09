import { useAuiState, type DataMessagePartProps } from '@assistant-ui/react'
import { useRef, useState } from 'react'
import { z } from 'zod'
import { DocumentReference } from '@/components/assistant-ui/elements/document-reference'
import { ProgressCard, type ProgressStep } from '@/components/assistant-ui/elements/progress-card'
import { MessageFooterContents, MessageFooterContext } from '@/components/assistant-ui/message-footer'
import { userFacingError } from '@/lib/userFacingError'
import { getMeId } from '@/stores/auth'
import { chatTransport } from '../runtime/transport'
import { AgentHandoffTool, AgentPlanTool, CanvasArtifactTool, CanvasProgressTool, DraftEmailTool, ElicitationFormTool,
  PollFormTool, PresentationArtifactTool, RecommendationTool, TeacherBriefingStatsTool } from './ToolRenderers'

const record = (value: unknown) => z.record(z.string(), z.unknown()).parse(value)
const emailSchema = z.object({ from: z.string(), to: z.array(z.string()), cc: z.array(z.string()).default([]),
  subject: z.string(), body: z.string(), outcome: z.enum(['sent', 'cancelled']).optional() })
const documentSchema = z.object({ title: z.string(), pages: z.number().int().positive().optional(),
  anchors: z.array(z.object({ page: z.number().int().positive(), quote: z.string() })).default([]) })
const activityStatus: Record<string, ProgressStep['status']> = { running: 'running', working: 'running', completed: 'complete',
  complete: 'complete', failed: 'failed', cancelled: 'stopped', stopped: 'stopped', 完成: 'complete' }

export function BusinessMessagePart({ name, data, readOnly }: DataMessagePartProps<unknown> & { readOnly: boolean }) {
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
  async function perform(work: () => Promise<void>) {
    if (readOnly || inFlight.current) return
    inFlight.current = true; setBusy(true); setError(null)
    try { await work() } catch (cause) { setError(userFacingError(cause, '提交失败，请重试。')) }
    finally { inFlight.current = false; setBusy(false) }
  }
  const submit = (answers: unknown) => perform(async () => {
    if (result !== undefined) return
    if (typeof custom.conversationId !== 'string') throw new Error('这条消息不可回复')
    await chatTransport.answerQuestionnaire(custom.conversationId, message.id, z.record(z.string(), z.union([z.string(), z.array(z.string())])).parse(answers))
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
    case 'questionnaire': content = <ElicitationFormTool args={{ ...value, id: message.id }} result={result} addResult={submit} />; break
    case 'recommendation': content = <MessageFooterContents inset={false}><RecommendationTool args={value} result={result} addResult={submit} /></MessageFooterContents>; break
    case 'handoff': content = <AgentHandoffTool args={value} />; break
    case 'learning-mission': content = <MessageFooterContents inset={false}><AgentPlanTool args={{ ...value, id: value.missionId }} /></MessageFooterContents>; break
    case 'canvas': content = <>
      <MessageFooterContext.Provider value={null}><CanvasProgressTool args={{ ...value, id: value.canvasId }} /></MessageFooterContext.Provider>
      <CanvasArtifactTool args={{ id: value.canvasId, title: value.title, description: value.goal, href: `lingxiloop://canvas/${encodeURIComponent(String(value.canvasId))}` }} />
    </>; break
    case 'teacher-briefing': content = <MessageFooterContents inset={false}><TeacherBriefingStatsTool args={record(value.dashboard)} /></MessageFooterContents>; break
    case 'presentation-artifact': content = <PresentationArtifactTool args={value} />; break
    case 'citation-claims': return null
    case 'document-reference': content = <MessageFooterContents inset={false}><DocumentReference {...documentSchema.parse(value)} activePage={-1} /></MessageFooterContents>; break
    case 'email': content = <DraftEmailTool args={{ id: message.id, ...emailSchema.parse(value) }} readOnly addResult={() => {}} />; break
    case 'tool-activity': {
      const activity = z.object({ title: z.string().optional(), status: z.string().optional(), description: z.string().optional(),
        steps: z.array(z.object({ id: z.string(), label: z.string(), status: z.string(), description: z.string().optional() })).optional() }).parse(value)
      content = <ProgressCard title={activity.title ?? '工具活动'} steps={(activity.steps ?? [{ id: message.id, label: activity.title ?? '工具活动',
        status: activity.status ?? 'pending', description: activity.description }]).map(step => ({ id: step.id, label: step.label,
        status: activityStatus[step.status] ?? 'pending', detail: step.description }))} />
      break
    }
    default: throw new Error('不支持的数据组件')
  }
  return <fieldset disabled={readOnly || busy} aria-busy={busy} className="grid min-w-0 gap-2">
    {content}
    {busy && <p role="status" className="text-xs text-muted-foreground">正在提交…</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </fieldset>
}
