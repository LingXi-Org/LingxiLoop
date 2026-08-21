import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CLI_SIDE_EFFECT_WRITE_FAILED_PREFIX,
  cliResultHasReplySideEffect,
  cliResultSideEffectChannelUnreliable,
  normalizeCliSideEffects,
  parseCliSideEffectsJsonl,
  parseCliSideEffectsJsonlDetailed,
  parseCliSideEffectsWriteFailureMarker,
} from '../agents/cli-result.js'

test('parseCliSideEffectsJsonl collects valid CLI side effects and ignores malformed lines', () => {
  const effects = parseCliSideEffectsJsonl([
    JSON.stringify({ sideEffects: [{ event: 'message.posted', command: 'reply', messageId: 'm-1' }] }),
    'not json',
    JSON.stringify([{ event: 'reaction.updated', command: 'react', messageId: 'm-2' }]),
    JSON.stringify({ sideEffects: [{ command: 'reply' }, null, { event: '' }] }),
  ].join('\n'))

  assert.deepEqual(effects, [
    { event: 'message.posted', command: 'reply', messageId: 'm-1' },
    { event: 'reaction.updated', command: 'react', messageId: 'm-2' },
  ])
})

test('parseCliSideEffectsJsonlDetailed reports malformed side-effect lines', () => {
  const result = parseCliSideEffectsJsonlDetailed([
    JSON.stringify({ sideEffects: [{ event: 'message.posted', command: 'reply', messageId: 'm-1' }] }),
    'not json',
    '{',
  ].join('\n'))

  assert.deepEqual(result.sideEffects, [
    { event: 'message.posted', command: 'reply', messageId: 'm-1' },
  ])
  assert.equal(result.malformedLineCount, 2)
})

test('parseCliSideEffectsWriteFailureMarker recovers shim diagnostics', () => {
  const marker = `${CLI_SIDE_EFFECT_WRITE_FAILED_PREFIX}${JSON.stringify([{ event: 'message.posted', command: 'reply', messageId: 'm-1' }])}`

  assert.deepEqual(parseCliSideEffectsWriteFailureMarker(`noise\n${marker}\n`), [
    { event: 'message.posted', command: 'reply', messageId: 'm-1' },
  ])
})

test('cliResultHasReplySideEffect only treats typed reply posts as visible replies', () => {
  assert.equal(cliResultHasReplySideEffect({
    sideEffects: [{ event: 'message.posted', command: 'reply', visibleToUser: true }],
  }), true)

  assert.equal(cliResultHasReplySideEffect({
    sideEffects: [{ event: 'message.posted', command: 'dm', visibleToUser: true }],
  }), false)

  assert.equal(cliResultHasReplySideEffect({
    sideEffects: [{ event: 'message.posted', command: 'reply', visibleToUser: false }],
  }), false)
})

test('cliResultSideEffectChannelUnreliable detects parse/read/write failures', () => {
  assert.equal(cliResultSideEffectChannelUnreliable({ sideEffectsParseFailed: true }), true)
  assert.equal(cliResultSideEffectChannelUnreliable({ sideEffectsReadFailed: true }), true)
  assert.equal(cliResultSideEffectChannelUnreliable({ sideEffectsWriteFailed: true }), true)
  assert.equal(cliResultSideEffectChannelUnreliable({ sideEffects: [] }), false)
})

test('normalizeCliSideEffects filters non-event values', () => {
  assert.deepEqual(normalizeCliSideEffects([
    { event: 'memory.written', memoryId: 'mem-1' },
    { event: '' },
    { command: 'reply' },
    null,
  ]), [{ event: 'memory.written', memoryId: 'mem-1' }])
})
