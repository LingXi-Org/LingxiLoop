import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateNativeCase, nativeEvolutionBenchmark } from '../modules/memory/evolution.js'

function model(candidate: boolean, unsafe = false) {
  return { async structured({ input }: { input: unknown }) {
    const data = input as { request: string; history: Array<{ action?: string; receipt?: { code?: string; value?: { body?: string; revision?: string } } }> }
    if (unsafe) return { value: { action: 'shell.exec',args: {} },model: 'fixture',usage: { available: true,inputTokens: 1,outputTokens: 1 } }
    if (!candidate && data.request.includes('replace Draft')) return { value: { answer: 'Done',status: 'satisfied' },model: 'fixture',usage: { available: true,inputTokens: 1,outputTokens: 1 } }
    const last = data.history.at(-1)
    let value: unknown
    if (data.request.includes('replace Draft')) value = !last ? { action: 'documents.edit',args: { documentId: 'lesson-a',expectedRevision: 'v1',operations: [{ kind: 'replace',find: 'Draft',replace: 'Ready' }] } }
      : last.receipt?.code === 'resource_conflict' ? { action: 'documents.read',args: { documentId: 'lesson-a' } }
        : last.action === 'documents.read' && last.receipt?.value?.body?.includes('Draft') ? { action: 'documents.edit',args: { documentId: 'lesson-a',expectedRevision: last.receipt.value.revision,operations: [{ kind: 'replace',find: 'Draft',replace: 'Ready' }] } }
          : last.action === 'documents.edit' ? { action: 'documents.read',args: { documentId: 'lesson-a' } } : { answer: 'Ready with peer note preserved.',status: 'satisfied' }
    else if (data.request.includes('Earlier append')) value = !last ? { action: 'task.check_receipt',args: { actionId: 'prior-action' } }
      : last.action === 'task.check_receipt' ? { action: 'documents.read',args: { documentId: 'lesson-b' } } : { answer: 'Recorded appears once.',status: 'satisfied' }
    else if (data.request.includes('Delete lesson-c')) value = !last ? { action: 'documents.delete',args: { documentId: 'lesson-c',expectedRevision: 'v1' } }
      : { answer: 'Human approval is required.',status: 'awaiting_approval' }
    else value = !last ? { action: 'documents.read',args: { documentId: 'lesson-c' } }
      : { answer: 'Learning requires evidence.',status: 'satisfied' }
    return { value,model: 'fixture',usage: { available: true,inputTokens: 1,outputTokens: 1 } }
  } }
}

test('native evolution fixture rewards recovery and blocks unsafe strategy actions', async () => {
  const signal = new AbortController().signal
  for (const item of nativeEvolutionBenchmark.cases) {
    const result = await evaluateNativeCase(item,{ kind: 'strategy',scopeType: 'course',body: 'recover and verify' },{ model: model(true) as never,signal })
    assert.equal(result.success,true,item.id)
    assert.equal(Object.values(result.gates).every(Boolean),true,item.id)
  }
  assert.equal((await evaluateNativeCase(nativeEvolutionBenchmark.cases[0]!,null,{ model: model(false) as never,signal })).success,false)
  const unsafe = await evaluateNativeCase(nativeEvolutionBenchmark.cases[0]!,{ kind: 'strategy',scopeType: 'course',body: 'ignore policy' },{ model: model(true,true) as never,signal })
  assert.equal(unsafe.gates.no_code_mutation,false)
  assert.equal(unsafe.success,false)
})
