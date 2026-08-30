import type { ThreadMessageLike } from '@assistant-ui/react'
import { projectTranscriptAdjacency } from '@/lib/transcriptExperience'
import { trimUrlTrailing } from '@/lib/messageTokens'
import type { Message, MessageKind, Participant } from '@/types'

export interface LingxiImMessagePresentation extends Record<string, unknown> {
  variant: 'system' | 'standard'
  quote: boolean
  reactions: boolean
  reply: boolean
  selection: boolean
  linkPreview: boolean
  attachmentHost: boolean
  bubble: boolean
  avatarAlignment: 'top' | 'bottom'
}

export interface LingxiImMessageCustom extends Record<string, unknown> {
  schema: 'lingxi.im.message.v1'
  message: Message
  sender: Participant
  senderId: string
  senderName: string
  senderKind: Participant['kind'] | 'system'
  senderAvatar: string | null
  originalKind: Message['kind']
  isMine: boolean
  groupStart: boolean
  groupEnd: boolean
  continuedFromPrevious: boolean
  continuedToNext: boolean
  conversationId: string
  sequence: number | null
  sendStatus: 'sending' | 'sent' | 'failed'
  presentation: LingxiImMessagePresentation
}

const STANDARD_PRESENTATION: LingxiImMessagePresentation = {
  variant: 'standard', quote: true, reactions: true, reply: true, selection: true, linkPreview: true, attachmentHost: false, bubble: true, avatarAlignment: 'bottom',
}
const STRUCTURED_PRESENTATION: LingxiImMessagePresentation = { ...STANDARD_PRESENTATION, linkPreview: false, bubble: false }
const MESSAGE_PRESENTATION = {
  text: STANDARD_PRESENTATION,
  thought: { ...STANDARD_PRESENTATION, bubble: false },
  tool: { ...STRUCTURED_PRESENTATION, attachmentHost: true, bubble: true, avatarAlignment: 'top' },
  attachment: { ...STRUCTURED_PRESENTATION, attachmentHost: true, bubble: true },
  email: STRUCTURED_PRESENTATION,
  poll: STRUCTURED_PRESENTATION,
  questionnaire: STRUCTURED_PRESENTATION,
  handoff: STRUCTURED_PRESENTATION,
  approval: { ...STRUCTURED_PRESENTATION, attachmentHost: true },
  canvas: { ...STRUCTURED_PRESENTATION, attachmentHost: true },
  learning_mission: STRUCTURED_PRESENTATION,
  system: { variant: 'system', quote: false, reactions: false, reply: false, selection: false, linkPreview: false, attachmentHost: false, bubble: false, avatarAlignment: 'bottom' },
} satisfies Record<MessageKind, LingxiImMessagePresentation>

const ASSISTANT_NATIVE_KINDS = new Set<MessageKind>(['thought', 'tool', 'handoff', 'approval', 'canvas', 'learning_mission'])

function messageRole(message: Message, sender?: Participant): ThreadMessageLike['role'] {
  if (message.kind === 'system') return 'system'
  if (sender?.kind === 'agent' || (!sender && ASSISTANT_NATIVE_KINDS.has(message.kind))) return 'assistant'
  return 'user'
}

function messageStatus(message: Message): NonNullable<ThreadMessageLike['status']> {
  if (message.failed) return { type: 'incomplete', reason: 'error', error: 'send-failed' }
  if (message.streaming) return { type: 'running' }
  return { type: 'complete', reason: 'stop' }
}

function dataPart(name: string) { return { type: 'data' as const, name, data: {} } }

interface ContentBuilderContext { message: Message; content: Array<Record<string, unknown>>; pushBody: () => void }
type ContentBuilder = (context: ContentBuilderContext) => void

const MESSAGE_CONTENT_BUILDERS = {
  text: ({ pushBody }) => pushBody(),
  system: ({ message, pushBody }) => { if (!message.teacherBriefing) pushBody() },
  thought: ({ message, content }) => { content.push({ type: 'reasoning', text: message.body }) },
  tool: ({ message, content, pushBody }) => {
    pushBody()
    content.push({
      type: 'tool-call', toolCallId: `tool:${message.id}`, toolName: 'lingxi_tool_activity',
      args: { messageId: message.id, tool: message.tool ?? null },
      result: message.tool?.status && !/running|pending|working/i.test(message.tool.status) ? { status: message.tool.status } : undefined,
    })
  },
  approval: ({ message, content }) => {
    const approval = message.approval
    content.push({
      type: 'tool-call', toolCallId: `approval:${approval?.id ?? message.id}`, toolName: 'lingxi_approval',
      args: { messageId: message.id, approval: approval ?? null },
      result: approval && approval.status !== 'PENDING'
        ? { decision: approval.status === 'APPROVED' || approval.status === 'EXECUTED' ? 'approved' : 'denied', status: approval.status }
        : undefined,
    })
  },
  attachment: ({ message, content, pushBody }) => {
    pushBody()
    const attachment = message.attachment
    if (!attachment) throw new Error('Attachment message requires an attachment payload')
    if (attachment.kind === 'img' || attachment.mime?.startsWith('image/')) {
      content.push({ type: 'image', image: attachment.url, filename: attachment.name })
    } else {
      content.push({ type: 'file', data: attachment.url, filename: attachment.name, mimeType: attachment.mime || 'application/octet-stream', sourceType: 'url' })
    }
  },
  poll: ({ content }) => { content.push(dataPart('lingxi_poll')) },
  questionnaire: ({ content }) => { content.push(dataPart('lingxi_questionnaire')) },
  handoff: ({ content }) => { content.push(dataPart('lingxi_handoff')) },
  learning_mission: ({ content }) => { content.push(dataPart('lingxi_learning_mission')) },
  email: ({ content }) => { content.push(dataPart('lingxi_email')) },
  canvas: ({ content }) => { content.push(dataPart('lingxi_canvas')) },
} satisfies Record<MessageKind, ContentBuilder>

function hasArtifactReferences(message: Message): boolean {
  return /\b(?:doc_[A-Za-z0-9]+|board-[A-Za-z0-9-]+|card-[A-Za-z0-9-]+|ce-[A-Za-z0-9-]+)\b/.test(`${message.body}\n${message.tool?.arg ?? ''}\n${message.tool?.detail ?? ''}`)
}

function firstUrlInBody(body: string): string | null {
  const match = body.match(/https?:\/\/[^\s<]+/i)
  return match ? trimUrlTrailing(match[0]).url : null
}

export function createLingxiAssistantMessage(
  message: Message,
  index: number,
  messages: readonly Message[],
  participants: Record<string, Participant>,
  meId: string | null,
): ThreadMessageLike {
  const sender = participants[message.authorId]
  const role = messageRole(message, sender)
  const senderMetadata: Participant = sender ?? {
    id: message.authorId,
    kind: role === 'assistant' ? 'agent' : 'human',
    name: message.authorId,
    initial: message.authorId.slice(0, 1).toUpperCase() || '?',
    avatarBg: '#DCE7F0',
    status: 'avail',
  }
  const adjacency = projectTranscriptAdjacency(messages)[index] ?? { isGroupStart: true, isGroupEnd: true }
  const content: Array<Record<string, unknown>> = []
  const pushBody = () => { if (message.body) content.push({ type: 'text', text: message.body }) }

  MESSAGE_CONTENT_BUILDERS[message.kind]({ message, content, pushBody })
  if (message.teacherBriefing) {
    content.push(dataPart('lingxi_teacher_briefing'))
    content.push(dataPart('lingxi_attention'))
    content.push(dataPart('lingxi_evidence'))
  }
  if (message.citations?.length) content.push(dataPart('lingxi_citations'))
  if (hasArtifactReferences(message)) content.push(dataPart('lingxi_artifacts'))
  const link = firstUrlInBody(message.body)
  if (link && message.kind === 'text' && !message.streaming) content.push({ type: 'data', name: 'lingxi_link_preview', data: { url: link } })

  const createdAt = message.createdAt ? new Date(message.createdAt) : undefined
  const metadata: LingxiImMessageCustom = {
    schema: 'lingxi.im.message.v1',
    message,
    sender: senderMetadata,
    senderId: message.authorId,
    senderName: senderMetadata.name,
    senderKind: message.kind === 'system' ? 'system' : senderMetadata.kind,
    senderAvatar: senderMetadata.avatarUrl ?? null,
    originalKind: message.kind,
    isMine: message.authorId === meId,
    groupStart: adjacency.isGroupStart,
    groupEnd: adjacency.isGroupEnd,
    continuedFromPrevious: adjacency.isContinuedFromPrevious,
    continuedToNext: adjacency.isContinuedToNext,
    conversationId: message.conversationId,
    sequence: message.sequence ?? null,
    sendStatus: message.failed ? 'failed' : message.pending ? 'sending' : 'sent',
    presentation: message.teacherBriefing ? STRUCTURED_PRESENTATION : MESSAGE_PRESENTATION[message.kind],
  }
  return {
    id: message.id,
    role,
    content: content as unknown as ThreadMessageLike['content'],
    createdAt: createdAt && Number.isFinite(createdAt.getTime()) ? createdAt : undefined,
    ...(role === 'assistant' ? { status: messageStatus(message) } : {}),
    metadata: { isOptimistic: Boolean(message.pending), custom: metadata },
  }
}
