import assert from 'node:assert/strict'
import test from 'node:test'
import { hardApprovalForAction, requiredCapabilityForAction } from '../agents/action-policy.js'

test('executor capability mapping centrally enforces computer, email, and documents', () => {
  assert.equal(requiredCapabilityForAction({ type: 'computer.screenshot', screenId: 'screen-1' }), 'computer')
  assert.equal(requiredCapabilityForAction({ type: 'computer.browser.open', screenId: 'screen-1', url: 'https://example.com' }), 'computer')
  assert.equal(requiredCapabilityForAction({ type: 'email.reply', messageId: 'mail-1', body: 'ok' }), 'email')
  assert.equal(requiredCapabilityForAction({ type: 'document.read', documentId: 'doc-1' }), 'documents')
  assert.equal(requiredCapabilityForAction({ type: 'message.send', conversationId: 'c-1', body: 'ok' }), null)
})

test('hard risk policy is fail-closed for wrappers and browser coordinate clicks', () => {
  for (const command of [
    ['rm', '-rf', '/workspace/x'],
    ['sh', '-lc', 'rm -rf /workspace/x'],
    ['python', '-c', 'import os; os.remove("/workspace/x")'],
    ['env', 'rm', '-rf', '/workspace/x'],
  ]) {
    const gate = hardApprovalForAction({ type: 'computer.exec', screenId: 'screen-1', command })
    assert.equal(gate?.kind, 'sensitive_or_destructive_action')
  }
  assert.equal(hardApprovalForAction({
    type: 'computer.browser.click', targetId: 'target-1', x: 10, y: 20,
  })?.kind, 'financial_or_irreversible_action')
  assert.equal(hardApprovalForAction({
    type: 'computer.exec', screenId: 'screen-1', command: ['rg', 'needle', '/workspace'],
  }), null)
})

test('external communication always requires approval and persists the exact action', () => {
  const action = { type: 'email.send' as const, to: ['person@example.com'], subject: 'Status', body: 'Done' }
  const gate = hardApprovalForAction(action)
  assert.equal(gate?.kind, 'external_communication')
  assert.deepEqual(gate?.blockedAction, action)
})

test('generic approval fails closed when it does not carry a typed exact action', () => {
  const gate = hardApprovalForAction({
    type: 'approval.request', conversationId: 'c-1', kind: 'financial_or_irreversible_action',
    summary: 'Approve', payload: { explanation: 'missing action' },
  })
  assert.deepEqual(gate?.blockedAction, {})
})
