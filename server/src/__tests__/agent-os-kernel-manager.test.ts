import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { KernelExecutionError, KernelManager } from '../../../third_party/lingxios/src/index.js'
import type { WorkItem } from '../../../third_party/lingxios/src/protocol/types.js'

function work(sessionId: string): WorkItem {
  return {
    id: `work-${sessionId}`, fence: 1, homeEpoch: 1, tenantId: 'company', agentId: 'agent', sessionId,
    triggerRef: `trigger-${sessionId}`, kind: 'turn', lane: 'interactive', leaseToken: `lease-${sessionId}`,
  }
}

test('real IPython kernels preserve session state and enforce the host allowlist', async () => {
  const homesRoot = await mkdtemp(resolve(tmpdir(), 'lingxiloop-kernel-'))
  const hostCalls: string[] = []
  const hostEvents: unknown[] = []
  const manager = new KernelManager({
    execute: async (_work, action) => {
      hostCalls.push(action.action)
      return { ok: true, value: { documentId: (action.args as { documentId?: string }).documentId } }
    },
  }, {
    homesRoot,
    runnerPath: resolve('third_party/lingxios/kernel/runner.py'),
    executionTimeoutMs: 30_000,
    maxOutputChars: 8_000,
    maxKernels: 2,
  })
  const first = work('one')
  const access = { capabilities: [{ name: 'documents', methods: ['read'] }] }
  try {
    await manager.execute(first, first.id, 'cell-1', 'value = 41', undefined, access)
    const persisted = await manager.execute(first, first.id, 'cell-2', 'value + 1', undefined, access)
    assert.equal(persisted.result, 42)

    const isolated = await manager.execute(work('two'), 'work-two', 'cell-1', 'session = "two"\nglobals().get("value")', undefined, access)
    assert.equal(isolated.result, null)

    const hostResult = await manager.execute(first, first.id, 'cell-3', 'host.documents.read(documentId="doc-1")', undefined, {
      ...access,
      onHostAction: async (event) => { hostEvents.push(event) },
    })
    assert.deepEqual(hostResult.result, { documentId: 'doc-1' })
    assert.deepEqual(hostCalls, ['documents.read'])
    assert.deepEqual(hostEvents, [
      {
        stage: 'started',
        action: {
          runId: first.id, cellId: 'cell-3', callIndex: 0, action: 'documents.read',
          args: { documentId: 'doc-1' }, idempotencyKey: `${first.id}:cell-3:0`,
        },
      },
      {
        stage: 'completed',
        action: {
          runId: first.id, cellId: 'cell-3', callIndex: 0, action: 'documents.read',
          args: { documentId: 'doc-1' }, idempotencyKey: `${first.id}:cell-3:0`,
        },
        result: { ok: true, value: { documentId: 'doc-1' } },
      },
    ])

    await assert.rejects(
      manager.execute(first, first.id, 'cell-4', 'host.documents.delete(documentId="doc-1")', undefined, access),
      KernelExecutionError,
    )
    const large = await manager.execute(first, first.id, 'cell-5', '"x" * 20000', undefined, access)
    const largeResult = large.result as { truncated?: boolean; preview?: string }
    assert.equal(largeResult.truncated, true)
    assert.equal(typeof largeResult.preview, 'string')
    assert.ok((largeResult.preview?.length ?? 0) < 8_000)

    const third = work('three')
    await manager.execute(third, third.id, 'cell-1', 'session = "three"', undefined, access)
    assert.equal(manager.size, 2)
    assert.equal((await manager.execute(first, first.id, 'cell-6', 'value', undefined, access)).result, 41)
    assert.equal((await manager.execute(work('two'), 'work-two', 'cell-2', 'globals().get("session")', undefined, access)).result, null)
  } finally {
    manager.close()
    await rm(homesRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

test('kernel capacity waits for a busy kernel instead of killing it', async () => {
  const homesRoot = await mkdtemp(resolve(tmpdir(), 'lingxiloop-kernel-capacity-'))
  const manager = new KernelManager({ execute: async () => ({ ok: true, value: null }) }, {
    homesRoot,
    runnerPath: resolve('third_party/lingxios/kernel/runner.py'),
    executionTimeoutMs: 30_000,
    maxKernels: 1,
  })
  try {
    const first = work('busy-one')
    const second = work('busy-two')
    const firstExecution = manager.execute(first, first.id, 'cell-1', 'import time\ntime.sleep(0.1)\n"first"')
    const secondExecution = manager.execute(second, second.id, 'cell-1', '"second"')
    assert.equal(manager.sweepIdle(Number.MAX_SAFE_INTEGER), 0)
    const [firstResult, secondResult] = await Promise.all([firstExecution, secondExecution])
    assert.equal(firstResult.result, 'first')
    assert.equal(secondResult.result, 'second')
    assert.equal(manager.size, 1)
  } finally {
    manager.close()
    await rm(homesRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

test('a new Home epoch cannot revive stale variables or files', async () => {
  const homesRoot = await mkdtemp(resolve(tmpdir(), 'lingxiloop-kernel-epoch-'))
  const manager = new KernelManager({ execute: async () => ({ ok: true, value: null }) }, {
    homesRoot,
    runnerPath: resolve('third_party/lingxios/kernel/runner.py'),
    executionTimeoutMs: 30_000,
    maxKernels: 2,
  })
  const firstEpoch = { ...work('epoch'), homeEpoch: 1 }
  const secondEpoch = { ...firstEpoch, homeEpoch: 2 }
  try {
    await manager.execute(firstEpoch, firstEpoch.id, 'cell-1', 'value = 41\nopen("state.txt", "w").write("old")')
    assert.deepEqual(
      (await manager.execute(secondEpoch, secondEpoch.id, 'cell-1', 'import pathlib\n[globals().get("value"), pathlib.Path("state.txt").exists()]')).result,
      [null, false],
    )
    assert.deepEqual(
      (await manager.execute(firstEpoch, firstEpoch.id, 'cell-2', 'import pathlib\n[value, pathlib.Path("state.txt").read_text()]')).result,
      [41, 'old'],
    )
  } finally {
    manager.close()
    await rm(homesRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
