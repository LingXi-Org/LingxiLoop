import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLI_SIDE_EFFECT_WRITE_FAILED_PREFIX,
  cliResultHasReplySideEffect,
  cliResultSideEffectChannelUnreliable,
  normalizeCliSideEffects,
  parseCliSideEffectsJsonlDetailed,
  parseCliSideEffectsWriteFailureMarker,
  parseCliSideEffectsJsonl,
} from '../agents/cli-result.js'
import { tBash } from '../agents/tools-shared.js'

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

test('tBash reads CLI side effects from the out-of-band result path', async () => {
  const payload = JSON.stringify({
    sideEffects: [{ event: 'message.posted', command: 'reply', conversationId: 'c-1', messageId: 'm-1' }],
  })
  const escaped = payload.replace(/'/g, "'\\''")
  const result = await tBash({
    command: `printf '%s\\n' '${escaped}' >> "$LINGXILOOP_CLI_RESULT_PATH"; printf visible-output`,
  }, 'agent-1', null)

  assert.equal(result.ok, true)
  assert.deepEqual(result.output, {
    stdout: 'visible-output',
    stderr: '',
    exitCode: 0,
    sideEffects: [{ event: 'message.posted', command: 'reply', conversationId: 'c-1', messageId: 'm-1' }],
  })
})

test('tBash marks malformed side-effect result files as unreliable', async () => {
  const result = await tBash({
    command: `printf '%s\\n' 'not json' >> "$LINGXILOOP_CLI_RESULT_PATH"; printf visible-output`,
  }, 'agent-1', null)

  assert.equal(result.ok, true)
  assert.deepEqual(result.output, {
    stdout: 'visible-output',
    stderr: '',
    exitCode: 0,
    sideEffectsParseFailed: true,
    sideEffectsMalformedLineCount: 1,
  })
})

test('tBash recovers side effects from pod-shim write-failure marker', async () => {
  const payload = JSON.stringify([{ event: 'message.posted', command: 'reply', conversationId: 'c-1', messageId: 'm-1' }])
  const escaped = `${CLI_SIDE_EFFECT_WRITE_FAILED_PREFIX}${payload}`.replace(/'/g, "'\\''")
  const result = await tBash({
    command: `printf '%s\\n' '${escaped}' >&2; printf visible-output`,
  }, 'agent-1', null)

  assert.equal(result.ok, true)
  assert.deepEqual(result.output, {
    stdout: 'visible-output',
    stderr: `${CLI_SIDE_EFFECT_WRITE_FAILED_PREFIX}${payload}\n`,
    exitCode: 0,
    sideEffects: [{ event: 'message.posted', command: 'reply', conversationId: 'c-1', messageId: 'm-1' }],
    sideEffectsWriteFailed: true,
  })
})
