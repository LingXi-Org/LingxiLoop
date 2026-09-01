import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { KernelExecutionError, KernelManager } from '../agent-os/kernel-manager.js'
import type { AgentWorkItem } from '../agent-os/types.js'

function work(channelId: string): AgentWorkItem {
  return {
    id: `work-${channelId}`, fence: 1, companyId: 'company', agentId: 'agent', channelId,
    triggerClientMsgNo: `trigger-${channelId}`, reason: 'message', executionRole: 'coordinator',
    lane: 'learner', leaseToken: `lease-${channelId}`,
  }
}

test('real IPython kernels preserve session state and enforce the loop allowlist', async () => {
  const homesRoot = await mkdtemp(resolve(tmpdir(), 'lingxiloop-kernel-'))
  const hostCalls: string[] = []
  const manager = new KernelManager({
    execute: async (_work, action) => {
      hostCalls.push(action.action)
      return { ok: true, value: { documentId: (action.args as { documentId?: string }).documentId } }
    },
  }, {
    homesRoot,
    runnerPath: resolve('server/agent-os/kernel_runner.py'),
    executionTimeoutMs: 30_000,
    maxOutputChars: 8_000,
  })
  const first = work('one')
  const access = { allowedNamespaces: ['documents'], allowedMethods: { documents: ['read'] } }
  try {
    await manager.execute(first, first.id, 'cell-1', 'value = 41', undefined, access)
    const persisted = await manager.execute(first, first.id, 'cell-2', 'value + 1', undefined, access)
    assert.equal(persisted.result, 42)

    const isolated = await manager.execute(work('two'), 'work-two', 'cell-1', 'globals().get("value")', undefined, access)
    assert.equal(isolated.result, null)

    const hostResult = await manager.execute(first, first.id, 'cell-3', 'loop.documents.read(documentId="doc-1")', undefined, access)
    assert.deepEqual(hostResult.result, { documentId: 'doc-1' })
    assert.deepEqual(hostCalls, ['documents.read'])

    await assert.rejects(
      manager.execute(first, first.id, 'cell-4', 'loop.documents.delete(documentId="doc-1")', undefined, access),
      KernelExecutionError,
    )
    const large = await manager.execute(first, first.id, 'cell-5', '"x" * 20000', undefined, access)
    const largeResult = large.result as { truncated?: boolean; preview?: string }
    assert.equal(largeResult.truncated, true)
    assert.equal(typeof largeResult.preview, 'string')
    assert.ok((largeResult.preview?.length ?? 0) < 8_000)
  } finally {
    manager.close()
    await rm(homesRoot, { recursive: true, force: true })
  }
})
