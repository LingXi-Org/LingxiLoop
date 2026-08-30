import assert from 'node:assert/strict'
import test from 'node:test'
import type { Message, MessageKind, Participant } from '@/types'
import { createLingxiAssistantMessage, type LingxiImMessageCustom } from './assistantMessage'

const participants: Record<string, Participant> = {
  me: { id: 'me', kind: 'human', name: 'Me', initial: 'M', avatarBg: '#fff', status: 'avail' },
  agent: { id: 'agent', kind: 'agent', name: 'Nova', initial: 'N', avatarBg: '#000', avatarUrl: '/nova.png', status: 'working' },
}

function message(kind: MessageKind, patch: Partial<Message> = {}): Message {
  return {
    id: `message-${kind}`,
    conversationId: 'room',
    authorId: kind === 'system' ? 'system' : 'agent',
    kind,
    body: `${kind} body`,
    at: '10:00',
    createdAt: '2026-08-26T10:00:00.000Z',
    sequence: 7,
    ...patch,
  }
}

test('converts every Lingxi MessageKind into assistant-ui parts without hiding payloads', () => {
  const messages: Message[] = [
    message('text'),
    message('tool', { tool: { name: 'search', arg: 'q', status: 'completed', detail: 'ok' } }),
    message('attachment', { body: '', attachment: { name: 'report.pdf', kind: 'pdf', url: 'https://files.test/report.pdf' } }),
    message('thought'),
    message('system'),
    message('email', { email: { subject: 'Hi', from: 'a@b.test', to: ['c@d.test'], cc: [], direction: 'out', transportStatus: 'sent' } }),
    message('questionnaire', { questionnaire: { title: 'Clarify', items: [{ name: 'scope', prompt: 'Which scope?', required: true, choices: [{ value: 'one', label: 'One' }] }] } }),
    message('poll', { poll: { question: 'Choose', mode: 'single', options: [{ id: 'a', text: 'A' }], expiresAt: null, closedAt: null, closedReason: null } }),
    message('handoff', { handoff: { id: 'h', fromAgentId: 'agent', toAgentId: 'agent-2', title: 'Handoff', status: 'working', sharedPaths: [], browserTargets: [] } }),
    message('approval', { approval: { id: 'a', agentId: 'agent', kind: 'course_management', summary: 'Publish', status: 'PENDING', payload: {}, requestedAt: '2026-08-26T10:00:00.000Z' } }),
    message('canvas', { canvas: { canvasId: 'canvas', title: 'Canvas', goal: 'Goal', status: 'active', members: [], frameCount: 0 } }),
    message('learning_mission', { learningMission: { missionId: 'mission', projectId: 'project', goal: 'Goal', successCriteria: 'Done', status: 'ACTIVE' } }),
  ]
  const expected = ['text', 'tool-call', 'file', 'reasoning', 'text', 'data', 'data', 'data', 'data', 'tool-call', 'data', 'data']
  messages.forEach((item, index) => {
    const converted = createLingxiAssistantMessage(item, index, messages, participants, 'me')
    assert.ok(Array.isArray(converted.content))
    assert.equal(converted.content.some((part) => part.type === expected[index]), true)
    assert.equal(converted.id, item.id)
  })
})

test('maps roles independently from IM alignment and exposes stable custom metadata', () => {
  const mine = message('text', { id: 'mine', authorId: 'me', sequence: 11, pending: true })
  const agent = message('text', { id: 'agent-message', authorId: 'agent', sequence: 12 })
  const system = message('system', { id: 'system-message', sequence: 13 })
  const list = [mine, agent, system]
  const mineConverted = createLingxiAssistantMessage(mine, 0, list, participants, 'me')
  const agentConverted = createLingxiAssistantMessage(agent, 1, list, participants, 'me')
  const systemConverted = createLingxiAssistantMessage(system, 2, list, participants, 'me')
  assert.equal(mineConverted.role, 'user')
  assert.equal(agentConverted.role, 'assistant')
  assert.equal(systemConverted.role, 'system')
  assert.equal(mineConverted.status, undefined)
  assert.equal(systemConverted.status, undefined)
  assert.equal(agentConverted.status?.type, 'complete')
  const metadata = mineConverted.metadata?.custom as unknown as LingxiImMessageCustom
  assert.equal(metadata.schema, 'lingxi.im.message.v1')
  assert.equal(metadata.message, mine)
  assert.equal(metadata.isMine, true)
  assert.equal(metadata.sequence, 11)
  assert.equal(metadata.sendStatus, 'sending')
  assert.equal(metadata.originalKind, 'text')
  assert.equal(metadata.conversationId, 'room')
  assert.equal(agentConverted.metadata?.custom?.senderAvatar, '/nova.png')
})

test('projects continuous grouping and streaming/failure states', () => {
  const first = message('text', { id: 'first', createdAt: '2026-08-26T10:00:00.000Z' })
  const second = message('text', { id: 'second', createdAt: '2026-08-26T10:01:00.000Z', streaming: 'markdown' })
  const failedHuman = message('text', { id: 'failed-human', authorId: 'me', failed: true })
  const failedAgent = message('text', { id: 'failed-agent', authorId: 'agent', failed: true })
  const list = [first, second, failedHuman, failedAgent]
  const left = createLingxiAssistantMessage(first, 0, list, participants, 'me')
  const right = createLingxiAssistantMessage(second, 1, list, participants, 'me')
  const humanError = createLingxiAssistantMessage(failedHuman, 2, list, participants, 'me')
  const agentError = createLingxiAssistantMessage(failedAgent, 3, list, participants, 'me')
  assert.ok(left.metadata?.custom)
  assert.ok(right.metadata?.custom)
  assert.equal((left.metadata.custom as unknown as LingxiImMessageCustom).groupEnd, false)
  assert.equal((right.metadata.custom as unknown as LingxiImMessageCustom).groupStart, false)
  assert.equal(right.status?.type, 'running')
  assert.equal(humanError.status, undefined)
  assert.ok(humanError.metadata?.custom)
  assert.equal((humanError.metadata.custom as unknown as LingxiImMessageCustom).sendStatus, 'failed')
  assert.equal(agentError.status?.type, 'incomplete')
})

test('projects Teacher Briefing, Attention, and Evidence as native assistant-ui data parts', () => {
  const briefing = message('system', { teacherBriefing: { briefingId: 'briefing-1', windowStartSequence: 10, windowEndSequence: 20, statistics: { eventCount: 3, attentionCount: 1 }, attentionItemIds: ['attention-1'] } })
  const converted = createLingxiAssistantMessage(briefing, 0, [briefing], participants, 'me')
  assert.ok(Array.isArray(converted.content))
  const content = converted.content as Exclude<typeof converted.content, string>
  assert.equal(converted.role, 'assistant')
  assert.deepEqual(content.map((part) => part.type === 'data' ? part.name : part.type), [
    'lingxi_teacher_briefing', 'lingxi_attention', 'lingxi_evidence',
  ])
  assert.ok(converted.metadata?.custom)
  assert.equal((converted.metadata.custom as unknown as LingxiImMessageCustom).presentation.variant, 'standard')
})

test('keeps plain and empty system events within the assistant-ui single-text-part contract', () => {
  for (const body of ['member joined', '']) {
    const system = message('system', { id: `system-${body.length}`, body })
    const converted = createLingxiAssistantMessage(system, 0, [system], participants, 'me')
    assert.equal(converted.role, 'system')
    assert.deepEqual(converted.content, [{ type: 'text', text: body }])
  }
})
