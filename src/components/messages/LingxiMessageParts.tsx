import { MessagePrimitive, useAuiState } from '@assistant-ui/react'
import type { ReactNode } from 'react'
import type { LingxiImMessageCustom } from '@/im/assistantMessage'
import { PollBubble } from '../PollBubble'
import { QuestionnaireBubble } from '../QuestionnaireBubble'
import { LinkPreview } from '../LinkPreview'
import { CanvasWorkspaceCard, MessageArtifactParts } from './MessageBusinessParts'
import { NativeReasoningPart, NativeTextPart } from './MessageContentParts'
import { CitationPart, EmailPart, MediaPart } from './MessageMediaParts'
import { ApprovalPart, HandoffPart, LearningMissionPart, ToolActivityPart } from './MessageToolParts'
import { AttentionCardsPart, BriefingMessagePart, EvidenceSheetPart } from './TeacherMessageParts'

export function LingxiMessageParts({ openMaus = false, bubbleReactions }: { openMaus?: boolean; bubbleReactions?: ReactNode }) {
  const { message } = useAuiState((state) => state.message.metadata.custom) as unknown as LingxiImMessageCustom
  return <MessagePrimitive.Parts>{({ part }) => {
    switch (part.type) {
      case 'text': return <NativeTextPart reactions={bubbleReactions} />
      case 'reasoning': return <NativeReasoningPart part={part} />
      case 'tool-call':
        if (part.toolName === 'lingxi_approval') return <ApprovalPart message={message} addResult={part.addResult as (result: { decision: 'approved' | 'denied'; persisted: true }) => void} />
        if (part.toolName === 'lingxi_tool_activity') return <ToolActivityPart message={message} />
        throw new Error(`Unregistered native tool part: ${part.toolName}`)
      case 'image':
      case 'file': return <MediaPart message={message} />
      case 'source': throw new Error('Source parts must be emitted through the Lingxi citation Tool UI component')
      case 'data': {
        if (part.name === 'lingxi_poll') return <PollBubble zh={openMaus} />
        if (part.name === 'lingxi_questionnaire') return <QuestionnaireBubble />
        if (part.name === 'lingxi_handoff') return <HandoffPart message={message} />
        if (part.name === 'lingxi_learning_mission') return <LearningMissionPart message={message} />
        if (part.name === 'lingxi_email') return <EmailPart message={message} />
        if (part.name === 'lingxi_canvas') return <CanvasWorkspaceCard />
        if (part.name === 'lingxi_citations') return <CitationPart message={message} />
        if (part.name === 'lingxi_teacher_briefing') return <BriefingMessagePart message={message} />
        if (part.name === 'lingxi_attention') return <AttentionCardsPart message={message} />
        if (part.name === 'lingxi_evidence') return <EvidenceSheetPart message={message} />
        if (part.name === 'lingxi_artifacts') return <MessageArtifactParts />
        if (part.name === 'lingxi_link_preview') {
          const url = (part.data as { url?: unknown } | undefined)?.url
          if (typeof url !== 'string') throw new Error('Link preview part is missing its native URL')
          return <LinkPreview url={url} />
        }
        throw new Error(`Unregistered native data part: ${part.name}`)
      }
      default: throw new Error(`Unregistered native message part: ${(part as { type?: unknown }).type}`)
    }
  }}</MessagePrimitive.Parts>
}
