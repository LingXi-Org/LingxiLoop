import type {
  MessageStatus,
  ThreadAssistantMessagePart,
  ThreadMessage,
  ThreadUserMessagePart,
  ToolCallMessagePart,
} from '@assistant-ui/react'
import type { Participant } from '@/types'
import type { ImEnvelope, LingxiMessageV1 } from '@/lib/im/wukong'
import type {
  LingxiMessageMetadata,
  LingxiQuoteMetadata,
  LingxiReactionMetadata,
} from './model'

type JsonObject = Record<string, unknown>

const KNOWN_KINDS = new Set<LingxiMessageV1['kind']>([
  'text',
  'attachment',
  'system',
  'tool_activity',
  'approval',
  'handoff',
  'questionnaire',
  'poll',
  'artifact',
  'canvas',
  'learning_mission',
  'email',
])

export interface MessageConversionContext {
  participants: Record<string, Participant>
  meId: string | null
}

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}
}

function string(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : []
}

function messageId(envelope: ImEnvelope): string {
  const { payload } = envelope
  if (payload.kind === 'poll') return String(payload.refs?.pollClientMsgNo ?? payload.clientMsgNo)
  if (payload.kind === 'approval' && payload.refs?.approvalId) return `approval-${payload.refs.approvalId}`
  if (payload.kind === 'handoff' && payload.refs?.handoffId) return `handoff-${payload.refs.handoffId}`
  return envelope.messageId || payload.clientMsgNo
}

function timestamp(value: number): Date {
  const date = new Date(value > 10_000_000_000 ? value : value * 1_000)
  return Number.isFinite(date.getTime()) ? date : new Date()
}

function reactions(data: JsonObject, meId: string | null): LingxiReactionMetadata[] {
  const rows = Array.isArray(data.reactions) ? data.reactions : []
  return rows.flatMap((value) => {
    const row = object(value)
    const emoji = string(row.emoji)
    const count = finiteNumber(row.count)
    if (!emoji || count === null || count <= 0) return []
    const userIds = stringArray(row.users)
    return [{ emoji, count, userIds, mine: Boolean(meId && userIds.includes(meId)) }]
  })
}

function quote(data: JsonObject, replyToClientMsgNo?: string): LingxiQuoteMetadata | null {
  if (!replyToClientMsgNo) return null
  const quoted = object(data.quoted)
  return {
    messageId: string(quoted.id, replyToClientMsgNo),
    authorId: string(quoted.authorId),
    authorName: typeof quoted.authorName === 'string' ? quoted.authorName : null,
    text: string(quoted.body).slice(0, 240),
    sequence: finiteNumber(quoted.sequence),
  }
}

function senderMetadata(envelope: ImEnvelope, context: MessageConversionContext) {
  const participant = context.participants[envelope.fromUid]
  const system = envelope.payload.kind === 'system'
  return {
    senderId: envelope.fromUid,
    senderName: participant?.name ?? (system ? '系统' : envelope.fromUid),
    senderKind: system ? 'system' as const : participant?.kind ?? 'human' as const,
    senderAvatarUrl: participant?.avatarUrl ?? null,
    isMine: envelope.fromUid === context.meId,
  }
}

function toolCall(
  id: string,
  toolName: string,
  args: JsonObject,
  result?: unknown,
): ToolCallMessagePart {
  return {
    type: 'tool-call',
    toolCallId: id,
    toolName,
    args: args as never,
    argsText: JSON.stringify(args),
    ...(result === undefined ? {} : { result }),
  }
}

function approvalPart(id: string, data: JsonObject): ThreadAssistantMessagePart {
  const approval = object(data.approval ?? data)
  const approvalId = string(approval.id, id.replace(/^approval-/, ''))
  const status = string(approval.status, 'PENDING')
  const args = {
    id: `approval-${approvalId}`,
    title: string(approval.summary, '需要批准'),
    description: string(approval.kind),
    variant: /destructive|financial|irreversible/i.test(string(approval.kind)) ? 'destructive' : 'default',
    confirmLabel: '批准',
    cancelLabel: '拒绝',
  }
  const resolved = status === 'PENDING'
    ? undefined
    : { decision: status === 'APPROVED' || status === 'EXECUTED' ? 'approved' : 'denied', status }
  return {
    ...toolCall(`approval:${approvalId}`, 'approval-card', args, resolved),
    approval: {
      id: approvalId,
      ...(resolved ? { approved: resolved.decision === 'approved' } : {}),
    },
  }
}

function pollPart(id: string, data: JsonObject): ThreadAssistantMessagePart {
  const poll = object(data.poll ?? data)
  const tallies = Array.isArray(data.pollTallies) ? data.pollTallies.map((value) => {
    const tally = object(value)
    return { optionId: string(tally.optionId), count: finiteNumber(tally.count) ?? 0, voterIds: stringArray(tally.voterIds) }
  }) : []
  const counts = new Map(tallies.map((tally) => [tally.optionId, tally.count]))
  const options = Array.isArray(poll.options)
    ? poll.options.map((value, index) => {
        const option = object(value)
        const optionId = string(option.id, String(index))
        return {
          id: optionId,
          label: string(option.text, string(option.label, `选项 ${index + 1}`)),
          description: `${counts.get(optionId) ?? 0} 票`,
        }
      })
    : []
  return toolCall(`poll:${id}`, 'option-list', {
    id: `poll-${id}`,
    title: string(poll.question, '投票'),
    options,
    selectionMode: poll.mode === 'multi' ? 'multi' : 'single',
    tallies,
    closedAt: typeof poll.closedAt === 'string' ? poll.closedAt : null,
  })
}

function questionnairePart(id: string, data: JsonObject): ThreadAssistantMessagePart {
  const questionnaire = object(data.questionnaire ?? data)
  const items = Array.isArray(questionnaire.items) ? questionnaire.items.map((value) => {
    const item = object(value)
    return {
      name: string(item.name),
      prompt: string(item.prompt),
      description: string(item.description),
      required: item.required === true,
      multiple: item.multiple === true,
      choices: Array.isArray(item.choices) ? item.choices.map((choiceValue) => {
        const choice = object(choiceValue)
        return { value: string(choice.value), label: string(choice.label), description: string(choice.description) }
      }) : [],
    }
  }) : []
  return toolCall(`questionnaire:${id}`, 'question-flow', {
    id: `questionnaire-${id}`,
    title: string(questionnaire.title, '请补充信息'),
    items,
    submitLabel: string(questionnaire.submitLabel, '提交'),
  })
}

function baseParts(envelope: ImEnvelope): ThreadAssistantMessagePart[] {
  const { payload } = envelope
  const data = object(payload.data)
  const id = messageId(envelope)
  const textPart = payload.body ? [{ type: 'text' as const, text: payload.body }] : []
  switch (payload.kind) {
    case 'text':
      return [{ type: 'text', text: payload.body ?? '' }]
    case 'system': {
      if (data.type !== 'teacher_briefing') return [{ type: 'text', text: payload.body ?? '' }]
      return [toolCall(`briefing:${id}`, 'stats-display', {
        id: `briefing-${id}`,
        title: payload.body || '学习简报',
        statistics: object(data.statistics),
        attentionItemIds: stringArray(data.attentionItemIds),
        windowStartSequence: finiteNumber(data.windowStartSequence) ?? 0,
        windowEndSequence: finiteNumber(data.windowEndSequence) ?? 0,
      })]
    }
    case 'attachment': {
      const url = string(data.url)
      const name = string(data.name, '附件')
      const mimeType = string(data.mime, 'application/octet-stream')
      if (!url) throw new Error(`Attachment message ${id} has no URL`)
      const part: ThreadAssistantMessagePart = data.kind === 'img' || mimeType.startsWith('image/')
        ? { type: 'image', image: url, filename: name }
        : { type: 'file', data: url, filename: name, mimeType, sourceType: 'url' }
      return [...textPart, part]
    }
    case 'tool_activity':
    case 'artifact':
      return [...textPart, toolCall(`activity:${id}`, 'progress-tracker', {
        id: `activity-${id}`,
        role: 'state',
        steps: [{
          id: `activity-step-${id}`,
          label: string(data.name, payload.body || '工具活动'),
          description: [string(data.arg), string(data.detail)].filter(Boolean).join(' · '),
          status: /failed|error/i.test(string(data.status, string(data.stage)))
            ? 'failed'
            : /running|pending|working/i.test(string(data.status, string(data.stage)))
              ? 'in-progress'
              : 'completed',
        }],
      })]
    case 'approval':
      return [approvalPart(id, data)]
    case 'poll':
      return [pollPart(id, data)]
    case 'questionnaire':
      return [questionnairePart(id, data)]
    case 'handoff':
      return [toolCall(`handoff:${id}`, 'plan', {
        id: `handoff-${id}`,
        title: string(data.title, payload.body || '任务交接'),
        description: [string(data.note), `${string(data.fromAgentId)} → ${string(data.toAgentId)}`]
          .filter(Boolean).join(' · '),
        todos: [{
          id: `handoff-todo-${id}`,
          label: string(data.title, '完成交接'),
          description: stringArray(data.sharedPaths).join(' · '),
          status: /complete/i.test(string(data.status))
            ? 'completed'
            : /working|accepted/i.test(string(data.status)) ? 'in_progress' : 'pending',
        }],
      })]
    case 'canvas':
      return [toolCall(`canvas:${id}`, 'link-preview', {
        id: `canvas-${id}`,
        title: string(data.title, payload.body || '画布'),
        description: string(data.goal),
        href: `lingxiloop://canvas/${encodeURIComponent(string(data.canvasId))}`,
      })]
    case 'learning_mission':
      return [toolCall(`mission:${id}`, 'plan', {
        id: `mission-${id}`,
        title: string(data.goal, payload.body || '学习任务'),
        description: string(data.successCriteria),
        todos: [{
          id: `mission-todo-${string(data.missionId, id)}`,
          label: string(data.goal, '完成学习任务'),
          description: string(data.successCriteria),
          status: /complete/i.test(string(data.status))
            ? 'completed'
            : /active|running|working/i.test(string(data.status)) ? 'in_progress' : 'pending',
        }],
      })]
    case 'email': {
      const email = object(data.email ?? data)
      const transportStatus = string(email.transportStatus)
      return [toolCall(`email:${id}`, 'message-draft', {
        id: `email-${id}`,
        channel: 'email',
        body: payload.body || string(email.body, '（无内容）'),
        subject: string(email.subject, '无主题'),
        from: string(email.from),
        to: stringArray(email.to),
        cc: stringArray(email.cc),
        ...(transportStatus === 'sent' ? { outcome: 'sent' } : {}),
      }, transportStatus ? { status: transportStatus, error: string(email.transportError) } : undefined)]
    }
  }
}

function structuredParts(envelope: ImEnvelope): ThreadAssistantMessagePart[] {
  const parts = baseParts(envelope)
  const data = object(envelope.payload.data)
  const citations = Array.isArray(data.citations) ? data.citations : []
  const sources: ThreadAssistantMessagePart[] = citations.flatMap((value, index) => {
    const citation = object(value)
    const url = string(citation.url, string(citation.href))
    if (!url) return []
    return [{
      type: 'source',
      sourceType: 'url',
      id: string(citation.id, `${messageId(envelope)}-source-${index}`),
      url,
      title: string(citation.title, string(citation.label, url)),
    }]
  })
  return [...parts, ...sources]
}

function assistantStatus(envelope: ImEnvelope): MessageStatus {
  if (envelope.payload.kind === 'approval') {
    const approval = object(object(envelope.payload.data).approval ?? envelope.payload.data)
    if (string(approval.status, 'PENDING') === 'PENDING') return { type: 'requires-action', reason: 'tool-calls' }
  }
  return { type: 'complete', reason: 'stop' }
}

function buildMetadata(envelope: ImEnvelope, context: MessageConversionContext): LingxiMessageMetadata {
  const data = object(envelope.payload.data)
  const quoted = quote(data, envelope.payload.replyToClientMsgNo)
  return {
    schema: 'lingxiloop.thread-message.v1',
    conversationId: envelope.channelId,
    clientMessageId: envelope.payload.clientMsgNo || envelope.clientMsgNo,
    sequence: Number.isSafeInteger(envelope.messageSeq) && envelope.messageSeq > 0 ? envelope.messageSeq : null,
    ...senderMetadata(envelope, context),
    delivery: 'sent',
    messageKind: envelope.payload.kind,
    runId: typeof envelope.payload.refs?.runId === 'string' ? envelope.payload.refs.runId : null,
    quotedMessageId: envelope.payload.replyToClientMsgNo ?? null,
    quote: quoted,
    reactions: reactions(data, context.meId),
    receipts: [],
    replyCount: finiteNumber(data.replyCount) ?? 0,
    threadRootId: envelope.payload.replyToClientMsgNo ?? null,
    groupStart: true,
    groupEnd: true,
    continuedFromPrevious: false,
    continuedToNext: false,
  }
}

export function convertEnvelope(envelope: ImEnvelope, context: MessageConversionContext): ThreadMessage {
  if (!KNOWN_KINDS.has(envelope.payload.kind)) {
    throw new Error(`Unsupported WuKong message kind: ${String(envelope.payload.kind)}`)
  }
  const metadata = buildMetadata(envelope, context)
  const role = metadata.senderKind === 'system' && object(envelope.payload.data).type !== 'teacher_briefing'
    ? 'system'
    : metadata.isMine && (envelope.payload.kind === 'text' || envelope.payload.kind === 'attachment')
      ? 'user'
      : 'assistant'
  const content = structuredParts(envelope)
  const common = { id: messageId(envelope), createdAt: timestamp(envelope.timestamp) }
  if (role === 'system') {
    const text = content.find((part) => part.type === 'text')?.text ?? envelope.payload.body ?? ''
    return { ...common, role, content: [{ type: 'text', text }], metadata: { custom: metadata } }
  }
  if (role === 'user') {
    return {
      ...common,
      role,
      content: content as ThreadUserMessagePart[],
      attachments: [],
      metadata: { custom: metadata },
    }
  }
  return {
    ...common,
    role,
    content,
    status: assistantStatus(envelope),
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      custom: metadata,
    },
  }
}

function adjacent(left: ThreadMessage, right: ThreadMessage): boolean {
  const leftMeta = left.metadata.custom as LingxiMessageMetadata
  const rightMeta = right.metadata.custom as LingxiMessageMetadata
  const elapsed = right.createdAt.getTime() - left.createdAt.getTime()
  return left.role !== 'system'
    && right.role !== 'system'
    && leftMeta.senderId === rightMeta.senderId
    && leftMeta.delivery !== 'failed'
    && rightMeta.delivery !== 'failed'
    && elapsed >= 0
    && elapsed <= 5 * 60_000
}

export function projectMessageGroups(messages: readonly ThreadMessage[]): ThreadMessage[] {
  return messages.map((message, index) => {
    const previous = messages[index - 1]
    const next = messages[index + 1]
    const continuedFromPrevious = Boolean(previous && adjacent(previous, message))
    const continuedToNext = Boolean(next && adjacent(message, next))
    const custom = message.metadata.custom as LingxiMessageMetadata
    return {
      ...message,
      metadata: {
        ...message.metadata,
        custom: {
          ...custom,
          groupStart: !continuedFromPrevious,
          groupEnd: !continuedToNext,
          continuedFromPrevious,
          continuedToNext,
        },
      },
    } as ThreadMessage
  })
}

export function convertEnvelopeBatch(
  envelopes: readonly ImEnvelope[],
  context: MessageConversionContext,
): ThreadMessage[] {
  const byId = new Map<string, ThreadMessage>()
  for (const envelope of envelopes) {
    const message = convertEnvelope(envelope, context)
    const current = byId.get(message.id)
    const currentSequence = current ? (current.metadata.custom as LingxiMessageMetadata).sequence ?? 0 : -1
    const nextSequence = (message.metadata.custom as LingxiMessageMetadata).sequence ?? 0
    if (!current || nextSequence >= currentSequence) byId.set(message.id, message)
  }
  return projectMessageGroups([...byId.values()].sort((left, right) => {
    const leftSequence = (left.metadata.custom as LingxiMessageMetadata).sequence
    const rightSequence = (right.metadata.custom as LingxiMessageMetadata).sequence
    if (leftSequence !== null && rightSequence !== null && leftSequence !== rightSequence) return leftSequence - rightSequence
    return left.createdAt.getTime() - right.createdAt.getTime()
  }))
}
