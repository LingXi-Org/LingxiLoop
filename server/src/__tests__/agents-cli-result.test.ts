import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cliResultHasReplySideEffect,
  normalizeCliSideEffects,
} from '../agents/cli-result.js'

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

test('normalizeCliSideEffects filters non-event values', () => {
  assert.deepEqual(normalizeCliSideEffects([
    { event: 'memory.written', memoryId: 'mem-1' },
    { event: '' },
    { command: 'reply' },
    null,
  ]), [{ event: 'memory.written', memoryId: 'mem-1' }])
})
