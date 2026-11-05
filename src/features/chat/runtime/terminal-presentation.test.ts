import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ThreadMessage } from '@assistant-ui/react'
import { createRunView } from '@lingxi-org/lingxios/ui'
import { savedPartialWork, terminalFailurePresentation } from './terminal-presentation'

function reply(status = 'completed', version = 1) {
  return { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'save', toolName: 'slides.write_files',
    result: { status }, providerMetadata: { lingxiloop: { activity: { version: 1, id: 'save', kind: 'tool', label: '保存', requestVersion: version } } } }],
  status: { type: 'incomplete', reason: 'error' }, metadata: { custom: { runId: 'run', harness: { ...createRunView('run'),
    lifecycle: 'partial', requestVersion: 1, artifacts: [], goalOutcome: { status: 'partial', requestVersion: 1 } } } } } as unknown as ThreadMessage
}

test('completed current save receipts distinguish saved work from unfinished checks and reply across replay', () => {
  const message = reply()
  assert.equal(savedPartialWork(message), true)
  assert.match(terminalFailurePresentation(message)!.title, /作品已保存/)
  assert.doesNotMatch(terminalFailurePresentation(message)!.title, /已完成/)
  assert.deepEqual(terminalFailurePresentation(JSON.parse(JSON.stringify(message))), terminalFailurePresentation(message))
})

test('unknown, failed, stale and preview-only writes never establish saved work', () => {
  for (const status of ['failed', 'unknown', 'cancelled']) assert.equal(savedPartialWork(reply(status)), false)
  assert.equal(savedPartialWork(reply('completed', 2)), false)
  const message = reply()
  assert.equal(savedPartialWork({ ...message, content: [{ type: 'text', text: '我已经保存了十页。' }] }), false)
  const value = message.metadata.custom as { harness: { requestVersion: number } }
  value.harness.requestVersion = 2
  assert.equal(savedPartialWork(message), false)
})
