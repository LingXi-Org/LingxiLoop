import assert from 'node:assert/strict'
import test from 'node:test'
import type { ImEnvelope, LingxiMessageV1 } from '@/lib/im/wukong'
import type { Participant } from '@/types'
import { convertEnvelope, convertEnvelopeBatch, projectMessageGroups } from './converter'
import { getLingxiMessageMetadata } from './model'

const participants: Record<string, Participant> = {
  me: { id: 'me', kind: 'human', name: 'Me', initial: 'M', avatarBg: '#fff', status: 'avail' },
  agent: { id: 'agent', kind: 'agent', name: 'Scout', initial: 'S', avatarBg: '#fff', status: 'avail' },
}

function envelope(kind: LingxiMessageV1['kind'], data: Record<string, unknown> = {}, patch: Partial<ImEnvelope> = {}): ImEnvelope {
  return {
    messageId: `${kind}-server`,
    messageSeq: 7,
    clientMsgNo: `${kind}-client`,
    channelId: 'room',
    channelType: 2,
    fromUid: kind === 'text' ? 'me' : 'agent',
    timestamp: 1_767_225_600,
    payload: {
      version: 1,
      kind,
      clientMsgNo: `${kind}-client`,
      body: kind === 'text' ? 'hello' : `${kind} body`,
      data,
    },
    ...patch,
  }
}

const kindData = {
  text: {},
  attachment: { name: 'lesson.pdf', url: 'https://example.com/lesson.pdf', kind: 'pdf', mime: 'application/pdf' },
  system: {},
  tool_activity: { name: 'Search', status: 'running', detail: 'Finding sources' },
  approval: { id: 'approve-1', summary: 'Send this email', status: 'PENDING', kind: 'external_communication' },
  handoff: { id: 'handoff-1', title: 'Research handoff', status: 'working', fromAgentId: 'a', toAgentId: 'b' },
  questionnaire: { title: 'Clarify', items: [{ name: 'goal', prompt: 'Goal?', choices: [] }] },
  poll: { poll: { question: 'Choose', mode: 'single', options: [{ id: 'a', text: 'A' }] } },
  artifact: { name: 'Artifact', status: 'completed' },
  canvas: { canvasId: 'canvas-1', title: 'Board', goal: 'Plan' },
  learning_mission: { missionId: 'mission-1', goal: 'Learn', successCriteria: 'Pass', status: 'active' },
  email: { subject: 'Hello', from: 'a@example.com', to: ['b@example.com'], transportStatus: 'sent' },
} satisfies Record<LingxiMessageV1['kind'], Record<string, unknown>>

test('every WuKong kind converts exhaustively to canonical role, parts, and JSON-safe metadata', () => {
  for (const [kind, data] of Object.entries(kindData) as Array<[LingxiMessageV1['kind'], Record<string, unknown>]>) {
    const message = convertEnvelope(envelope(kind, data), { participants, meId: 'me' })
    const metadata = getLingxiMessageMetadata(message)
    assert.equal(metadata.schema, 'lingxiloop.thread-message.v1')
    assert.equal(metadata.messageKind, kind)
    assert.equal(metadata.conversationId, 'room')
    assert.equal(metadata.sequence, 7)
    assert.equal(message.role, kind === 'text' ? 'user' : kind === 'system' ? 'system' : 'assistant')
    assert.equal(JSON.stringify(metadata).includes('payload'), false)
    assert.equal(JSON.stringify(metadata).includes('messageObj'), false)
    assert.ok(message.content.length > 0)
  }
})

test('structured kinds become assistant-ui calls instead of view-level kind branches', () => {
  const expected = new Map<LingxiMessageV1['kind'], string>([
    ['tool_activity', 'host-activity'],
    ['approval', 'approval-card'],
    ['handoff', 'agent-handoff'],
    ['questionnaire', 'elicitation-form'],
    ['poll', 'poll-form'],
    ['artifact', 'host-activity'],
    ['canvas', 'canvas-artifact'],
    ['learning_mission', 'agent-plan'],
    ['email', 'draft-email'],
  ])
  for (const [kind, toolName] of expected) {
    const message = convertEnvelope(envelope(kind, kindData[kind]), { participants, meId: 'me' })
    assert.equal(message.content.some((part) => part.type === 'tool-call' && part.toolName === toolName), true)
  }
})

test('handoff, mission, and attachment protocols map directly to their native elements', () => {
  const handoff = convertEnvelope(envelope('handoff', {
    title: '核验学习证据', note: '并行梳理错题', status: 'working',
    fromAgentId: 'agent', toAgentId: 'reviewer', sharedPaths: ['错题记录'],
  }), { participants, meId: 'me' }).content[0]
  assert.deepEqual(handoff?.type === 'tool-call' ? { toolName: handoff.toolName, args: handoff.args } : null, {
    toolName: 'agent-handoff',
    args: {
      id: 'handoff-handoff-server', from: 'agent', to: 'reviewer', settled: false,
    },
  })

  const mission = convertEnvelope(envelope('learning_mission', {
    goal: '两周掌握线性代数核心概念', successCriteria: '能够独立解释向量空间', status: 'active',
  }), { participants, meId: 'me' }).content[0]
  assert.deepEqual(mission?.type === 'tool-call' ? { toolName: mission.toolName, args: mission.args } : null, {
    toolName: 'agent-plan',
    args: {
      id: 'mission-learning_mission-server',
      steps: ['两周掌握线性代数核心概念：能够独立解释向量空间'],
      activeIndex: 0,
    },
  })

  const attachment = convertEnvelope(envelope('attachment', kindData.attachment), { participants, meId: 'me' })
  assert.deepEqual(attachment.content, [{
    type: 'file', data: 'https://example.com/lesson.pdf', filename: 'lesson.pdf',
    mimeType: 'application/pdf', sourceType: 'url',
  }])
})

test('questionnaires preserve choices and freeform inputs for the question card', () => {
  const message = convertEnvelope(envelope('questionnaire', {
    title: '复习计划',
    items: [{
      name: 'time', prompt: '每天多久？', required: true,
      choices: [{ value: '30', label: '30 分钟', disabled: true }],
      input: { label: '其他时长', placeholder: '例如 45 分钟' },
    }],
  }), { participants, meId: 'me' })
  const part = message.content.find((item) => item.type === 'tool-call')
  assert.deepEqual(part?.type === 'tool-call' ? part.args : null, {
    id: 'questionnaire-questionnaire-server',
    title: '复习计划',
    items: [{
      name: 'time', prompt: '每天多久？', description: '', required: true, multiple: false,
      choices: [{ value: '30', label: '30 分钟', description: '', disabled: true }],
      input: { label: '其他时长', placeholder: '例如 45 分钟' },
    }],
    submitLabel: '提交',
  })
})

test('lecture deck artifacts use the dedicated presentation card renderer', () => {
  const message = convertEnvelope(envelope('artifact', {
    artifactId: 'presentation-1',
    artifactKind: 'lecture_deck_html',
    title: 'Evidence-led lecture',
  }), { participants, meId: 'me' })
  const part = message.content.find((item) => item.type === 'tool-call')
  assert.equal(part?.type === 'tool-call' ? part.toolName : null, 'presentation-artifact')
  assert.deepEqual(part?.type === 'tool-call' ? part.args : null, {
    artifactId: 'presentation-1',
    artifactKind: 'lecture_deck_html',
    title: 'Evidence-led lecture',
  })
})

test('batch conversion is stable, deduplicated, and projects sender grouping', () => {
  const first = envelope('tool_activity', kindData.tool_activity, { messageId: 'one', messageSeq: 1, timestamp: 1_767_225_600 })
  const second = envelope('tool_activity', kindData.tool_activity, { messageId: 'two', messageSeq: 2, timestamp: 1_767_225_610 })
  second.payload = { ...second.payload, clientMsgNo: 'two-client' }
  const duplicate = { ...second, messageSeq: 2 }
  const messages = convertEnvelopeBatch([second, first, duplicate], { participants, meId: 'me' })
  assert.deepEqual(messages.map((message) => message.id), ['one', 'two'])
  assert.equal(getLingxiMessageMetadata(messages[0]!).groupEnd, false)
  assert.equal(getLingxiMessageMetadata(messages[1]!).groupStart, false)
})

test('clusters adjacent text, attachments, and assistant-ui cards by sender rather than message kind', () => {
  const agentText = envelope('text', {}, { fromUid: 'agent', messageId: 'agent-text', messageSeq: 1, timestamp: 1_767_225_600 })
  const agentCard = envelope('approval', kindData.approval, { fromUid: 'agent', messageId: 'agent-card', messageSeq: 2, timestamp: 1_767_225_610 })
  agentCard.payload = { ...agentCard.payload, clientMsgNo: 'agent-card-client' }
  const mineText = envelope('text', {}, { messageId: 'mine-text', messageSeq: 3, timestamp: 1_767_226_000 })
  const mineAttachment = envelope('attachment', kindData.attachment, { fromUid: 'me', messageId: 'mine-attachment', messageSeq: 4, timestamp: 1_767_226_010 })
  mineAttachment.payload = { ...mineAttachment.payload, clientMsgNo: 'mine-attachment-client' }

  const messages = convertEnvelopeBatch([agentText, agentCard, mineText, mineAttachment], { participants, meId: 'me' })
  const metadata = messages.map(getLingxiMessageMetadata)

  assert.deepEqual(metadata.map(({ groupStart, groupEnd, isMine }) => ({ groupStart, groupEnd, isMine })), [
    { groupStart: true, groupEnd: false, isMine: false },
    { groupStart: false, groupEnd: true, isMine: false },
    { groupStart: true, groupEnd: false, isMine: true },
    { groupStart: false, groupEnd: true, isMine: true },
  ])
  assert.deepEqual(metadata.map(({ presentation }) => presentation), [
    'conversation',
    'special-card',
    'conversation',
    'special-card',
  ])
})

test('a card-first agent cluster inherits the following bubble chrome once', () => {
  const card = envelope('approval', kindData.approval, {
    fromUid: 'agent', messageId: 'agent-card', messageSeq: 1, timestamp: 1_767_225_600,
  })
  const text = envelope('text', {}, {
    fromUid: 'agent', messageId: 'agent-text', messageSeq: 2, timestamp: 1_767_225_610,
  })
  const messages = convertEnvelopeBatch([card, text], { participants, meId: 'me' })
  const chromeAt = messages[1]!.createdAt.toISOString()

  assert.deepEqual(messages.map((message) => getLingxiMessageMetadata(message).clusterChromeAt), [chromeAt, chromeAt])
})

test('group projection preserves messages whose cluster position did not change', () => {
  const messages = convertEnvelopeBatch([
    envelope('text', {}, { messageId: 'one', messageSeq: 1 }),
    envelope('text', {}, { messageId: 'two', messageSeq: 2, timestamp: 1_767_225_610 }),
  ], { participants, meId: 'me' })
  assert.deepEqual(projectMessageGroups(messages), messages)
  assert.equal(projectMessageGroups(messages)[0], messages[0])
  assert.equal(projectMessageGroups(messages)[1], messages[1])
})

test('unknown WuKong kinds fail closed at the transport conversion boundary', () => {
  const unknown = envelope('text')
  unknown.payload = { ...unknown.payload, kind: 'legacy-card' as LingxiMessageV1['kind'] }
  assert.throws(
    () => convertEnvelope(unknown, { participants, meId: 'me' }),
    /Unsupported WuKong message kind/,
  )
})

test('structured approvals use the assistant-ui approval gate as their only decision path', () => {
  const message = convertEnvelope(envelope('approval', {
    approval: { id: 'a-self', summary: 'Review', status: 'PENDING', kind: 'external_communication' },
    citations: [{ sourceId: 'source-1', sourceTitle: 'Evidence', excerpt: 'Quoted text', position: 0, marker: 'S1' }],
  }, { fromUid: 'me' }), { participants, meId: 'me' })
  assert.equal(message.role, 'assistant')
  assert.deepEqual(message.content.map((part) => part.type), ['tool-call'])
  assert.equal('citations' in getLingxiMessageMetadata(message), false)
  assert.deepEqual(message.content[0], {
    type: 'tool-call',
    toolCallId: 'approval:a-self',
    toolName: 'approval-card',
    args: {
      id: 'approval-a-self',
      question: 'Review',
      detail: '外部通信',
      confidenceLabel: '需要你的决定',
      acceptedLabel: '已批准',
      rejectedLabel: '已拒绝',
    },
    argsText: '{"id":"approval-a-self","question":"Review","detail":"外部通信","confidenceLabel":"需要你的决定","acceptedLabel":"已批准","rejectedLabel":"已拒绝"}',
    approval: { id: 'a-self' },
  })
})

test('agent text restores the native read_document result without rebuilding citations', () => {
  const input = envelope('text', {
    rag: {
      claims: [{ id: 'claim-1', text: 'hello', confidence: 'grounded', basis: 'Evidence', markers: ['S1'] }],
      documentReferences: [{
        marker: 'S1', sourceId: 'source-1', title: 'Evidence', pages: 7,
        anchors: [{ page: 7, quote: 'Quoted text' }],
      }],
    },
  }, { fromUid: 'agent' })
  input.payload.refs = { runId: 'run-1' }
  input.payload.body = '- [hello](#cite-S1)'
  const message = convertEnvelope(input, { participants, meId: 'me' })
  assert.deepEqual(message.content, [
    { type: 'text', text: '- [hello](#cite-S1)' },
    {
      type: 'tool-call', toolCallId: 'cite-claims:run-1', toolName: 'cite_claims',
      args: {}, argsText: '{}',
      result: { claims: [{ id: 'claim-1', text: 'hello', confidence: 'grounded', basis: 'Evidence', markers: ['S1'] }] },
    },
    {
      type: 'tool-call', toolCallId: 'read-document:run-1:S1', toolName: 'read_document',
      args: { sourceId: 'source-1', marker: 'S1' },
      argsText: '{"sourceId":"source-1","marker":"S1"}',
      result: { title: 'Evidence', pages: 7, anchors: [{ page: 7, quote: 'Quoted text' }] },
    },
  ])
  assert.equal(getLingxiMessageMetadata(message).presentation, 'conversation')
})

test('calendar creation approvals use the native generative event protocol', () => {
  const message = convertEnvelope(envelope('approval', {
    id: 'calendar-approval',
    summary: '确认创建安排：线性代数复习',
    status: 'PENDING',
    kind: 'calendar_create',
    payload: {
      action: 'calendar.create',
      args: { title: '线性代数复习', at: '2026-09-04T19:30:00+08:00' },
    },
  }), { participants, meId: 'me' })
  assert.deepEqual(message.content[0], {
    type: 'tool-call',
    toolCallId: 'approval:calendar-approval',
    toolName: 'calendar.create',
    args: { title: '线性代数复习', at: '2026-09-04T19:30:00+08:00' },
    argsText: '{"title":"线性代数复习","at":"2026-09-04T19:30:00+08:00"}',
    approval: { id: 'calendar-approval' },
  })
})

test('approval kinds use Chinese recommendation details', () => {
  const details = [
    'external_communication',
    'sensitive_or_destructive_action',
    'financial_or_irreversible_action',
  ].map((kind) => {
    const message = convertEnvelope(envelope('approval', { ...kindData.approval, kind }), { participants, meId: 'me' })
    const part = message.content[0]
    assert.equal(part?.type, 'tool-call')
    return (part!.args as { detail: string }).detail
  })
  assert.deepEqual(details, [
    '外部通信',
    '敏感或破坏性操作',
    '财务或不可逆操作',
  ])
})

test('teacher briefings map their single wire protocol to native checkpoints', () => {
  const message = convertEnvelope(envelope('system', {
    type: 'teacher_briefing',
    windowStartSequence: 12,
    windowEndSequence: 20,
    statistics: { eventCount: 8, attentionCount: 2 },
  }), { participants, meId: 'me' })
  assert.deepEqual(message.content[0], {
    type: 'tool-call',
    toolCallId: 'briefing:system-server',
    toolName: 'checkpoint-history',
    args: {
      id: 'briefing-system-server',
      checkpoints: [
        { id: 'briefing-system-server-eventCount', label: '学习更新', at: '序列 12–20', items: 8 },
        { id: 'briefing-system-server-attentionCount', label: '需要关注', at: '序列 12–20', items: 2 },
      ],
      currentId: 'briefing-system-server-attentionCount',
    },
    argsText: '{"id":"briefing-system-server","checkpoints":[{"id":"briefing-system-server-eventCount","label":"学习更新","at":"序列 12–20","items":8},{"id":"briefing-system-server-attentionCount","label":"需要关注","at":"序列 12–20","items":2}],"currentId":"briefing-system-server-attentionCount"}',
  })
})

test('agent text rejects retired markers instead of rebuilding confidence from citations', () => {
  const input = envelope('text', {
    rag: {
      claims: [{ id: 'claim-1', text: 'hello', confidence: 'grounded', basis: 'Evidence', markers: ['S1'] }],
      documentReferences: [{
        marker: 'S1', sourceId: 'source-1', title: 'Evidence', pages: 1,
        anchors: [{ page: 1, quote: 'Quoted text' }],
      }],
    },
  }, { fromUid: 'agent' })
  input.payload.refs = { runId: 'run-1' }
  input.payload.body = 'hello [S1]'
  assert.throws(() => convertEnvelope(input, { participants, meId: 'me' }), /retired bare citation marker/)
})
