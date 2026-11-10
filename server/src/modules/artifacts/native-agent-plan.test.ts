import assert from 'node:assert/strict'
import test from 'node:test'
import { toolContractHash, type ActionContext } from '@lingxi-org/lingxios'
import { createDocument, createNode, createPage } from '../../../../shared/artifact-document.js'
import { applyOperations, prepareBatch } from '../../../../shared/artifact-operations.js'
import { createArtifactTools } from './agent-tools.js'
import { prepareNativeAgentPlan, readNativeAgentPlan } from './native-agent-plan.js'
import { NATIVE_DOCUMENT_PATH } from './native-document.js'
import type { ArtifactRow } from './repository.js'
import { sha256 } from './store.js'

const sourceTool = createArtifactTools('design', async () => { throw Error('unused') }).find(tool => tool.action === 'design.prepare_ops')!
function fixture() {
  const document = createDocument('design', 'plan-document'), page = createPage('p')
  for (const id of ['a', 'b']) { page.nodes[id] = { ...createNode('text', id), text: id }; page.nodeOrder.push(id) }
  document.pages.p = page; document.pageOrder = ['p']
  const { pages, ...metadata } = document, pageBytes = Buffer.from(JSON.stringify(page)), pageHash = sha256(pageBytes)
  const manifest = Buffer.from(JSON.stringify({ ...metadata, pageFiles: { p: pageHash } })), manifestHash = sha256(manifest)
  const blobs = new Map([[pageHash, pageBytes], [manifestHash, manifest]]), queries: string[] = []
  const input = { baseSeq: 0, artifactId: document.id, operations: [{ type: 'node.patch' as const, pageId: 'p', nodeId: 'a', patch: { text: 'prepared' } }] }
  const context = { work: { id: 'work', tenantId: 'tenant', principalId: 'person', agentId: 'agent', sessionId: 'session', threadId: 'thread' },
    requestVersion: 1, action: { idempotencyKey: 'native-plan-key' }, database: { async query(sql: string, params: unknown[]) {
      queries.push(sql); assert.match(sql, /^SELECT /)
      if (sql.includes('FROM artifact_revisions')) { assert.deepEqual(params, [document.id, 0]); return { rows: [{ files: { [NATIVE_DOCUMENT_PATH]: { sha256: manifestHash } } }] } }
      if (sql.includes('FROM artifact_file_versions')) return { rows: (params[1] as string[]).map(hash => ({ sha256: hash, body: blobs.get(hash) })) }
      throw Error('preparation must not read current state')
    } } } as unknown as ActionContext
  return { document, input, context, queries, artifact: { id: document.id } as ArtifactRow }
}
async function preparedFixture() {
  const f = fixture(), plan = await prepareNativeAgentPlan(f.context, f.artifact, f.input)
  const row = { intent: { tenantId: 'tenant', workId: 'work', principalId: 'person', agentId: 'agent', sessionId: 'session', threadId: 'thread', requestVersion: 1,
    toolContractHash: toolContractHash(sourceTool), action: { action: 'design.prepare_ops', idempotencyKey: plan.planId, args: f.input } }, result: { ok: true, value: plan } }
  const context = { ...f.context, database: { async query() { return { rows: [row] } } } } as unknown as ActionContext
  return { ...f, plan, row, context }
}

test('pinned preparation fills exact native keys and preserves independent concurrent fields', async () => {
  const f = fixture(), before = structuredClone(f.document), plan = await prepareNativeAgentPlan(f.context, f.artifact, f.input)
  assert.deepEqual(plan.batch, prepareBatch(before, f.input.operations, sha256(Buffer.from(plan.planId))))
  const peer = applyOperations(before, prepareBatch(before, [{ type: 'node.patch', pageId: 'p', nodeId: 'b', patch: { text: 'human' } }])).document
  const applied = applyOperations(peer, plan.batch).document
  assert.equal(applied.pages.p.nodes.a.text, 'prepared'); assert.equal(applied.pages.p.nodes.b.text, 'human')
  assert.deepEqual(f.document, before)
  assert.ok(f.queries.every(sql => !sql.includes('artifact_document_state')))
})

test('a changed target rejects the original plan without rebuilding its preconditions', async () => {
  const f = fixture(), plan = await prepareNativeAgentPlan(f.context, f.artifact, f.input), original = structuredClone(plan)
  const changed = applyOperations(f.document, prepareBatch(f.document, [{ type: 'node.patch', pageId: 'p', nodeId: 'a', patch: { text: 'human' } }])).document
  assert.throws(() => applyOperations(changed, plan.batch), /changed/)
  assert.equal(changed.pages.p.nodes.a.text, 'human'); assert.deepEqual(plan, original)
})

test('missing pinned history is rejected without consulting current state', async () => {
  const f = fixture(), queries: string[] = []
  f.context.database = { async query(sql: string) { queries.push(sql); return { rows: [], rowCount: 0 } } } as ActionContext['database']
  await assert.rejects(prepareNativeAgentPlan(f.context, f.artifact, f.input), error => (error as { code: string }).code === 'not_found')
  assert.equal(queries.length, 1); assert.match(queries[0], /artifact_revisions/)
})

test('a settled plan retains one exact operation identity for retry', async () => {
  const f = await preparedFixture()
  const first = await readNativeAgentPlan(f.context, 'design', sourceTool, { planId: f.plan.planId })
  const retry = await readNativeAgentPlan(f.context, 'design', sourceTool, { planId: f.plan.planId })
  assert.deepEqual(first, retry); assert.equal(first.batch.operationId, sha256(Buffer.from(f.plan.planId)))
})

for (const field of ['tenantId', 'workId', 'principalId', 'agentId', 'sessionId', 'threadId', 'requestVersion', 'toolContractHash'] as const) test(`prepared plan rejects a different ${field}`, async () => {
  const f = await preparedFixture()
  Reflect.set(f.row.intent, field, field === 'requestVersion' ? 2 : 'other')
  await assert.rejects(readNativeAgentPlan(f.context, 'design', sourceTool, { planId: f.plan.planId }), error => (error as { code: string }).code === 'forbidden')
})
for (const invalid of [{ ok: false }, { ok: true, approval: {} }, { ok: true, directive: {} }, { ok: true, executionState: 'unknown' }]) test(`unsettled or unapproved preparation cannot commit ${JSON.stringify(invalid)}`, async () => {
  const f = await preparedFixture(); Object.assign(f.row.result, invalid)
  await assert.rejects(readNativeAgentPlan(f.context, 'design', sourceTool, { planId: f.plan.planId }), error => (error as { code: string }).code === 'forbidden')
})
test('the caller cannot replace a prepared artifact or batch', async () => {
  const f = await preparedFixture()
  await assert.rejects(readNativeAgentPlan(f.context, 'design', sourceTool, { planId: f.plan.planId, artifactId: 'other' }), /不一致/)
  f.row.result.value.batch.operations[0] = { type: 'document.patch', patch: { title: 'replaced' } }
  await assert.rejects(readNativeAgentPlan(f.context, 'design', sourceTool, { planId: f.plan.planId }), /不一致/)
})

test('invalid operations against a pinned snapshot are a known no-effect input failure', async () => {
  const f = fixture()
  await assert.rejects(prepareNativeAgentPlan(f.context, f.artifact, { ...f.input, operations: [{ type: 'node.patch', pageId: 'p', nodeId: 'missing', patch: { text: 'invalid' } }] }), error => (error as { code: string }).code === 'invalid_input')
  assert.ok(f.queries.every(sql => /^SELECT /.test(sql)))
})
