import { RecommendationCard } from '@/components/assistant-ui/elements/recommendation-card'
import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import { useState } from 'react'
import { ProgressTracker } from '@/components/tool-ui/progress-tracker'
import { artifactProgress } from '../runtime/task-progress'
import { PollCard } from '@/components/assistant-ui/elements/poll-card'
import {
  type ElicitationField,
  ElicitationForm,
  type ElicitationValue,
} from '@/components/assistant-ui/elements/elicitation-form'
import { ApprovalCard } from '@/components/assistant-ui/elements/approval-card'
import { useParticipants } from '@/features/agents/state'
import { HomeworkDraftTool } from '@/features/learning/homework/HomeworkDraftCard'

interface CardProps {
  args: Record<string, unknown>
  result?: unknown
  addResult: (value: unknown) => unknown | Promise<unknown>
}

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

export function PollFormTool({ args, result, addResult }: CardProps) {
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

interface ElicitationItem {
  name: string
  prompt: string
  description?: string
  required?: boolean
  multiple?: boolean
  choices?: Array<{ value: string; label: string; description?: string; disabled?: boolean }>
  input?: { label: string; placeholder?: string }
}

export function RecommendationTool({ args, result, addResult }: CardProps) {
  const value = args as { title: string; explanation: string; items: ElicitationItem[] }
  if (!value.title || !value.explanation || value.items?.[0]?.name !== 'next_step') throw new Error('学习建议协议不完整')
  return <RecommendationCard question={value.title} state={result ? 'accepted' : 'idle'} confidenceLabel="学习建议 · 尚未执行"
    acceptedLabel="已反馈你的选择" onAccept={() => addResult({ next_step: 'accept' })}
    onAlternatives={() => addResult({ next_step: 'alternatives' })}>{value.explanation} {value.items[0].prompt}</RecommendationCard>
}

export function ElicitationFormTool({ args, result, addResult, initialAnswers = {}, onAnswersChange }: CardProps & {
  initialAnswers?: Record<string, string | string[]>
  onAnswersChange?: (answers: Record<string, string | string[]>) => void
}) {
  const value = args as { id?: string; title?: string; items?: ElicitationItem[]; submitLabel?: string; acceptedLabel?: string }
  const items = Array.isArray(value.items) ? value.items : []
  const [answers, setAnswers] = useState<Record<string, string | string[]>>(initialAnswers)
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
      acceptedLabel={value.acceptedLabel}
      acceptDisabled={missingRequired}
      onFieldChange={(name: string, answer: ElicitationValue) => {
        const next = { ...answers, [name]: Array.isArray(answer) ? [...answer] : answer as string }
        setAnswers(next)
        onAnswersChange?.(next)
      }}
      onAccept={() => {
        if (!missingRequired) addResult(answers)
      }}
      data-assistant-ui-id={value.id}
    />
  )
}

export function ArtifactProgressTool({ args }: Pick<CardProps, 'args'>) {
  const names = useParticipants(state => state.byId)
  return <ProgressTracker {...artifactProgress(args, names)} />
}

export const TOOL_DETAILS = { 'teacher.draft_homework': HomeworkDraftTool }
