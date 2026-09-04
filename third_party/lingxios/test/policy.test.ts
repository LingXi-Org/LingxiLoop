import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DefaultRuntimePolicy } from '../src/runtime/policy.js'
import type { ContextMessage, PromptContext, TurnContext, WorkItem } from '../src/protocol/types.js'

function work(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'w1', fence: 1, homeEpoch: 1, tenantId: 't1', agentId: 'a1', sessionId: 's1',
    kind: 'turn', lane: 'interactive', triggerRef: 'm1', leaseToken: 'tok', ...overrides,
  }
}

function message(overrides: Partial<ContextMessage> = {}): ContextMessage {
  return {
    ref: 'm1', authorId: 'u1', authorName: 'Alice', authorKind: 'human',
    body: 'hello there', createdAt: '2026-01-01T00:00:00Z', ...overrides,
  }
}

function context(overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    work: work(), persona: { name: 'Bot', role: 'assistant', instructions: 'Be helpful.' },
    capabilities: ['fs', 'email'], messages: [message()], ...overrides,
  }
}

function promptContext(overrides: Partial<PromptContext> = {}): PromptContext {
  return {
    version: 2, epoch: 1, assembledAt: '2026-01-01T00:00:00Z',
    systemInstructions: '', persona: { name: 'Bot', role: 'assistant', instructions: 'Be helpful.' },
    capabilities: ['fs', 'email'], sourceVersions: {}, ...overrides,
  }
}

describe('DefaultRuntimePolicy.kernelCapabilities', () => {
  it('grants the persona-declared capabilities verbatim, without method restrictions', () => {
    const policy = new DefaultRuntimePolicy()
    const grants = policy.kernelCapabilities(context({ capabilities: ['fs', 'email'] }))
    assert.deepEqual(grants, [{ name: 'fs' }, { name: 'email' }])
  })
})

describe('DefaultRuntimePolicy.assembleSystemPrompt', () => {
  it('includes the tooling preamble, persona block, and granted capabilities', () => {
    const policy = new DefaultRuntimePolicy()
    const prompt = policy.assembleSystemPrompt(promptContext())
    assert.match(prompt, /You are an agent running on the LingxiOS Agent OS/)
    assert.match(prompt, /Name: Bot/)
    assert.match(prompt, /Role: assistant/)
    assert.match(prompt, /Be helpful\./)
    assert.match(prompt, /- host\.fs/)
    assert.match(prompt, /- host\.email/)
  })

  it('omits the capabilities section when none are granted', () => {
    const policy = new DefaultRuntimePolicy()
    const prompt = policy.assembleSystemPrompt(promptContext({ capabilities: [] }))
    assert.doesNotMatch(prompt, /# Granted capabilities/)
  })
})

describe('DefaultRuntimePolicy.dynamicContextItems', () => {
  it('always returns empty (no product-specific dynamic context)', () => {
    const policy = new DefaultRuntimePolicy()
    assert.deepEqual(policy.dynamicContextItems(), [])
  })
})

describe('DefaultRuntimePolicy.turnInputItems', () => {
  it('renders only the trigger message when history already exists', () => {
    const policy = new DefaultRuntimePolicy()
    const trigger = message({ ref: 'm1', body: 'trigger body' })
    const other = message({ ref: 'm2', body: 'unrelated' })
    const items = policy.turnInputItems(context({ messages: [other, trigger] }), true)
    assert.equal(items.length, 1)
    assert.equal((items[0] as { role: string }).role, 'user')
    assert.match((items[0] as { content: string }).content, /trigger body/)
    assert.doesNotMatch((items[0] as { content: string }).content, /unrelated/)
  })

  it('renders the last 20 messages when there is no history yet', () => {
    const policy = new DefaultRuntimePolicy()
    const messages = Array.from({ length: 25 }, (_, i) => message({ ref: `m${i}`, body: `body ${i}` }))
    const items = policy.turnInputItems(context({ messages }), false)
    assert.equal(items.length, 1)
    const content = (items[0] as { content: string }).content
    assert.doesNotMatch(content, /body 4\n/)
    assert.match(content, /body 24/)
  })

  it('returns empty when there is history but the trigger message is missing', () => {
    const policy = new DefaultRuntimePolicy()
    const items = policy.turnInputItems(context({ messages: [message({ ref: 'other' })] }), true)
    assert.deepEqual(items, [])
  })
})

describe('DefaultRuntimePolicy.validateAssistantText', () => {
  const policy = new DefaultRuntimePolicy()

  it('accepts plain user-visible text', () => {
    assert.equal(policy.validateAssistantText('Here is your answer.'), null)
  })

  it('rejects hidden reasoning or tool-call markup', () => {
    assert.match(policy.validateAssistantText('<thinking>secret</thinking>done') ?? '', /hidden reasoning/)
  })

  it('rejects text that references the host SDK module', () => {
    assert.match(policy.validateAssistantText('call host.fs.read(path="x")') ?? '', /SDK or tool code/)
  })

  it('rejects text that shows ipython code fences', () => {
    const text = '```ipython\nprint(1)\n```'
    assert.match(policy.validateAssistantText(text) ?? '', /SDK or tool code/)
  })
})

describe('DefaultRuntimePolicy.completionGate', () => {
  it('always allows completion', () => {
    const policy = new DefaultRuntimePolicy()
    assert.deepEqual(policy.completionGate(), { allowed: true })
  })
})
