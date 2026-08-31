import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import { useState } from 'react'
import { ToolFallback } from '@/components/tool-fallback.aui'
import { ApprovalCard } from '@/components/tool-ui/approval-card'
import { safeParseSerializableApprovalCard } from '@/components/tool-ui/approval-card/schema'
import { LinkPreview } from '@/components/tool-ui/link-preview'
import { safeParseSerializableLinkPreview } from '@/components/tool-ui/link-preview/schema'
import { MessageDraft } from '@/components/tool-ui/message-draft'
import { safeParseSerializableMessageDraft } from '@/components/tool-ui/message-draft/schema'
import { OptionList } from '@/components/tool-ui/option-list'
import { safeParseSerializableOptionList, type OptionListSelection } from '@/components/tool-ui/option-list/schema'
import { Plan } from '@/components/tool-ui/plan'
import { safeParseSerializablePlan } from '@/components/tool-ui/plan/schema'
import { ProgressTracker } from '@/components/tool-ui/progress-tracker'
import { safeParseSerializableProgressTracker } from '@/components/tool-ui/progress-tracker/schema'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  parsePresentationArtifact,
  PresentationArtifactCard,
} from '@/features/presentations'
import { useSurface } from '@/stores/surface'

export function ApprovalCardTool({ args, result, addResult }: ToolCallMessagePartProps) {
  const parsed = safeParseSerializableApprovalCard(args)
  if (!parsed) return <ToolFallback {...({ args, result, toolName: 'approval-card' } as ToolCallMessagePartProps)} />
  const receipt = typeof result === 'object' && result !== null
    ? (result as { decision?: 'approved' | 'denied' }).decision
    : undefined
  return (
    <ApprovalCard
      {...parsed}
      choice={receipt ?? parsed.choice}
      onConfirm={() => addResult({ decision: 'approved' })}
      onCancel={() => addResult({ decision: 'denied' })}
    />
  )
}

export function OptionListTool({ args, result, addResult }: ToolCallMessagePartProps) {
  const raw = args as Record<string, unknown>
  const closed = typeof raw.closedAt === 'string'
  const parsed = safeParseSerializableOptionList({
    id: raw.id,
    role: raw.role,
    options: Array.isArray(raw.options) && closed
      ? raw.options.map((option) => ({ ...(option as Record<string, unknown>), disabled: true }))
      : raw.options,
    selectionMode: raw.selectionMode,
    defaultValue: raw.defaultValue,
    choice: raw.choice,
    minSelections: raw.minSelections,
    maxSelections: raw.maxSelections,
  })
  const [selection, setSelection] = useState<OptionListSelection>(null)
  if (!parsed) return <ToolFallback {...({ args, result, toolName: 'option-list' } as ToolCallMessagePartProps)} />
  const choice = typeof result === 'string' || Array.isArray(result)
    ? result as OptionListSelection
    : undefined
  return (
    <div className="my-2 w-full max-w-xl">
      {typeof raw.title === 'string' && <div className="mb-2 text-sm font-semibold text-foreground">{raw.title}</div>}
      <OptionList
        {...parsed}
        value={choice === undefined ? selection : undefined}
        choice={choice}
        onChange={setSelection}
        actions={!closed && choice === undefined ? [{ id: 'confirm', label: '提交' }] : undefined}
        onAction={(_, value) => addResult(value)}
      />
      {closed && <div className="mt-2 text-xs text-muted-foreground">投票已结束</div>}
    </div>
  )
}

export function PlanTool({ args, result, toolName, ...props }: ToolCallMessagePartProps) {
  const parsed = safeParseSerializablePlan(args)
  return parsed ? <Plan {...parsed} /> : <ToolFallback {...props} args={args} result={result} toolName={toolName} />
}

export function ProgressTrackerTool({ args, result, toolName, ...props }: ToolCallMessagePartProps) {
  const parsed = safeParseSerializableProgressTracker(args)
  return parsed ? <ProgressTracker {...parsed} /> : <ToolFallback {...props} args={args} result={result} toolName={toolName} />
}

export function LinkPreviewTool({ args, result, toolName, ...props }: ToolCallMessagePartProps) {
  const parsed = safeParseSerializableLinkPreview(args)
  return parsed ? <LinkPreview {...parsed} /> : <ToolFallback {...props} args={args} result={result} toolName={toolName} />
}

export function MessageDraftTool({ args, result, addResult }: ToolCallMessagePartProps) {
  const parsed = safeParseSerializableMessageDraft({
    ...(args as Record<string, unknown>),
    ...(typeof result === 'object' && result !== null && (result as { status?: unknown }).status === 'sent'
      ? { outcome: 'sent' }
      : {}),
  })
  if (!parsed) return <ToolFallback {...({ args, result, toolName: 'message-draft' } as ToolCallMessagePartProps)} />
  return (
    <MessageDraft
      {...parsed}
      onSend={() => addResult({ status: 'sent' })}
      onCancel={() => addResult({ status: 'cancelled' })}
    />
  )
}

interface QuestionFlowItem {
  name: string
  prompt: string
  description?: string
  required?: boolean
}

export function QuestionFlowTool({ args, result, addResult }: ToolCallMessagePartProps) {
  const value = args as { id?: string; title?: string; items?: QuestionFlowItem[]; submitLabel?: string }
  const items = Array.isArray(value.items) ? value.items : []
  const [answers, setAnswers] = useState<Record<string, string>>({})
  if (items.length === 0) return <ToolFallback {...({ args, result, toolName: 'question-flow' } as ToolCallMessagePartProps)} />
  const submitted = result && typeof result === 'object' ? result as Record<string, string> : null
  return (
    <Card className="my-2 w-full max-w-xl rounded-2xl p-4" data-tool-ui-id={value.id}>
      <div className="text-sm font-semibold text-foreground">{value.title ?? '请补充信息'}</div>
      <div className="mt-3 grid gap-3">
        {items.map((item) => (
          <label key={item.name} className="grid gap-1.5 text-xs text-muted-foreground">
            <span>{item.prompt}{item.required ? ' *' : ''}</span>
            <Input
              value={submitted?.[item.name] ?? answers[item.name] ?? ''}
              disabled={Boolean(submitted)}
              onChange={(event) => setAnswers((current) => ({ ...current, [item.name]: event.target.value }))}
            />
          </label>
        ))}
      </div>
      {!submitted && (
        <Button className="mt-3" size="sm" onClick={() => addResult(answers)}>
          {value.submitLabel ?? '提交'}
        </Button>
      )}
    </Card>
  )
}

export function StatsDisplayTool({ args }: ToolCallMessagePartProps) {
  const value = args as { id?: string; title?: string; statistics?: Record<string, unknown> }
  const entries = Object.entries(value.statistics ?? {})
  return (
    <Card className="my-2 w-full max-w-xl rounded-2xl p-4" data-tool-ui-id={value.id}>
      <div className="text-sm font-semibold text-foreground">{value.title ?? '数据概览'}</div>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {entries.map(([label, amount]) => (
          <div key={label} className="rounded-xl bg-muted px-3 py-2">
            <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{String(amount)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

export function PresentationArtifactTool({ args, result }: ToolCallMessagePartProps) {
  const openPresentation = useSurface((state) => state.openPresentationPeek)
  const artifact = parsePresentationArtifact(args)
  if (!artifact) {
    return <ToolFallback {...({ args, result, toolName: 'presentation-artifact' } as ToolCallMessagePartProps)} />
  }
  return <PresentationArtifactCard artifact={artifact} onOpen={openPresentation} />
}

export const CHAT_TOOL_RENDERERS = {
  by_name: {
    'approval-card': ApprovalCardTool,
    'option-list': OptionListTool,
    plan: PlanTool,
    'progress-tracker': ProgressTrackerTool,
    'link-preview': LinkPreviewTool,
    'question-flow': QuestionFlowTool,
    'stats-display': StatsDisplayTool,
    'message-draft': MessageDraftTool,
    'presentation-artifact': PresentationArtifactTool,
  },
  Fallback: ToolFallback,
}
