import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { mkdir, writeFile } from 'node:fs/promises'
import type OpenAI from 'openai'
import { createWorker, type ModelDriver } from '@lyyzka/lingxios/worker'
import { releaseVersions } from '@lyyzka/lingxios'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { receiveAgentRequest } from '../agent-runtime/receive.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { withTransaction } from '../db/transaction.js'
import { createNativeMessage, type NativeAttachment, type NativeMessage } from '../im/message-types.js'
import { readAgentChannelMessages } from '../im/public.js'
import { __setLlmClientOverrideForTesting } from '../llm.js'
import { ensureTeacherAgentForCourse } from '../modules/learning/teacher-agent-application.js'
import { insertAttachmentKnowledgeJob } from '../modules/knowledge/ingestion-repository.js'
import { storage } from '../storage.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Protocol fixture, not an OCR-quality test: the original production image is
// unavailable. Assert exact PNG bytes at the shared provider boundary and the
// provider's synthetic transcription at the published Worker's actual input.
// No prompts, original-image data URLs, or credentials are written to evidence.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6sV8AAAAASUVORK5CYII=', 'base64')
const transcription = 'SYNTHETIC-VISION-465: IP 192.0.2.17/24; fill in the network address and broadcast address.'
const originalAt = '2026-10-24T09:30:00.000Z', originalTimestamp = Date.parse(originalAt) / 1000
const principalId = 'test-owner', visionModel = 'vision-fixture-465'
let companyId: string
let im: Awaited<ReturnType<typeof installRecordingWukong>>
let worker: ReturnType<typeof createWorker>
let failuresRemaining = 0
let visionReadable = true, providerText = transcription
const modelInputs: { items: Parameters<ModelDriver['run']>[0]['items']; text: string }[] = []
const visionInputs: { exactBytes: boolean; thinkingDisabled: boolean; model: string }[] = []
const observations: { layout: string; attempt: number; originalTask: boolean; imageReference: boolean; imageContent: boolean; originalTime: boolean; courseContext: boolean }[] = []

before(async () => {
  await ensureSchemaOnce(); await resetAllTables(); im = await installRecordingWukong()
  const seeded = await seedCompanyWithAgent(); companyId = seeded.companyId
  await seedUserMembership(principalId, companyId)
  __setLlmClientOverrideForTesting(() => ({ chat: { completions: { async create(request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming) {
    const images = request.messages.flatMap(message => Array.isArray(message.content)
      ? message.content.flatMap(part => part.type === 'image_url' ? [part.image_url.url] : []) : [])
    visionInputs.push({ model: request.model, exactBytes: images.length === 1 && images[0] === `data:image/png;base64,${png.toString('base64')}`,
      thinkingDisabled: (request as unknown as { enable_thinking?: boolean }).enable_thinking === false })
    return { id: 'synthetic-vision-465', object: 'chat.completion', created: 1, model: request.model,
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ status: visionReadable ? 'readable' : 'unreadable', text: visionReadable ? providerText : '' }), refusal: null }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 } }
  } } } } as unknown as OpenAI))
  const model: ModelDriver = {
    modelId: 'teacher-text-fixture-465',
    async run(request) {
      modelInputs.push({ items: structuredClone(request.items), text: JSON.stringify(request.items) })
      if (failuresRemaining > 0) { failuresRemaining--; throw new Error('Synthetic recoverable teacher run failure') }
      const text = '已收到合成资料；仍需创建草稿并请教师确认发布。'
      return { text, output: [{ role: 'assistant', content: text }], usage: { available: true, inputTokens: 200, outputTokens: 30 } }
    },
    async compact() { throw new Error('Unexpected compaction in the bounded teacher image fixture') },
    async structured() { throw new Error('Unexpected auxiliary model request in the teacher image fixture') },
  }
  worker = createWorker({ controlPlane: await lingxiOSControl(), worker: { id: 'teacher-image-retry-465', concurrency: 1 },
    policy: new ProductRuntimePolicy(), semanticReview: 'selective', model })
})
after(async () => {
  await mkdir('artifacts/issue-465', { recursive: true })
  await writeFile('artifacts/issue-465/teacher-image-input.json', JSON.stringify({ runtime: releaseVersions.runtime,
    syntheticProtocolFixture: true, imageBytes: png.length, visionInputs, actualWorkerModelCalls: modelInputs.length, observations,
    limitations: ['No original production image or run records', 'No OCR quality claim', 'No draft/publish tool effect executed'] }, null, 2) + '\n')
  __setLlmClientOverrideForTesting(null)
  await worker?.stop(); await teardownAll(); await im?.close()
})

async function teacherRoom(layout: string) {
  const projectId = `teacher465-project-${layout}`, courseId = `teacher465-course-${layout}`
  await pool.query("INSERT INTO projects(id,company_id,kind,name,created_by) VALUES($1,$2,'INSTITUTIONAL_COURSE','Synthetic networking course','test-owner')", [projectId, companyId])
  await pool.query("INSERT INTO courses(id,company_id,project_id,created_by) VALUES($1,$2,$3,'test-owner')", [courseId, companyId, projectId])
  await pool.query("INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,'test-owner','TEACHER')", [projectId, companyId])
  return { ...await ensureTeacherAgentForCourse(companyId, courseId, pool, work => withTransaction(pool, work)), projectId, courseId }
}
type TeacherRoom = Awaited<ReturnType<typeof teacherRoom>>
function commit(room: TeacherRoom, payload: NativeMessage, timestamp = originalTimestamp) {
  const messageSeq = im.messages.length + 1
  const message = { channelId: room.roomId, channelType: 2, fromUid: principalId, payload, messageSeq,
    messageId: `teacher465-committed-${messageSeq}`, clientMsgNo: payload.id, timestamp }
  im.messages.push(message)
  return message
}
function human(id: string, text: string, custom: Record<string, string | string[]> = {}, attachments: NativeAttachment[] = [], createdAt = originalAt) {
  return createNativeMessage({ id, role: 'user', content: text ? [{ type: 'text', text }] : [], custom, attachments, createdAt })
}
async function picture(layout: string): Promise<NativeAttachment> {
  const id = `attachments/${companyId}/network-${layout}.png`
  await storage.put(id, png, 'image/png')
  return { id, type: 'image', name: '正向网络地址填空.png', contentType: 'image/png', status: { type: 'complete' },
    content: [{ type: 'file', sourceType: 'id', data: id, mimeType: 'image/png', filename: '正向网络地址填空.png' }] }
}
function moveOutOfRecentHistory(room: TeacherRoom, prefix: string) {
  for (let index = 0; index < 205; index++) commit(room, human(`${prefix}-filler-${index}`, 'Unrelated later discussion.'), originalTimestamp + 60 + index)
}
async function execute(room: TeacherRoom, clientMsgNo: string, status: string) {
  const capturedBefore = modelInputs.length
  const accepted = await receiveAgentRequest({ companyId, agentId: room.agentId, channelId: room.roomId, clientMsgNo })
  assert.ok('runs' in accepted && accepted.runs.length === 1, 'the original teacher remains the sole target')
  const api = await lingxiOSControl(), run = accepted.runs[0]!, deadline = AbortSignal.timeout(20_000)
  while (!await worker.runNext()) { deadline.throwIfAborted(); await delay(20) }
  let state = await api.readRunState(run)
  while (state && (['queued', 'leased', 'waiting'].includes(state.run.status) || state.delivery === 'pending')) {
    deadline.throwIfAborted(); await delay(20); state = await api.readRunState(run)
  }
  assert.equal(state?.run.status, status, state?.run.error ?? '')
  assert.equal(modelInputs.length, capturedBefore + 1, 'one actual Worker model call per attempt')
  const input = modelInputs[capturedBefore]!
  let lastAssistant = -1
  for (const [index, item] of input.items.entries()) if ('role' in item && item.role === 'assistant') lastAssistant = index
  const currentText = input.items.slice(lastAssistant + 1).flatMap(item => 'role' in item && item.role === 'user' ? [item.content] : []).join('\n')
  return { accepted, input, currentText }
}

for (const layout of ['same-message', 'separate-message']) test(`teacher PNG and original task survive three retries (${layout})`, { timeout: 60_000 }, async () => {
  const room = await teacherRoom(layout), attachment = await picture(layout)
  const originalId = `${layout}-original`, task = `@${room.agentId} 仿照图片中的题目类型发布一道同类型题目在作业中，截止时间是明晚20:00。`
  if (layout === 'separate-message') commit(room, human(`${layout}-image`, '', {}, [attachment]))
  commit(room, human(originalId, task, {}, layout === 'same-message' ? [attachment] : []))
  failuresRemaining = 3
  let previous = originalId
  let lastRunIds: string[] = []
  for (let attempt = 0; attempt <= 3; attempt++) {
    const requestId = attempt ? `${layout}-retry-${attempt}` : originalId
    if (attempt) {
      const time = originalTimestamp + attempt * 86_400
      commit(room, human(requestId, `@${room.agentId} 请重试这条消息。`,
        { replyToClientMsgNo: previous, retryOfClientMsgNo: previous, mentionedIds: [room.agentId] }, [], new Date(time * 1000).toISOString()), time)
    }
    const result = await execute(room, requestId, attempt < 3 ? 'failed' : 'succeeded')
    lastRunIds = result.accepted.runs.map(run => run.runId)
    const originalTask = result.currentText.includes(task), imageContent = result.currentText.includes(transcription)
    const originalTime = attempt === 0 || result.currentText.includes(originalAt)
    observations.push({ layout, attempt, originalTask, imageContent, originalTime,
      imageReference: result.currentText.includes(attachment.id), courseContext: result.input.text.includes(room.courseId) })
    previous = requestId
    if (attempt === 0) {
      moveOutOfRecentHistory(room, layout)
      const recovered = await readAgentChannelMessages({ companyId, agentId: room.agentId, channelId: room.roomId, messageIds: [originalId] })
      assert.equal(recovered?.[0]?.clientMsgNo, originalId, 'refresh restores original request outside a complete history page')
    }
  }
  const attempts = observations.filter(item => item.layout === layout)
  assert.ok(attempts.every(item => item.originalTask), 'actual current model input must restore the initial teacher task and deadline wording')
  assert.ok(attempts.every(item => item.imageReference), 'the original image identity must survive every retry after leaving recent history')
  assert.ok(attempts.every(item => item.imageContent), 'actual current model input must include the vision result from original PNG bytes')
  assert.ok(attempts.every(item => item.originalTime), 'retry must retain the original request time across day boundaries')
  assert.ok(attempts.every(item => item.courseContext), 'the formal Worker must retain its authorized course context')
  assert.ok(visionInputs.length > 0 && visionInputs.every(input => input.exactBytes && input.thinkingDisabled && input.model === visionModel), 'the shared vision provider must receive exact original PNG bytes with thinking disabled')
  const before = modelInputs.length, visionBefore = visionInputs.length
  // A new model reading can differ. Replaying already admitted IM must preserve
  // its original frozen snapshot rather than re-extract and change its fingerprint.
  providerText = 'SYNTHETIC-DIFFERENT-SECOND-READING-465'
  let replay: Awaited<ReturnType<typeof receiveAgentRequest>>
  try { replay = await receiveAgentRequest({ companyId, agentId: room.agentId, channelId: room.roomId, clientMsgNo: previous }) }
  finally { providerText = transcription }
  assert.ok('runs' in replay && replay.deduplicated)
  assert.deepEqual(replay.runs.map(run => run.runId), lastRunIds, 'replay must preserve the existing frozen run identity')
  assert.equal(visionInputs.length, visionBefore, 'replay must not reread an already admitted image')
  assert.equal(await worker.runNext(), false, 'replaying the final retry must not duplicate Worker execution')
  assert.equal(modelInputs.length, before)
  const ledger = (await pool.query('SELECT status,measured,purpose FROM llm_calls WHERE company_id=$1 AND model=$2', [companyId, visionModel])).rows
  assert.equal(ledger.length, visionInputs.length, 'each issued vision call must use the shared ledger')
  assert.ok(ledger.every(row => row.status === 'succeeded' && row.measured && row.purpose === 'attachment.image_read'))
})

test('revoked PNG is reported unavailable without sending bytes to the vision provider', { timeout: 30_000 }, async () => {
  failuresRemaining = 0
  const room = await teacherRoom('revoked'), attachment = await picture('revoked'), clientMsgNo = 'revoked-original'
  commit(room, human(clientMsgNo, `@${room.agentId} 仿照图片出题，截止时间是明晚20:00。`, {}, [attachment]))
  const source = await insertAttachmentKnowledgeJob(pool, { companyId, projectId: room.projectId, conversationId: room.roomId,
    clientMsgNo, attachmentId: attachment.id, createdBy: principalId, title: attachment.name, mime: 'image/png', size: png.length,
    storageKey: attachment.id, recipients: [], visibilityScope: 'PROJECT' }, 30_000)
  await pool.query('UPDATE knowledge_sources SET deleted_at=NOW() WHERE id=$1', [source.sourceId])
  const before = visionInputs.length, result = await execute(room, clientMsgNo, 'succeeded')
  assert.equal(visionInputs.length, before, 'revoked image bytes must never be sent to the provider')
  assert.ok(result.currentText.includes('unavailable'), 'actual Worker input must report unavailable image content')
  assert.ok(!result.currentText.includes(transcription), 'an unavailable image must not fabricate image understanding')
})

test('missing vision configuration and unreadable images retain truthful attachment status', { timeout: 30_000 }, async () => {
  for (const mode of ['unconfigured', 'unreadable']) {
    const room = await teacherRoom(mode), attachment = await picture(mode), clientMsgNo = `${mode}-original`
    commit(room, human(clientMsgNo, `@${room.agentId} 请阅读题图。`, {}, [attachment]))
    const configuredModel = env.OPENAI_VISION_MODEL, before = visionInputs.length
    if (mode === 'unconfigured') env.OPENAI_VISION_MODEL = ''
    visionReadable = mode !== 'unreadable'
    let result: Awaited<ReturnType<typeof execute>>
    try { result = await execute(room, clientMsgNo, 'succeeded') }
    finally { env.OPENAI_VISION_MODEL = configuredModel; visionReadable = true }
    assert.equal(visionInputs.length - before, mode === 'unconfigured' ? 0 : 1)
    const decodedText = result.currentText.replace(/\\+"/g, '"')
    assert.ok(decodedText.includes(`"contentStatus":"${mode === 'unconfigured' ? 'unsupported' : 'empty'}"`), 'actual model input must preserve the exact attachment processing status')
    assert.ok(!result.currentText.includes(transcription), 'unprocessed image content must not be fabricated')
  }
})
