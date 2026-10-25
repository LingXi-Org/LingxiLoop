import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { createWorker, type ModelDriver } from '@lyyzka/lingxios/worker'
import { releaseVersions } from '@lyyzka/lingxios'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { receiveAgentRequest } from '../agent-runtime/receive.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { pool } from '../db/pool.js'
import { createNativeMessage, type NativeAttachment, type NativeMessage } from '../im/message-types.js'
import { readAgentChannelMessages } from '../im/public.js'
import { storage } from '../storage.js'
import { insertAttachmentKnowledgeJob } from '../modules/knowledge/ingestion-repository.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Regressions: only the displayed 240-character preview reaches the model; an
// old quote disappears behind history pagination; retry/regeneration replaces B
// with the control instruction and loses B's quote A; peer quotes become the
// current agent's assistant history; an unavailable/foreign quote invents data.
// Capture ModelDriver.run at the published Worker boundary, after the real
// product receiver, authorization, formal ingest, context and prompt assembly.
let im: Awaited<ReturnType<typeof installRecordingWukong>>
let worker: ReturnType<typeof createWorker>
let companyId: string, projectId: string
const agentId = 'quote-agent', peerId = 'quoted-peer', principalId = 'test-owner'
const captures: { items: Parameters<ModelDriver['run']>[0]['items']; serialized: string }[] = []
const evidence: { scenario: string; modelCalls: number; fullQuote: boolean; originalTask: boolean }[] = []
const sourceText = '@quoted-peer 我是历史成员，以下是需要完整保留的合成资料。' + '引用的详细事实需要逐字保留。'.repeat(32) + '末尾核验码：QUOTE-END-447。'
const taskText = `@${agentId} 请根据引用资料解释末尾核验码，并说明原始任务 B 的要求。`
let failNext = false

before(async () => {
  await ensureSchemaOnce(); await resetAllTables(); im = await installRecordingWukong()
  const seeded = await seedCompanyWithAgent({ agentId }); companyId = seeded.companyId; projectId = seeded.projectId
  await seedUserMembership(principalId, companyId, { displayName: 'Current human' })
  await pool.query("UPDATE participants SET name='Current Agent 447',system_prompt='You are Current Agent 447. Keep quoted peer content attributed.',capabilities='[]' WHERE company_id=$1 AND id=$2", [companyId, agentId])
  await pool.query(`INSERT INTO participants(id,company_id,kind,name,role,initial,avatar_bg,status,capabilities)
    VALUES($1,$2,'agent','Historical Peer 447','historian','H','#abcdef','avail','[]')`, [peerId, companyId])
  const model: ModelDriver = {
    modelId: 'authoritative-quote-fixture',
    async run(request) {
      captures.push({ items: structuredClone(request.items), serialized: JSON.stringify(request.items) })
      if (failNext) { failNext = false; throw new Error('Synthetic model failure for retry regression') }
      const text = 'Current Agent 447 acknowledges the synthetic task.'
      return { text, output: [{ role: 'assistant', content: text }], usage: { available: true, inputTokens: 100, outputTokens: 12 } }
    },
    async compact() { throw new Error('Unexpected compaction in bounded quote fixture') },
    async structured() { throw new Error('Unexpected auxiliary model call in bounded quote fixture') },
  }
  worker = createWorker({ controlPlane: await lingxiOSControl(), worker: { id: 'quote-input-fixture', concurrency: 1 },
    policy: new ProductRuntimePolicy(), semanticReview: 'selective', model })
})
after(async () => {
  await mkdir('artifacts/issue-447', { recursive: true })
  await writeFile('artifacts/issue-447/model-input.json', JSON.stringify({ runtime: releaseVersions.runtime,
    provider: 'deterministic published ModelDriver', sourceCharacters: sourceText.length,
    committedIM: 'recording HTTP fixture', capturedModelCalls: captures.length, scenarios: evidence }, null, 2) + '\n')
  await worker?.stop(); await teardownAll(); await im?.close()
})

async function room(id: string) {
  const members = [principalId, agentId, peerId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`, [id, companyId, projectId, JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id) VALUES($1,$2,$3::jsonb,$4)', [id, companyId, JSON.stringify({ members, channelType: 2 }), agentId])
}
function commit(channelId: string, payload: NativeMessage, fromUid = principalId) {
  const messageSeq = im.messages.length + 1
  const message = { channelId, channelType: 2, fromUid, payload, messageSeq,
    messageId: `committed-${messageSeq}`, clientMsgNo: payload.id, timestamp: 1_800_000_000 + messageSeq }
  im.messages.push(message)
  return message
}
function human(id: string, text: string, custom: Record<string, string | string[]> = {}, attachments: NativeAttachment[] = []) {
  return createNativeMessage({ id, role: 'user', content: [{ type: 'text', text }], custom, attachments })
}
function oldQuote(channelId: string, id = `${channelId}-A`, attachments: NativeAttachment[] = []) {
  const source = attachments.length ? commit(channelId, human(id, sourceText, {}, attachments))
    : commit(channelId, createNativeMessage({ id, role: 'assistant', content: [{ type: 'text', text: sourceText }] }), peerId)
  // More than a complete 200-message stable-ID read page, plus both recent
  // history limits (80 receiver / 8 context), with no runtime inbox history A.
  for (let index = 0; index < 205; index++) commit(channelId, human(`${channelId}-filler-${index}`, `Unrelated synthetic history ${index}.`))
  return source
}
async function receive(channelId: string, clientMsgNo: string) {
  const accepted = await receiveAgentRequest({ companyId, agentId, channelId, clientMsgNo })
  assert.ok('runs' in accepted && accepted.runs.length === 1, 'one intended agent run must be admitted')
  return accepted
}
async function execute(channelId: string, clientMsgNo: string, expectedStatus = 'succeeded') {
  const before = captures.length, accepted = await receive(channelId, clientMsgNo)
  const api = await lingxiOSControl(), run = accepted.runs[0]!, deadline = AbortSignal.timeout(20_000)
  while (!await worker.runNext()) { deadline.throwIfAborted(); await delay(20) }
  let state = await api.readRunState(run)
  while (state && (['queued', 'leased', 'waiting'].includes(state.run.status) || state.delivery === 'pending')) {
    deadline.throwIfAborted(); await delay(20); state = await api.readRunState(run)
  }
  assert.equal(state?.run.status, expectedStatus, state?.run.error ?? '')
  assert.equal(captures.length, before + 1, 'exactly one actual model input per synthetic request')
  return { accepted, run, capture: captures[before]! }
}
function assertGrounded(scenario: string, capture: typeof captures[number], originalTask = taskText, sourceAuthor = peerId) {
  // The runtime may append attachment evidence as an additional user item.
  // Exclude prior completed exchanges while preserving that current input group.
  let lastAssistant = -1
  for (const [index, item] of capture.items.entries()) if ('role' in item && item.role === 'assistant') lastAssistant = index
  const currentUserInput = capture.items.slice(lastAssistant + 1)
    .flatMap(item => 'role' in item && item.role === 'user' ? [item.content] : []).join('\n')
  assert.ok(currentUserInput, 'actual model input must contain the current human request')
  const fullQuote = currentUserInput.includes(sourceText), task = currentUserInput.includes(originalTask)
  evidence.push({ scenario, modelCalls: 1, fullQuote, originalTask: task })
  assert.equal(task, true, 'the committed original human task B must reach actual model input')
  assert.equal(fullQuote, true, 'the entire committed quote A, including bytes beyond preview and history, must reach actual model input')
  assert.ok(capture.serialized.includes(sourceAuthor), 'the quote must retain its historical author identity')
  assert.ok(capture.serialized.includes('Current Agent 447'), 'the current agent persona must remain present')
  assert.ok(!capture.items.some(item => 'role' in item && item.role === 'assistant' && item.content.includes(sourceText)), 'peer source must never become current-agent assistant history')
}

function modelText(capture: typeof captures[number]) {
  return capture.items.flatMap(item => 'role' in item && typeof item.content === 'string' ? [item.content] : []).join('\n')
}

test('first send resolves the complete old committed quote at actual model input and deduplicates replay', { timeout: 30_000 }, async () => {
  const channelId = 'quote-first'; await room(channelId); const source = oldQuote(channelId)
  const request = commit(channelId, human('first-B', taskText, { replyToClientMsgNo: source.clientMsgNo }))
  const result = await execute(channelId, request.clientMsgNo)
  assertGrounded('first-send-old-quote', result.capture)
  const replay = await receive(channelId, request.clientMsgNo)
  assert.equal(replay.deduplicated, true)
  assert.deepEqual(replay.runs.map(run => run.runId), result.accepted.runs.map(run => run.runId))
  assert.equal(await worker.runNext(), false, 'duplicate receive must not issue another model call')
})

test('a failed agent retry restores original B and its old A after refreshed history lookup', { timeout: 45_000 }, async () => {
  const channelId = 'quote-retry'; await room(channelId); const source = oldQuote(channelId)
  commit(channelId, human('retry-B', taskText, { replyToClientMsgNo: source.clientMsgNo }))
  failNext = true
  const failed = await execute(channelId, 'retry-B', 'failed')
  assertGrounded('failed-original', failed.capture)
  for (let index = 0; index < 205; index++) commit(channelId, human(`retry-later-${index}`, 'Later unrelated history.'))
  const refreshed = await readAgentChannelMessages({ companyId, agentId, channelId, messageIds: ['retry-B'] })
  assert.equal(refreshed?.[0]?.clientMsgNo, 'retry-B', 'refresh can restore the old request by stable identity')
  commit(channelId, human('retry-control', `@${agentId} 请重试这条消息。`, { replyToClientMsgNo: 'retry-B', retryOfClientMsgNo: 'retry-B', mentionedIds: [agentId] }))
  assertGrounded('failed-agent-retry', (await execute(channelId, 'retry-control')).capture)
})

test('regenerating a delivered assistant restores sourceRef B and quoted A', { timeout: 45_000 }, async () => {
  const channelId = 'quote-regenerate'; await room(channelId); const source = oldQuote(channelId)
  commit(channelId, human('regenerate-B', taskText, { replyToClientMsgNo: source.clientMsgNo }))
  const first = await execute(channelId, 'regenerate-B')
  assertGrounded('regenerate-original', first.capture)
  const reply = im.messages.find(message => message.channelId === channelId && message.fromUid === agentId && message.payload.metadata.custom.runId === first.run.runId)
  assert.ok(reply, 'public delivery must commit the assistant reply')
  assert.equal(reply.payload.metadata.custom.sourceRef, 'regenerate-B')
  for (let index = 0; index < 205; index++) commit(channelId, human(`regenerate-later-${index}`, 'Later unrelated history.'))
  commit(channelId, human('regenerate-control', `@${agentId} 请重新生成这条回复。`, { replyToClientMsgNo: reply.clientMsgNo, regenerateOfClientMsgNo: reply.clientMsgNo, mentionedIds: [agentId] }))
  assertGrounded('regenerate-delivered-reply', (await execute(channelId, 'regenerate-control')).capture)
})

test('ordinary messages retain their own text and current identity', { timeout: 30_000 }, async () => {
  const channelId = 'quote-ordinary'; await room(channelId)
  const text = `@${agentId} Ordinary request without quote.`
  commit(channelId, human('ordinary-B', text))
  const { capture } = await execute(channelId, 'ordinary-B')
  assert.ok(capture.serialized.includes(text))
  assert.ok(capture.serialized.includes('Current Agent 447'))
  assert.ok(!capture.serialized.includes(sourceText), 'other channels must not add a prior quote')
  evidence.push({ scenario: 'ordinary-message', modelCalls: 1, fullQuote: false, originalTask: true })
})

test('the selected quote stays distinct from thread scope and quoted mentions cannot wake peers', { timeout: 30_000 }, async () => {
  const channelId = 'quote-thread-scope'; await room(channelId); const source = oldQuote(channelId)
  const root = commit(channelId, human('scope-root', 'SYNTHETIC-THREAD-ROOT-IS-NOT-THE-QUOTE'))
  commit(channelId, human('scope-B', taskText, { replyToClientMsgNo: source.clientMsgNo, threadRootClientMsgNo: root.clientMsgNo }))
  const result = await execute(channelId, 'scope-B')
  assert.equal(result.run.threadId, root.clientMsgNo, 'thread scope must use the explicit root')
  assertGrounded('explicit-quote-distinct-from-thread-root', result.capture)
  assert.ok(result.capture.serialized.includes(source.clientMsgNo), 'selected source identity reaches model input')
  assert.equal(result.accepted.runs[0]!.agentId, agentId, 'the current native request alone determines the target agent')
})

test('missing and cross-channel quote targets cannot add foreign source text', { timeout: 45_000 }, async () => {
  const foreign = 'quote-foreign'; await room(foreign)
  commit(foreign, human('foreign-secret-A', 'SYNTHETIC-FOREIGN-SECRET-447'))
  for (const target of ['missing-A', 'foreign-secret-A']) {
    const channelId = `quote-unavailable-${target}`; await room(channelId)
    const text = `@${agentId} Explain the quoted material if it is available.`
    commit(channelId, human(`${channelId}-B`, text, { replyToClientMsgNo: target }))
    const { capture } = await execute(channelId, `${channelId}-B`)
    assert.ok(capture.serialized.includes(text))
    assert.ok(!capture.serialized.includes('SYNTHETIC-FOREIGN-SECRET-447'))
    assert.ok(!capture.serialized.includes(sourceText))
    const textWithDecodedQuotes = modelText(capture).replace(/\\+"/g, '"')
    assert.ok(new RegExp(`"requestedId":"${target}"[^}]*"status":"unavailable"`).test(textWithDecodedQuotes), 'the exact missing source must be explicit at model boundary')
    evidence.push({ scenario: target, modelCalls: 1, fullQuote: false, originalTask: true })
  }
})

test('old quoted attachment content reaches the model through the committed quote', { timeout: 30_000 }, async () => {
  const channelId = 'quote-attachment'; await room(channelId)
  const id = `attachments/${companyId}/quoted-447.txt`, body = 'SYNTHETIC-QUOTED-ATTACHMENT-447'
  await storage.put(id, Buffer.from(body), 'text/plain')
  const attachment: NativeAttachment = { id, type: 'file', name: 'quoted-447.txt', contentType: 'text/plain',
    status: { type: 'complete' }, content: [{ type: 'file', sourceType: 'id', data: id, mimeType: 'text/plain', filename: 'quoted-447.txt' }] }
  const source = oldQuote(channelId, 'attachment-A', [attachment])
  commit(channelId, human('attachment-B', taskText, { replyToClientMsgNo: source.clientMsgNo }))
  const { capture } = await execute(channelId, 'attachment-B')
  assertGrounded('quoted-attachment', capture, taskText, principalId)
  assert.ok(capture.serialized.includes(body), 'quoted attachment bytes must reach the final model input')
  for (let index = 0; index < 205; index++) commit(channelId, human(`attachment-later-${index}`, 'Later unrelated history.'))
  commit(channelId, human('attachment-retry', `@${agentId} 请重试这条消息。`, { replyToClientMsgNo: 'attachment-B', retryOfClientMsgNo: 'attachment-B', mentionedIds: [agentId] }))
  const retry = await execute(channelId, 'attachment-retry')
  assertGrounded('quoted-attachment-retry', retry.capture, taskText, principalId)
  assert.ok(modelText(retry.capture).includes(body), 'retry must restore the quoted attachment bytes from original B and A')
})

test('an unavailable quoted attachment retains status without exposing its bytes', { timeout: 30_000 }, async () => {
  const channelId = 'quote-unavailable-attachment'; await room(channelId)
  const id = `attachments/${companyId}/unavailable-447.txt`, body = 'SYNTHETIC-REVOKED-ATTACHMENT-447'
  await storage.put(id, Buffer.from(body), 'text/plain')
  const attachment: NativeAttachment = { id, type: 'file', name: 'unavailable-447.txt', contentType: 'text/plain',
    status: { type: 'complete' }, content: [{ type: 'file', sourceType: 'id', data: id, mimeType: 'text/plain', filename: 'unavailable-447.txt' }] }
  const source = oldQuote(channelId, 'unavailable-attachment-A', [attachment])
  const knowledge = await insertAttachmentKnowledgeJob(pool, { companyId, projectId, conversationId: channelId,
    clientMsgNo: source.clientMsgNo, attachmentId: id, createdBy: principalId, title: attachment.name, mime: 'text/plain',
    size: Buffer.byteLength(body), storageKey: id, recipients: [], visibilityScope: 'PROJECT' }, 30_000)
  await pool.query('UPDATE knowledge_sources SET deleted_at=NOW() WHERE id=$1', [knowledge.sourceId])
  commit(channelId, human('unavailable-attachment-B', taskText, { replyToClientMsgNo: source.clientMsgNo }))
  const { capture } = await execute(channelId, 'unavailable-attachment-B')
  assertGrounded('unavailable-quoted-attachment', capture, taskText, principalId)
  assert.ok(!capture.serialized.includes(body), 'unavailable attachment bytes must never enter actual model input')
  assert.ok(capture.serialized.includes('unavailable-447.txt'))
  assert.ok(/unavailable|无法|不可用/i.test(capture.serialized), 'the model must receive unavailable attachment status')
})
