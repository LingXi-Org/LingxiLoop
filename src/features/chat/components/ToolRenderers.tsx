import { type ToolCallMessagePart, type ToolCallMessagePartProps, useAuiState } from '@assistant-ui/react'
import { WrenchIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ApprovalCard } from '@/components/assistant-ui/elements/approval-card'
import { DocumentReference } from '@/components/assistant-ui/elements/document-reference'
import { readClaims } from '@/components/assistant-ui/markdown-text'
import { ToolCall } from '@/components/tool-call'
import { ToolFallback } from '@/components/tool-fallback.aui'
import { ToolTimeline } from '@/components/tool-timeline'
import { LinkPreview } from '@/components/tool-ui/link-preview'
import { safeParseSerializableLinkPreview } from '@/components/tool-ui/link-preview/schema'
import { MessageDraft } from '@/components/tool-ui/message-draft'
import { safeParseSerializableMessageDraft } from '@/components/tool-ui/message-draft/schema'
import { OptionList } from '@/components/tool-ui/option-list'
import { type OptionListSelection, safeParseSerializableOptionList } from '@/components/tool-ui/option-list/schema'
import { Plan } from '@/components/tool-ui/plan'
import { safeParseSerializablePlan } from '@/components/tool-ui/plan/schema'
import { ProgressTracker } from '@/components/tool-ui/progress-tracker'
import { safeParseSerializableProgressTracker } from '@/components/tool-ui/progress-tracker/schema'
import { StatsDisplay } from '@/components/tool-ui/stats-display'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  PresentationArtifactCard,
  parsePresentationArtifact,
} from '@/features/presentations'
import { useSurface } from '@/stores/surface'

export function ApprovalCardTool({ args, approval, respondToApproval }: ToolCallMessagePartProps) {
  const value = args as { id: string; title: string; description?: string }
  const state = approval?.approved === false ? 'denied' : approval?.approved === true ? 'done' : 'request'
  return (
    <ApprovalCard
      data-tool-ui-id={value.id}
      state={state}
      title={value.title}
      subtitle={value.description || '此操作需要你的确认'}
      command={value.description || value.title}
      onAllowOnce={state === 'request' ? () => respondToApproval({ approved: true }) : undefined}
      onDeny={state === 'request' ? () => respondToApproval({ approved: false }) : undefined}
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

function toolChip(toolName: string, args: Record<string, unknown>): string {
  const value = Object.values(args).find((item) => typeof item === 'string' || typeof item === 'number')
  return value === undefined ? toolName : String(value).slice(0, 80)
}

export function NativeToolCall({ args, argsText, result, status, toolName }: ToolCallMessagePartProps) {
  const [open, setOpen] = useState(false)
  const running = status.type === 'running'
  return (
    <ToolCall
      label={`已调用 ${toolName}`}
      activeLabel={`正在调用 ${toolName}`}
      query={toolChip(toolName, args as Record<string, unknown>)}
      request={argsText}
      result={result === undefined ? '' : JSON.stringify(result, null, 2)}
      running={running}
      open={open}
      onOpenChange={setOpen}
      className="max-w-none"
    />
  )
}

export function HostToolTimeline() {
  const [open, setOpen] = useState(false)
  const content = useAuiState((state) => state.message.content)
  const calls = useMemo(() => content.filter((part): part is ToolCallMessagePart => (
    part.type === 'tool-call' && part.toolCallId.startsWith('host:')
  )), [content])
  const streaming = calls.some((part) => part.result === undefined)
  if (calls.length === 0) return null
  const steps = calls.map((part) => ({
    verb: part.result === undefined ? '调用' : '已调用',
    chip: toolChip(part.toolName, part.args as Record<string, unknown>),
    icon: WrenchIcon,
  }))
  return <ToolTimeline
    steps={steps}
    visibleSteps={steps.length}
    streaming={streaming}
    open={open}
    onOpenChange={setOpen}
    restingLabel={`${steps.length} 个工具步骤`}
    activeLabel="正在工作"
    stats={[]}
    className="max-w-none"
  />
}

export function CiteClaimsTool({ result, toolCallId }: ToolCallMessagePartProps) {
  const claims = useMemo(() => readClaims(result), [result])
  const [activePages, setActivePages] = useState<Record<string, number>>({})
  const documents = useMemo(() => {
    const grouped = new Map<string, typeof claims>()
    for (const claim of claims) grouped.set(claim.sourceId, [...(grouped.get(claim.sourceId) ?? []), claim])
    return [...grouped.entries()]
  }, [claims])
  const messageId = toolCallId.startsWith('cite-claims:') ? toolCallId.slice('cite-claims:'.length) : toolCallId

  return <div data-slot="document-references" className="grid w-full max-w-2xl gap-2 sm:grid-cols-2">
    {documents.map(([sourceId, sourceClaims]) => {
      // ponytail: positions are ordered evidence anchors; use real page numbers when the source protocol exposes them.
      const anchors = sourceClaims.map((claim) => ({ page: claim.position + 1, quote: claim.excerpt }))
      const firstPage = anchors[0]?.page ?? 1
      return <DocumentReference
        key={sourceId}
        id={`cite-ref-${messageId}-${sourceId}`}
        title={sourceClaims[0]?.sourceTitle ?? '参考文献'}
        pages={Math.max(firstPage, ...anchors.map((anchor) => anchor.page))}
        anchors={anchors}
        activePage={activePages[sourceId] ?? firstPage}
        onJump={(page) => setActivePages((current) => ({ ...current, [sourceId]: page }))}
        className="max-w-none"
      />
    })}
  </div>
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
  multiple?: boolean
  choices?: Array<{ value: string; label: string; description?: string; disabled?: boolean }>
  input?: { label: string; placeholder?: string }
}

export function QuestionFlowTool({ args, result, addResult }: ToolCallMessagePartProps) {
  const value = args as { id?: string; title?: string; items?: QuestionFlowItem[]; submitLabel?: string }
  const items = Array.isArray(value.items) ? value.items : []
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  if (items.length === 0) return <ToolFallback {...({ args, result, toolName: 'question-flow' } as ToolCallMessagePartProps)} />
  const submitted = result && typeof result === 'object' ? result as Record<string, string | string[]> : null
  const missingRequired = items.some((item) => item.required && !answers[item.name]?.length)
  return (
    <Card className="my-2 w-full max-w-xl rounded-2xl p-4" data-tool-ui-id={value.id}>
      <div className="text-sm font-semibold text-foreground">{value.title ?? '请补充信息'}</div>
      <div className="mt-3 grid gap-3">
        {items.map((item) => {
          const answer = submitted?.[item.name] ?? answers[item.name]
          return (
            <div key={item.name} className="grid gap-1.5 text-xs text-muted-foreground">
              <span>{item.prompt}{item.required ? ' *' : ''}</span>
              {item.description && <span>{item.description}</span>}
              {item.choices?.length ? (
                <OptionList
                  id={`${value.id ?? 'question-flow'}-${item.name}`}
                  role="decision"
                  options={item.choices.map((choice) => ({ id: choice.value, ...choice }))}
                  selectionMode={item.multiple ? 'multi' : 'single'}
                  value={submitted ? undefined : answer ?? null}
                  choice={submitted ? answer ?? null : undefined}
                  onChange={(selection) => setAnswers((current) => ({ ...current, [item.name]: selection ?? '' }))}
                />
              ) : null}
              {item.input && (
                <Input
                  aria-label={item.input.label}
                  placeholder={item.input.placeholder}
                  value={typeof answer === 'string' ? answer : ''}
                  disabled={Boolean(submitted)}
                  onChange={(event) => setAnswers((current) => ({ ...current, [item.name]: event.target.value }))}
                />
              )}
            </div>
          )
        })}
      </div>
      {!submitted && (
        <Button className="mt-3" size="sm" disabled={missingRequired} onClick={() => addResult(answers)}>
          {value.submitLabel ?? '提交'}
        </Button>
      )}
    </Card>
  )
}

export function StatsDisplayTool({ args }: ToolCallMessagePartProps) {
  const value = args as { id: string; title?: string; statistics: Record<string, number> }
  return <StatsDisplay
    id={value.id}
    title={value.title ?? '数据概览'}
    stats={Object.entries(value.statistics).map(([key, amount]) => ({ key, label: key, value: amount }))}
    locale="zh-CN"
    className="max-w-none"
  />
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
    ipython: () => null,
    cite_claims: CiteClaimsTool,
  },
  Fallback: NativeToolCall,
}
