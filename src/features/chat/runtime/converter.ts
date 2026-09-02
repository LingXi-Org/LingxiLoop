import type {
  MessageStatus,
  ThreadAssistantMessagePart,
  ThreadMessage,
  ThreadUserMessagePart,
  ToolCallMessagePart,
} from '@assistant-ui/react'
import type { ImEnvelope, LingxiMessageV1 } from '@/lib/im/wukong'
import type { Participant } from '@/types'
import type {
  LingxiMessageMetadata,
  LingxiQuoteMetadata,
  LingxiReactionMetadata,
} from './model'
import { resolveMessagePresentation } from './model'

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

function ragParts(data: JsonObject, body: string, runId: string): ToolCallMessagePart[] {
  if (/\[S\d+\]|【S\d+】/.test(body)) throw new Error('Agent text contains a retired bare citation marker')
  const citationPattern = /\[([^\]\n]+)\]\(#cite-(S\d+(?:,S\d+)*)\)/g
  const citationLinks = [...body.matchAll(citationPattern)]
  const citedIds = new Set<string>()
  for (const match of citationLinks) {
    for (const id of match[2]!.split(',')) citedIds.add(id)
  }
  if (body.replace(/\[[^\]\n]+\]\(#cite-S\d+(?:,S\d+)*\)/g, '').includes('#cite-')) {
    throw new Error('Agent text contains malformed confidence citation syntax')
  }
  if (citedIds.size === 0) {
    if (data.rag !== undefined) {
      throw new Error('Unreferenced RAG evidence is not a valid assistant message')
    }
    return []
  }
  const rag = object(data.rag)
  if (!Array.isArray(rag.claims) || !Array.isArray(rag.documentReferences)) {
    throw new Error('Cited agent text requires a native RAG result')
  }
  const claimIds = new Set<string>()
  const claims = rag.claims.map((value) => {
    const claim = object(value)
    const id = string(claim.id)
    const text = string(claim.text)
    const basis = string(claim.basis)
    const markers = Array.isArray(claim.markers) && claim.markers.every((marker) => typeof marker === 'string')
      ? claim.markers
      : []
    if (
      !id || claimIds.has(id) || !text || claim.confidence !== 'grounded' || !basis
      || markers.length === 0 || new Set(markers).size !== markers.length
      || markers.some((marker) => !/^S\d+$/.test(marker))
    ) {
      throw new Error('Native confidence result contains an invalid claim')
    }
    claimIds.add(id)
    return { id, text, confidence: 'grounded' as const, basis, markers }
  })
  if (
    claims.length !== citationLinks.length
    || claims.some((claim, index) => (
      claim.text !== citationLinks[index]![1]
      || claim.markers.join(',') !== citationLinks[index]![2]
    ))
    || body.replace(citationPattern, '').split('\n').some((line) => !/^\s*(?:(?:[-+*]|\d+[.)])\s*)?$/.test(line))
  ) throw new Error('Agent text and native confidence claims must be identical')
  const seenMarkers = new Set<string>()
  const seenSources = new Set<string>()
  const references = rag.documentReferences.map((value) => {
    const reference = object(value)
    const marker = string(reference.marker)
    const sourceId = string(reference.sourceId)
    const title = string(reference.title)
    const pages = finiteNumber(reference.pages)
    if (
      !/^S\d+$/.test(marker)
      || seenMarkers.has(marker)
      || seenSources.has(sourceId)
      || !sourceId
      || !title
      || pages === null
      || !Number.isSafeInteger(pages)
      || pages < 1
      || !Array.isArray(reference.anchors)
      || reference.anchors.length === 0
    ) {
      throw new Error('Native document references contain an invalid or duplicate document')
    }
    const anchors = reference.anchors.map((value) => {
      const anchor = object(value)
      const page = finiteNumber(anchor.page)
      const quote = string(anchor.quote)
      if (page === null || !Number.isSafeInteger(page) || page < 1 || page > pages || !quote) {
        throw new Error('Native document reference contains an invalid anchor')
      }
      return { page, quote }
    })
    seenMarkers.add(marker)
    seenSources.add(sourceId)
    return {
      marker,
      sourceId,
      title,
      pages,
      anchors,
    }
  })
  if (
    citedIds.size !== references.length
    || references.some(({ marker }) => !citedIds.has(marker))
  ) throw new Error('Citation links and document references must identify the same evidence')
  return [
    toolCall(`cite-claims:${runId}`, 'cite_claims', {}, { claims }),
    ...references.map((reference) => toolCall(
      `read-document:${runId}:${reference.marker}`,
      'read_document',
      { sourceId: reference.sourceId, marker: reference.marker },
      { title: reference.title, pages: reference.pages, anchors: reference.anchors },
    )),
  ]
}

function approvalPart(id: string, data: JsonObject): ThreadAssistantMessagePart {
  const approval = object(data.approval ?? data)
  const approvalId = string(approval.id, id.replace(/^approval-/, ''))
  const status = string(approval.status, 'PENDING')
  const approved = status === 'PENDING' ? undefined : status === 'APPROVED' || status === 'EXECUTED'
  const payload = object(approval.payload)
  if (payload.action === 'calendar.create') {
    return {
      ...toolCall(`approval:${approvalId}`, 'calendar.create', object(payload.args)),
      approval: {
        id: approvalId,
        ...(approved === undefined ? {} : { approved }),
      },
    }
  }
  const kind = string(approval.kind)
  const detail = ({
    external_communication: '外部通信',
    sensitive_or_destructive_action: '敏感或破坏性操作',
    financial_or_irreversible_action: '财务或不可逆操作',
  } as Record<string, string>)[kind]
  if (!detail) throw new Error('Approval kind is invalid')
  const args = {
    id: `approval-${approvalId}`,
    question: string(approval.summary, '需要批准'),
    detail,
    confidenceLabel: '需要你的决定',
    acceptedLabel: '已批准',
    rejectedLabel: '已拒绝',
  }
  return {
    ...toolCall(`approval:${approvalId}`, 'approval-card', args),
    approval: {
      id: approvalId,
      ...(approved === undefined ? {} : { approved }),
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
  return toolCall(`poll:${id}`, 'poll-form', {
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
        return {
          value: string(choice.value), label: string(choice.label), description: string(choice.description),
          ...(choice.disabled === true ? { disabled: true } : {}),
        }
      }) : [],
      ...(item.input && typeof item.input === 'object' ? {
        input: {
          label: string(object(item.input).label),
          placeholder: string(object(item.input).placeholder),
        },
      } : {}),
    }
  }) : []
  return toolCall(`questionnaire:${id}`, 'elicitation-form', {
    id: `questionnaire-${id}`,
    title: string(questionnaire.title, '请补充信息'),
    items,
    submitLabel: string(questionnaire.submitLabel, '提交'),
  })
}

function toolActivityPart(id: string, data: JsonObject, body: string): ThreadAssistantMessagePart {
  const status = string(data.status, string(data.stage))
  const running = /running|pending|working|requested/i.test(status)
  return toolCall(`host:activity:${id}`, 'host-activity', {
    name: string(data.name, body || '工具活动'),
    arg: string(data.arg),
    detail: string(data.detail),
    status,
  }, running ? undefined : { status })
}

function baseParts(envelope: ImEnvelope): ThreadAssistantMessagePart[] {
  const { payload } = envelope
  const data = object(payload.data)
  const id = messageId(envelope)
  const textPart = payload.body ? [{ type: 'text' as const, text: payload.body }] : []
  switch (payload.kind) {
    case 'text': {
      if (typeof payload.refs?.runId !== 'string') return [{ type: 'text', text: payload.body ?? '' }]
      return [
        { type: 'text', text: payload.body ?? '' },
        ...ragParts(data, payload.body ?? '', payload.refs.runId),
      ]
    }
    case 'system': {
      if (data.type !== 'teacher_briefing') return [{ type: 'text', text: payload.body ?? '' }]
      const windowStart = finiteNumber(data.windowStartSequence)
      const windowEnd = finiteNumber(data.windowEndSequence)
      if (windowStart === null || windowEnd === null) throw new Error('Teacher briefing requires a sequence window')
      const checkpoints = Object.entries(object(data.statistics)).map(([key, rawValue]) => {
        const value = finiteNumber(rawValue)
        if (value === null) throw new Error('Teacher briefing statistics must be finite numbers')
        return {
          id: `briefing-${id}-${key}`,
          label: key === 'eventCount' ? '学习更新' : key === 'attentionCount' ? '需要关注' : key,
          at: `序列 ${windowStart}–${windowEnd}`,
          items: value,
        }
      })
      if (checkpoints.length === 0) throw new Error('Teacher briefing requires at least one checkpoint')
      return [toolCall(`briefing:${id}`, 'checkpoint-history', {
        id: `briefing-${id}`,
        checkpoints,
        currentId: checkpoints[checkpoints.length - 1]!.id,
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
      return [part]
    }
    case 'artifact': {
      const artifact = object(data.artifact ?? data)
      if (artifact.artifactKind === 'lecture_deck_html' && typeof artifact.artifactId === 'string') {
        return [toolCall(`presentation:${id}`, 'presentation-artifact', {
          artifactId: artifact.artifactId,
          artifactKind: 'lecture_deck_html',
          title: string(artifact.title, payload.body || 'HTML 演示'),
        })]
      }
      return [...textPart, toolActivityPart(id, data, payload.body ?? '')]
    }
    case 'tool_activity':
      return [toolActivityPart(id, data, payload.body ?? '')]
    case 'approval':
      return [approvalPart(id, data)]
    case 'poll':
      return [pollPart(id, data)]
    case 'questionnaire':
      return [questionnairePart(id, data)]
    case 'handoff':
      return [toolCall(`handoff:${id}`, 'agent-handoff', {
        id: `handoff-${id}`,
        from: string(data.fromAgentId),
        to: string(data.toAgentId),
        settled: /complete|accepted/i.test(string(data.status)),
      })]
    case 'canvas':
      return [toolCall(`canvas:${id}`, 'canvas-artifact', {
        id: `canvas-${id}`,
        title: string(data.title, payload.body || '画布'),
        description: string(data.goal),
        href: `lingxiloop://canvas/${encodeURIComponent(string(data.canvasId))}`,
      })]
    case 'learning_mission':
      return [toolCall(`mission:${id}`, 'agent-plan', {
        id: `mission-${id}`,
        steps: [[string(data.goal, payload.body || '完成学习任务'), string(data.successCriteria)].filter(Boolean).join('：')],
        activeIndex: /complete/i.test(string(data.status)) ? 1 : 0,
      })]
    case 'email': {
      const email = object(data.email ?? data)
      const transportStatus = string(email.transportStatus)
      return [toolCall(`email:${id}`, 'draft-email', {
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
  return baseParts(envelope)
}

function assistantStatus(envelope: ImEnvelope): MessageStatus {
  if (envelope.payload.kind === 'approval') {
    const approval = object(object(envelope.payload.data).approval ?? envelope.payload.data)
    if (string(approval.status, 'PENDING') === 'PENDING') return { type: 'requires-action', reason: 'tool-calls' }
  }
  return { type: 'complete', reason: 'stop' }
}

function buildMetadata(
  envelope: ImEnvelope,
  context: MessageConversionContext,
  content: readonly ThreadAssistantMessagePart[],
): LingxiMessageMetadata {
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
    presentation: resolveMessagePresentation(content),
    runId: typeof envelope.payload.refs?.runId === 'string' ? envelope.payload.refs.runId : null,
    quotedMessageId: envelope.payload.replyToClientMsgNo ?? null,
    quote: quoted,
    reactions: reactions(data, context.meId),
    replyCount: finiteNumber(data.replyCount) ?? 0,
    threadRootId: envelope.payload.replyToClientMsgNo ?? null,
    groupStart: true,
    groupEnd: true,
    continuedFromPrevious: false,
    continuedToNext: false,
    clusterChromeAt: null,
  }
}

export function convertEnvelope(envelope: ImEnvelope, context: MessageConversionContext): ThreadMessage {
  if (!KNOWN_KINDS.has(envelope.payload.kind)) {
    throw new Error(`Unsupported WuKong message kind: ${String(envelope.payload.kind)}`)
  }
  const content = structuredParts(envelope)
  const metadata = buildMetadata(envelope, context, content)
  const role = metadata.senderKind === 'system' && object(envelope.payload.data).type !== 'teacher_briefing'
    ? 'system'
    : metadata.isMine && (envelope.payload.kind === 'text' || envelope.payload.kind === 'attachment')
      ? 'user'
      : 'assistant'
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
  const clusterChrome = new Map<number, string>()
  for (let start = 0; start < messages.length;) {
    let end = start
    while (end + 1 < messages.length && adjacent(messages[end]!, messages[end + 1]!)) end += 1
    const first = messages[start]!
    const firstMeta = first.metadata.custom as LingxiMessageMetadata
    if (firstMeta.senderKind === 'agent' && firstMeta.presentation === 'special-card') {
      const source = messages.slice(start, end + 1).find((message) => (
        (message.metadata.custom as LingxiMessageMetadata).presentation === 'conversation'
      ))
      if (source) {
        for (let index = start; index <= end; index += 1) clusterChrome.set(index, source.createdAt.toISOString())
      }
    }
    start = end + 1
  }
  return messages.map((message, index) => {
    const previous = messages[index - 1]
    const next = messages[index + 1]
    const continuedFromPrevious = Boolean(previous && adjacent(previous, message))
    const continuedToNext = Boolean(next && adjacent(message, next))
    const custom = message.metadata.custom as LingxiMessageMetadata
    const clusterChromeAt = clusterChrome.get(index) ?? null
    if (
      custom.groupStart === !continuedFromPrevious
      && custom.groupEnd === !continuedToNext
      && custom.continuedFromPrevious === continuedFromPrevious
      && custom.continuedToNext === continuedToNext
      && custom.clusterChromeAt === clusterChromeAt
    ) return message
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
          clusterChromeAt,
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
