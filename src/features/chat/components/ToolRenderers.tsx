import { RecommendationCard } from '@/components/assistant-ui/elements/recommendation-card'
import type { ThreadMessage, ToolCallMessagePartProps } from '@assistant-ui/react'
import { renderGenerativeUI, type UIElement, type UISpec } from '@assistant-ui/react-generative-ui'
import { useState } from 'react'
import { Plan } from '@/components/tool-ui/plan'
import { ProgressTracker } from '@/components/tool-ui/progress-tracker'
import { canvasProgress, handoffProgress, missionPlan } from '../runtime/task-progress'
import { PollCard } from '@/components/assistant-ui/elements/poll-card'
import { CanvasArtifactCard } from '@/features/canvas/components/CanvasArtifactCard'
import {
  type ElicitationField,
  ElicitationForm,
  type ElicitationValue,
} from '@/components/assistant-ui/elements/elicitation-form'
import { styledGenerativeUILibrary } from '@/components/assistant-ui/elements/generative-ui'
import { ApprovalCard } from '@/components/assistant-ui/elements/approval-card'
import { ScoreBreakdown, type ScoreCriterion } from '@/components/assistant-ui/elements/score-breakdown'
import { CardSurface, conversationCardSize } from '@/components/assistant-ui/elements/surfaces'
import { StatsDisplay } from '@/components/tool-ui/stats-display'
import { parseSerializableStatsDisplay } from '@/components/tool-ui/stats-display/schema'
import { useParticipants } from '@/features/agents/state'
import type { CalendarEvent } from '@/features/calendar/contracts'
import {
  PresentationArtifactCard,
  parsePresentationArtifact,
} from '@/features/presentations'
import { useSurface } from '@/stores/surface'

export function ApprovalCardTool({ args, approval, respondToApproval }: ToolCallMessagePartProps) {
  const value = args as {
    id: string
    question: string
    detail: string
  }
  if (!approval) return null
  const pending = approval.approved === undefined
  return (
    <ApprovalCard
      data-assistant-ui-id={value.id}
      approved={approval.approved}
      title="操作审批"
      summary={value.question}
      context={[{ label: '类型', value: value.detail }]}
      onApprove={pending ? () => respondToApproval({ approved: true }) : undefined}
      onDeny={pending ? () => respondToApproval({ approved: false }) : undefined}
    />
  )
}

export function PollFormTool({ args, result, addResult }: ToolCallMessagePartProps) {
  const raw = args as Record<string, unknown>
  const closed = typeof raw.closedAt === 'string'
  const options = Array.isArray(raw.options) ? raw.options.map((option) => {
    const value = option as Record<string, unknown>
    if (typeof value.id !== 'string' || typeof value.label !== 'string') throw new Error('投票协议包含无效选项')
    return {
      value: value.id,
      label: value.label,
      description: typeof value.description === 'string' ? value.description : undefined,
      disabled: closed || value.disabled === true,
    }
  }) : []
  const [selection, setSelection] = useState<string | string[]>(raw.selectionMode === 'multi' ? [] : '')
  if (
    typeof raw.id !== 'string' || typeof raw.title !== 'string' || options.length === 0
    || (raw.selectionMode !== 'single' && raw.selectionMode !== 'multi')
  ) throw new Error('投票协议不完整')
  const submitted = typeof result === 'string' || (Array.isArray(result) && result.every((item) => typeof item === 'string'))
    ? result as string | string[]
    : undefined
  const value = submitted ?? selection
  return <PollCard
    title={raw.title}
    options={options}
    multiple={raw.selectionMode === 'multi'}
    value={Array.isArray(value) ? value : value ? [value] : []}
    submitted={submitted !== undefined}
    closed={closed}
    onChange={next => setSelection(raw.selectionMode === 'multi' ? next : next[0] ?? '')}
    onSubmit={() => addResult(selection)}
  />
}

export function CanvasArtifactTool({ args }: ToolCallMessagePartProps) {
  const value = args as { id?: unknown; href?: unknown; title?: unknown; description?: unknown; domain?: unknown }
  if (typeof value.id !== 'string' || typeof value.href !== 'string' || typeof value.title !== 'string') {
    throw new Error('协作画布协议不完整')
  }
  const match = /^lingxiloop:\/\/canvas\/([^/?#]+)$/.exec(value.href)
  if (!match) throw new Error('协作画布链接无效')
  return <CanvasArtifactCard canvasId={decodeURIComponent(match[1])} title={value.title}
    description={typeof value.description === 'string' ? value.description : undefined} />
}

interface ElicitationItem {
  name: string
  prompt: string
  description?: string
  required?: boolean
  multiple?: boolean
  choices?: Array<{ value: string; label: string; description?: string; disabled?: boolean }>
  input?: { label: string; placeholder?: string }
}

export function RecommendationTool({ args, result, addResult }: ToolCallMessagePartProps) {
  const value = args as { title: string; explanation: string; items: ElicitationItem[] }
  if (!value.title || !value.explanation || value.items?.[0]?.name !== 'next_step') throw new Error('学习建议协议不完整')
  return <RecommendationCard question={value.title} state={result ? 'accepted' : 'idle'} confidenceLabel="学习建议 · 尚未执行"
    acceptedLabel="已反馈你的选择" onAccept={() => addResult({ next_step: 'accept' })}
    onAlternatives={() => addResult({ next_step: 'alternatives' })}>{value.explanation} {value.items[0].prompt}</RecommendationCard>
}

export function ElicitationFormTool({ args, result, addResult }: ToolCallMessagePartProps) {
  const value = args as { id?: string; title?: string; items?: ElicitationItem[]; submitLabel?: string }
  const items = Array.isArray(value.items) ? value.items : []
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  if (items.length === 0) throw new Error('信息补充表单协议没有问题项')
  const submitted = result && typeof result === 'object' ? result as Record<string, string | string[]> : null
  const values = submitted ?? answers
  const missingRequired = items.some((item) => item.required && !values[item.name]?.length)
  const fields: ElicitationField[] = items.map((item) => ({
    name: item.name,
    label: [item.prompt, item.description].filter(Boolean).join(' · '),
    value: values[item.name] ?? (item.multiple ? [] : ''),
    kind: item.choices?.length ? 'choice' : 'text',
    options: item.choices?.map(({ value: choiceValue, label, disabled }) => ({ value: choiceValue, label, disabled })),
    inputLabel: item.input?.label,
    placeholder: item.input?.placeholder,
    required: item.required,
    multiple: item.multiple,
  }))
  return (
    <ElicitationForm
      server={value.title ?? '请补充信息'}
      message="请完成以下问题后提交。"
      fields={fields}
      state={submitted ? 'accepted' : 'request'}
      acceptLabel={value.submitLabel ?? '提交'}
      acceptDisabled={missingRequired}
      onFieldChange={(name: string, answer: ElicitationValue) => setAnswers((current) => ({
        ...current,
        [name]: Array.isArray(answer) ? [...answer] : answer as string,
      }))}
      onAccept={() => {
        if (!missingRequired) addResult(answers)
      }}
      data-assistant-ui-id={value.id}
    />
  )
}

export function AgentPlanTool({ args }: ToolCallMessagePartProps) {
  const names = useParticipants(state => state.byId)
  return <Plan {...missionPlan(args, names)} />
}

export function AgentHandoffTool({ args }: ToolCallMessagePartProps) {
  const names = useParticipants(state => state.byId)
  return <ProgressTracker {...handoffProgress(args, names)} />
}

export function CanvasProgressTool({ args }: ToolCallMessagePartProps) {
  const names = useParticipants(state => state.byId)
  return <ProgressTracker {...canvasProgress(args, names)} />
}

interface DraftEmailArgs {
  id: string
  subject: string
  from: string
  to: string[]
  cc: string[]
  body: string
  outcome?: 'sent' | 'cancelled'
}

function draftEmailSpec(email: DraftEmailArgs, outcome?: DraftEmailArgs['outcome']): UIElement {
  const row = (key: string, label: string, value: string): UIElement => ({
    $type: 'Row', $key: key, align: 'center', gap: 3,
    children: [
      { $type: 'Caption', $key: `${key}-label`, value: label },
      { $type: 'Text', $key: `${key}-value`, value, size: 'sm' },
    ],
  })
  return {
    $type: 'Card',
    title: outcome === 'sent' ? '邮件已发送' : outcome === 'cancelled' ? '邮件已取消' : '新邮件',
    ...(outcome ? {} : {
      confirm: { label: '发送邮件', $action: { type: 'email.send' } },
      cancel: { label: '取消', $action: { type: 'email.cancel' } },
    }),
    children: [
      row('from', '发件人', email.from),
      row('to', '收件人', email.to.join('、')),
      ...(email.cc.length ? [row('cc', '抄送', email.cc.join('、'))] : []),
      { $type: 'Divider', $key: 'divider' },
      { $type: 'Header', $key: 'subject', text: email.subject, size: 'sm' },
      { $type: 'Markdown', $key: 'body', value: email.body },
    ],
  }
}

export function DraftEmailTool({ args, result, addResult }: ToolCallMessagePartProps) {
  const email = args as DraftEmailArgs
  const resultStatus = typeof result === 'object' && result !== null ? (result as { status?: unknown }).status : undefined
  const outcome = resultStatus === 'sent' || email.outcome === 'sent'
    ? 'sent'
    : resultStatus === 'cancelled' || email.outcome === 'cancelled' ? 'cancelled' : undefined
  const content = renderGenerativeUI(draftEmailSpec(email, outcome), styledGenerativeUILibrary, {
    status: 'done',
    dispatch: ({ type }) => {
      if (type === 'email.send') addResult({ status: 'sent' })
      if (type === 'email.cancel') addResult({ status: 'cancelled' })
    },
  })
  return outcome
    ? <CardSurface data-aui-theme="elements" data-assistant-ui-id={email.id} className={`${conversationCardSize.wide} gap-0 p-3`}>{content}</CardSurface>
    : <div data-aui-theme="elements" data-assistant-ui-id={email.id} className={conversationCardSize.wide}>{content}</div>
}

export function TeacherBriefingStatsTool({ args }: ToolCallMessagePartProps) {
  const value = parseSerializableStatsDisplay(args)
  return <StatsDisplay {...value} locale="zh-CN" className={`${conversationCardSize.wide} min-w-0`} />
}

export function ScoreBreakdownTool({ result, isError }: ToolCallMessagePartProps) {
  const response = result as { status?: string; value?: { status: 'ACCEPTED' | 'PENDING' | 'REJECTED'; display?: { demonstratedLevel: number; rubricResults: ScoreCriterion[] } } } | undefined
  const value = response?.value?.display
  if (!value) return <p role="status">{response?.status === 'cancelled' ? '评价已取消。' : isError ? '评价失败，请查看任务状态。' : result ? '评价数据暂不可用。' : '正在评价…'}</p>
  const verdict = result === undefined
    ? '评估中'
    : isError
      ? '评估失败'
      : response!.value!.status === 'ACCEPTED' ? '已判定' : response!.value!.status === 'REJECTED' ? '已退回' : '待教师复核'
  return <ScoreBreakdown
    verdict={verdict}
    total={value.demonstratedLevel}
    outOf={4}
    criteria={value.rubricResults}
    visibleCount={value.rubricResults.length}
  />
}

const calendarDate = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })
const calendarDay = new Intl.DateTimeFormat('zh-CN', { day: 'numeric' })
const calendarMonth = new Intl.DateTimeFormat('zh-CN', { month: 'short' })
const calendarWeekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'short' })
const calendarTime = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })

function validDate(value: string): Date {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('日历协议包含无效时间')
  return date
}

function eventTime(event: Pick<CalendarEvent, 'allDay' | 'startAt' | 'endAt'>): string {
  if (event.allDay) return '全天'
  const start = calendarTime.format(validDate(event.startAt))
  return event.endAt ? `${start} 至 ${calendarTime.format(validDate(event.endAt))}` : start
}

function viewEventSpec(event: CalendarEvent): UIElement {
  return {
    $type: 'Card',
    $key: event.id,
    padding: 3,
    children: [
      { $type: 'Caption', $key: 'date', value: calendarDate.format(validDate(event.startAt)) },
      { $type: 'Header', $key: 'title', text: event.title, size: 'md' },
      { $type: 'Caption', $key: 'time', value: eventTime(event) },
    ],
  }
}

function createEventSpec(
  event: { title: string; at: string; endAt?: string; allDay?: boolean; kind?: 'personal' | 'agent_task' },
  decision?: boolean,
): UIElement {
  const start = validDate(event.at)
  const time = event.allDay
    ? '全天'
    : event.endAt
      ? `${calendarTime.format(start)} 至 ${calendarTime.format(validDate(event.endAt))}`
      : calendarTime.format(start)
  return {
    $type: 'Card',
    padding: 3,
    ...(decision === undefined ? {
      confirm: { label: '加入安排', $action: { type: 'calendar.confirm' } },
      cancel: { label: '取消', $action: { type: 'calendar.cancel' } },
    } : {}),
    children: [
      {
        $type: 'Row', $key: 'date-header', gap: 3, align: 'center',
        children: [
          { $type: 'Text', $key: 'day', value: calendarDay.format(start), size: '3xl', weight: 'bold' },
          {
            $type: 'Col', $key: 'date-meta', gap: 0,
            children: [
              { $type: 'Text', $key: 'month', value: calendarMonth.format(start), weight: 'semibold' },
              { $type: 'Caption', $key: 'weekday', value: calendarWeekday.format(start) },
            ],
          },
        ],
      },
      { $type: 'Divider', $key: 'divider' },
      {
        $type: 'Col', $key: 'events', gap: 3,
        children: [{
          $type: 'Row', $key: 'event-1', gap: 3, align: 'center',
          children: [
            {
              $type: 'Box', $key: 'accent', width: 3, height: 32, radius: 'full',
              background: 'color-mix(in oklab, var(--foreground) 80%, transparent)',
            },
            {
              $type: 'Col', $key: 'info', gap: 0,
              children: [
                { $type: 'Text', $key: 'title', value: event.title, weight: 'medium' },
                { $type: 'Caption', $key: 'time', value: time },
              ],
            },
            { $type: 'Spacer', $key: 'spacer' },
            {
              $type: 'Badge', $key: 'tag', variant: 'info',
              value: decision === undefined
                ? event.kind === 'agent_task' ? '智能体任务' : '个人安排'
                : decision ? '已确认' : '已取消',
            },
          ],
        }],
      },
    ],
  }
}

export function CreateCalendarEventTool({ args, approval, respondToApproval }: ToolCallMessagePartProps) {
  if (!approval) return null
  const input = args as { title: string; startAt: string; endAt?: string; allDay?: boolean; kind?: 'personal' | 'agent_task' }
  const event = { ...input, at: input.startAt }
  if (!event.title || !event.at) throw new Error('创建日程协议缺少标题或时间')
  return <div data-aui-theme="elements" className={conversationCardSize.standard}>
    {renderGenerativeUI(createEventSpec(event, approval.approved), styledGenerativeUILibrary, {
      status: 'done',
      dispatch: ({ type }) => {
        if (type === 'calendar.confirm') respondToApproval({ approved: true })
        if (type === 'calendar.cancel') respondToApproval({ approved: false })
      },
    })}
  </div>
}

export function ViewCalendarEventTool({ result, isError }: ToolCallMessagePartProps) {
  if (result === undefined || isError) return <p role="status">{isError ? '日历读取失败，请查看任务状态。' : '正在读取日历…'}</p>
  const response = result as { status: string; value?: CalendarEvent | { events: CalendarEvent[]; truncated: boolean } }
  if (response.status !== 'completed' || !response.value) return <p role="status">{response.status === 'cancelled' ? '日历读取已取消。' : '日历数据暂不可用。'}</p>
  const events = 'events' in response.value ? response.value.events : [response.value]
  const spec: UISpec = events.length > 0
    ? { $type: 'Col', gap: 4, children: events.map(viewEventSpec) }
    : { $type: 'Caption', value: '暂无安排' }
  return <CardSurface data-aui-theme="elements" className={`${conversationCardSize.standard} gap-0 p-3`}>
    {renderGenerativeUI(spec, styledGenerativeUILibrary, { status: 'done' })}
  </CardSurface>
}

export function CalendarEventCard({ args }: ToolCallMessagePartProps) {
  const event = args.event as CalendarEvent
  if (!event?.id || !event.title || !event.startAt) throw new Error('日历卡片缺少授权记录')
  return <CardSurface className={conversationCardSize.standard}>{renderGenerativeUI(viewEventSpec(event), styledGenerativeUILibrary, { status: 'done' })}</CardSurface>
}

export function PresentationArtifactTool({ args }: ToolCallMessagePartProps) {
  const openPresentation = useSurface((state) => state.openPresentationPeek)
  const artifact = parsePresentationArtifact(args)
  if (!artifact) throw new Error('演示文稿产物协议不完整')
  return <PresentationArtifactCard artifact={artifact} onOpen={openPresentation} />
}

export const CHAT_TOOL_RENDERERS = {
  by_name: {
    'approval-card': ApprovalCardTool,
    'poll-form': PollFormTool,
    'agent-handoff': AgentHandoffTool,
    'agent-plan': AgentPlanTool,
    'canvas-artifact': CanvasArtifactTool,
    'canvas-progress': CanvasProgressTool,
    'elicitation-form': ElicitationFormTool,
    'recommendation-card': RecommendationTool,
    showStats: TeacherBriefingStatsTool,
    'learning-stats': TeacherBriefingStatsTool,
    'calendar-event': CalendarEventCard,
    'learning.propose_evaluation': ScoreBreakdownTool,
    'calendar.create': CreateCalendarEventTool,
    'calendar.list': ViewCalendarEventTool,
    'calendar.get': ViewCalendarEventTool,
    'draft-email': DraftEmailTool,
    'presentation-artifact': PresentationArtifactTool,
    ipython: () => null,
    cite_claims: () => null,
    read_document: () => null,
  },
  Fallback: () => null,
}

export function isVisibleChatPart(part: ThreadMessage['content'][number]): boolean {
  if (part.type === 'text') return Boolean(part.text.trim())
  if (part.type === 'source') return true
  if (part.type !== 'tool-call' || !(part.toolName in CHAT_TOOL_RENDERERS.by_name)) return false
  if (['ipython', 'cite_claims', 'read_document'].includes(part.toolName)) return false
  if (['approval-card', 'calendar.create'].includes(part.toolName)) return Boolean(part.approval)
  if (['calendar.list', 'calendar.get'].includes(part.toolName)) return true
  return true
}
