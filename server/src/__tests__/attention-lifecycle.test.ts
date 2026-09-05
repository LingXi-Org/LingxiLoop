import assert from 'node:assert/strict'
import test from 'node:test'
import {
  transitionAttention,
  type AttentionCommand,
  type AttentionStatus,
} from '../domain/attention/public.js'

test('Attention supports acknowledge, defer, resolve, and dismiss without reopening terminal items', () => {
  const cases: Array<[AttentionStatus, AttentionCommand, unknown]> = [
    ['OPEN', 'ACKNOWLEDGE', { outcome: 'APPLIED', status: 'ACKNOWLEDGED' }],
    ['ACKNOWLEDGED', 'DEFER', { outcome: 'APPLIED', status: 'DEFERRED' }],
    ['DEFERRED', 'ACKNOWLEDGE', { outcome: 'APPLIED', status: 'ACKNOWLEDGED' }],
    ['OPEN', 'RESOLVE', { outcome: 'APPLIED', status: 'RESOLVED' }],
    ['OPEN', 'DISMISS', { outcome: 'APPLIED', status: 'DISMISSED' }],
    ['RESOLVED', 'RESOLVE', { outcome: 'ALREADY_APPLIED', status: 'RESOLVED' }],
    ['DISMISSED', 'DISMISS', { outcome: 'ALREADY_APPLIED', status: 'DISMISSED' }],
    ['RESOLVED', 'ACKNOWLEDGE', { outcome: 'INVALID', status: 'RESOLVED' }],
    ['DISMISSED', 'DEFER', { outcome: 'INVALID', status: 'DISMISSED' }],
  ]
  for (const [status, command, expected] of cases) {
    assert.deepEqual(transitionAttention(status, command), expected)
  }
})
