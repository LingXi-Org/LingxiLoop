import { MessagePrimitive, useAuiState, type ReasoningMessagePartProps } from '@assistant-ui/react'
import { useMemo, useState } from 'react'
import { MarkdownText } from '@/components/assistant-ui/markdown-text'
import { ReasoningPanel } from '@/components/assistant-ui/elements/reasoning-panel'
import { ApprovalCard } from '@/components/tool-ui/approval-card'
import { Audio } from '@/components/tool-ui/audio'
import { CitationList } from '@/components/tool-ui/citation'
import { Image as ToolUIImage } from '@/components/tool-ui/image'
import { MessageDraft } from '@/components/tool-ui/message-draft'
import { Plan } from '@/components/tool-ui/plan'
import { ProgressTracker } from '@/components/tool-ui/progress-tracker'
import { Video } from '@/components/tool-ui/video'
import type { LingxiImMessageCustom } from '@/im/assistantMessage'
import { useKnowledgeSources } from '@/stores/knowledgeSources'
import type { ApprovalPayload, KnowledgeCitation, Message } from '@/types'
import { PollBubble } from '../PollBubble'
import { LinkPreview } from '../LinkPreview'
import { ImBubble } from './ImBubble'
import { AttachmentCard, CanvasWorkspaceCard, EmailCard, MessageArtifactParts } from './MessageBusinessParts'

interface LingxiMessagePartsProps {
  openMaus?: boolean
}

function NativeTextPart({ openMaus }: { openMaus: boolean }) {
  const custom = useAuiState((state) => state.message.metadata.custom) as unknown as LingxiImMessageCustom
  const message = custom.message
  const content = message.streaming === 'placeholder'
    ? (
        <span className="thinking-card py-0.5" aria-label={`${custom.senderName} 正在思考`} role="status">
          <span className="thinking-card-dots" aria-hidden><i /><i /><i /></span>
          <span>思考中</span>
        </span>
      )
    : (
        <div data-find-content className={message.streaming === 'markdown' ? 'streaming-markdown' : undefined}>
          <MarkdownText />
        </div>
      )

  return (
    <ImBubble
      isMine={custom.isMine}
      openMaus={openMaus}
      continuedFromPrevious={custom.continuedFromPrevious}
      continuedToNext={custom.continuedToNext}
    >
      {content}
    </ImBubble>
  )
}

function NativeReasoningPart({ part }: { part: ReasoningMessagePartProps }) {
  const custom = useAuiState((state) => state.message.metadata.custom) as unknown as LingxiImMessageCustom
  const streaming = custom.message.streaming === 'markdown'
  const [open, setOpen] = useState(streaming)
  return (
    <ReasoningPanel
      steps={[{ title: 'Reasoning', body: part.text }]}
      visibleSteps={1}
      streaming={streaming}
      open={streaming || open}
      onOpenChange={setOpen}
      restingLabel="Reasoned"
      className="mt-1 max-w-[620px]"
    />
  )
}

function progressStatus(status?: string): 'pending' | 'in-progress' | 'completed' | 'failed' {
  const value = status?.toLowerCase() ?? ''
  if (/fail|error|blocked|reject/.test(value)) return 'failed'
  if (/done|complete|success|sent|approved|accept/.test(value)) return 'completed'
  if (/run|work|progress|execut|stream/.test(value)) return 'in-progress'
  return 'pending'
}

function approvalTitle(approval: ApprovalPayload): string {
  const labels: Record<ApprovalPayload['kind'], string> = {
    external_communication: '确认外部沟通',
    sensitive_or_destructive_action: '确认敏感操作',
    financial_or_irreversible_action: '确认不可逆操作',
    course_management: '确认课程管理操作',
    learning_evaluation: '确认学习评估',
  }
  return labels[approval.kind]
}

function ApprovalPart({
  message,
  addResult,
}: {
  message: Message
  addResult: (result: { decision: 'approved' | 'denied' }) => void
}) {
  const approval = message.approval
  const [busy, setBusy] = useState<'approved' | 'denied' | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!approval) throw new Error('Approval message is missing its native approval payload')
  const pending = approval.status === 'pending'
  const choice = pending ? undefined : approval.status === 'approved' ? 'approved' : 'denied'
  const resolve = async (decision: 'approved' | 'denied') => {
    if (!pending || busy) return
    setBusy(decision)
    setError(null)
    try {
      await Promise.resolve(addResult({ decision }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setBusy(null)
    }
  }
  return (
    <div className="mt-2 max-w-[620px]">
      <ApprovalCard
        id={`approval-card-${approval.id}`}
        role="decision"
        title={approvalTitle(approval)}
        description={approval.summary}
        variant={approval.kind.includes('destructive') || approval.kind.includes('irreversible') ? 'destructive' : 'default'}
        metadata={[
          { key: '状态', value: approval.status },
          { key: '请求时间', value: new Date(approval.requestedAt).toLocaleString() },
        ]}
        confirmLabel={busy === 'approved' ? '处理中…' : '批准'}
        cancelLabel={busy === 'denied' ? '处理中…' : '拒绝'}
        choice={choice}
        onConfirm={() => resolve('approved')}
        onCancel={() => resolve('denied')}
      />
      {(error || approval.error) && <p role="alert" className="mt-1 text-[11px] text-coral-deep">{error ?? approval.error}</p>}
    </div>
  )
}

function ToolActivityPart({ message }: { message: Message }) {
  const tool = message.tool
  if (!tool) throw new Error('Tool message is missing its native tool payload')
  const status = progressStatus(tool.status)
  return (
    <ProgressTracker
      id={`progress-tool-${message.id}`}
      role="state"
      className="mt-2 max-w-[580px]"
      steps={[{
        id: `tool-step-${message.id}`,
        label: tool.name,
        description: [tool.arg, tool.detail].filter(Boolean).join('\n'),
        status,
      }]}
      choice={status === 'completed'
        ? { outcome: 'success', summary: tool.status, at: message.createdAt ?? new Date().toISOString() }
        : status === 'failed'
          ? { outcome: 'failed', summary: tool.status, at: message.createdAt ?? new Date().toISOString() }
          : undefined}
    />
  )
}

function HandoffPart({ message }: { message: Message }) {
  const handoff = message.handoff
  if (!handoff) throw new Error('Handoff message is missing its native handoff payload')
  const status = progressStatus(handoff.status)
  return (
    <ProgressTracker
      id={`progress-handoff-${handoff.id}`}
      role="state"
      className="mt-2 max-w-[580px]"
      steps={[
        { id: `${handoff.id}-prepared`, label: handoff.title, description: handoff.note ?? undefined, status: 'completed' },
        {
          id: `${handoff.id}-transfer`,
          label: `${handoff.fromAgentId} → ${handoff.toAgentId}`,
          description: [...handoff.sharedPaths, ...handoff.browserTargets].join('\n') || undefined,
          status,
        },
      ]}
      choice={status === 'completed'
        ? { outcome: 'success', summary: '交接已完成', at: message.createdAt ?? new Date().toISOString() }
        : status === 'failed'
          ? { outcome: 'failed', summary: '交接受阻', at: message.createdAt ?? new Date().toISOString() }
          : undefined}
    />
  )
}

function LearningMissionPart({ message }: { message: Message }) {
  const mission = message.learningMission
  if (!mission) throw new Error('Learning mission message is missing its native payload')
  const status = mission.status === 'completed'
    ? 'completed'
    : mission.status === 'cancelled'
      ? 'cancelled'
      : 'in_progress'
  return (
    <Plan
      id={`plan-learning-${mission.missionId}`}
      role="composite"
      className="mt-2 max-w-[620px]"
      title={mission.goal}
      description="学习任务"
      todos={[{
        id: `${mission.missionId}-success`,
        label: mission.successCriteria,
        description: `课程 ${mission.courseId}`,
        status,
      }]}
      receipt={status === 'completed'
        ? { outcome: 'success', summary: '学习任务已完成', at: message.createdAt ?? new Date().toISOString() }
        : undefined}
    />
  )
}

function CitationPart({ message }: { message: Message }) {
  const openCitation = useKnowledgeSources((state) => state.openCitation)
  const sourceByToolId = useMemo(() => new Map(
    (message.citations ?? []).map((citation) => [`citation-${message.id}-${citation.chunkId}`, citation]),
  ), [message.citations, message.id])
  const citations = (message.citations ?? []).map((citation) => ({
    id: `citation-${message.id}-${citation.chunkId}`,
    role: 'information' as const,
    href: citation.sourceUrl && /^https?:\/\//i.test(citation.sourceUrl)
      ? citation.sourceUrl
      : `https://lingxiloop.local/knowledge/${encodeURIComponent(citation.sourceId)}#${encodeURIComponent(citation.chunkId)}`,
    title: `[${citation.marker}] ${citation.sourceTitle}`,
    snippet: citation.excerpt,
    domain: citation.sourceUrl ? new URL(citation.sourceUrl, window.location.origin).hostname : 'Lingxi Knowledge',
    type: 'document' as const,
  }))
  if (!citations.length) return null
  return (
    <CitationList
      id={`citation-list-${message.id}`}
      citations={citations}
      variant="inline"
      maxVisible={5}
      className="mt-2 max-w-[620px]"
      onNavigate={(_href, item) => {
        const source = sourceByToolId.get(item.id)
        if (source) void openCitation(source as KnowledgeCitation)
      }}
    />
  )
}

function MediaPart({ message }: { message: Message }) {
  const attachment = message.attachment
  if (!attachment) throw new Error('Attachment message is missing its native attachment payload')
  const mime = attachment.mime ?? ''
  if (attachment.kind === 'img' || mime.startsWith('image/')) {
    return (
      <ToolUIImage
        id={`image-${message.id}`}
        role="information"
        assetId={message.id}
        src={attachment.url}
        alt={attachment.name || '聊天图片'}
        title={attachment.name}
        fileSizeBytes={attachment.size && attachment.size > 0 ? attachment.size : undefined}
        fit="contain"
        className="mt-2 max-w-[580px]"
      />
    )
  }
  if (mime.startsWith('audio/')) {
    return <Audio id={`audio-${message.id}`} role="control" assetId={message.id} src={attachment.url} title={attachment.name} variant="compact" className="mt-2 max-w-[580px]" />
  }
  if (mime.startsWith('video/')) {
    return <Video id={`video-${message.id}`} role="control" assetId={message.id} src={attachment.url} title={attachment.name} className="mt-2 max-w-[580px]" />
  }
  return <AttachmentCard />
}

function EmailPart({ message }: { message: Message }) {
  const email = message.email
  if (!email) throw new Error('Email message is missing its native email payload')
  if (email.direction === 'in') return <EmailCard />
  return (
    <MessageDraft
      id={`message-draft-${message.id}`}
      role="state"
      channel="email"
      subject={email.subject || '（无主题）'}
      body={message.body || '（无正文）'}
      from={email.from}
      to={email.to.length ? email.to : ['unknown@invalid.local']}
      cc={email.cc}
      outcome={email.transportStatus === 'failed' ? 'cancelled' : 'sent'}
      className="mt-2 max-w-[620px]"
    />
  )
}

export function LingxiMessageParts({
  openMaus = false,
}: LingxiMessagePartsProps) {
  const { message } = useAuiState((state) => state.message.metadata.custom) as unknown as LingxiImMessageCustom
  return (
    <MessagePrimitive.Parts>
      {({ part }) => {
        switch (part.type) {
          case 'text':
            return <NativeTextPart openMaus={openMaus} />
          case 'reasoning':
            return <NativeReasoningPart part={part} />
          case 'tool-call':
            if (part.toolName === 'lingxi_approval') {
              return <ApprovalPart message={message} addResult={part.addResult as (result: { decision: 'approved' | 'denied' }) => void} />
            }
            if (part.toolName === 'lingxi_tool_activity') return <ToolActivityPart message={message} />
            throw new Error(`Unregistered native tool part: ${part.toolName}`)
          case 'image':
          case 'file':
            return <MediaPart message={message} />
          case 'source':
            throw new Error('Source parts must be emitted through the Lingxi citation Tool UI component')
          case 'data': {
            if (part.name === 'lingxi_poll') return <PollBubble zh={openMaus} />
            if (part.name === 'lingxi_handoff') return <HandoffPart message={message} />
            if (part.name === 'lingxi_learning_mission') return <LearningMissionPart message={message} />
            if (part.name === 'lingxi_email') return <EmailPart message={message} />
            if (part.name === 'lingxi_canvas') return <CanvasWorkspaceCard />
            if (part.name === 'lingxi_citations') return <CitationPart message={message} />
            if (part.name === 'lingxi_artifacts') return <MessageArtifactParts />
            if (part.name === 'lingxi_link_preview') {
              const url = (part.data as { url?: unknown } | undefined)?.url
              if (typeof url !== 'string') throw new Error('Link preview part is missing its native URL')
              return <LinkPreview url={url} />
            }
            throw new Error(`Unregistered native data part: ${part.name}`)
          }
          default:
            throw new Error(`Unregistered native message part: ${(part as { type?: unknown }).type}`)
        }
      }}
    </MessagePrimitive.Parts>
  )
}
