import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createWorker } from '@lyyzka/lingxios/worker'
import type OpenAI from 'openai'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { receiveAgentRequest } from '../agent-runtime/receive.js'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { imMessagesApplication } from '../im/messages-facade.js'
import { createNativeMessage, nativeText } from '../im/message-types.js'
import { __setLlmClientOverrideForTesting } from '../llm.js'
import { learningApplication } from '../modules/learning/facade.js'
import { HomeworkApplication } from '../modules/learning/homework-application.js'
import { captureConversationEvidence } from '../modules/learning/forum-evidence.js'
import { runLearningEffects } from '../modules/learning/worker.js'
import { STARTER_TEAM } from '../modules/learning/preset.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

let im: Awaited<ReturnType<typeof installRecordingWukong>> | undefined
let worker: ReturnType<typeof createWorker> | undefined
before(async () => { await ensureSchemaOnce(); await resetAllTables(); im = await installRecordingWukong() })
after(async () => { __setLlmClientOverrideForTesting(null); await worker?.stop(); await teardownAll(); await im?.close() })

// Distinguish a fresh student generation failure from quoted retry behavior.
// All product ACLs, admission, runtime context, delivery and evidence checks are
// real; only the model and external IM service use deterministic local fixtures.
// Report generation and final submission remain outside this bounded generation
// check; no validation, assistant response or report is inserted as a success row.
test('fresh invited student receives an unquoted bound-homework reply with readable canonical evidence', { timeout: 45_000 }, async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  const courseId = 'fresh-student-course'
  await pool.query(`INSERT INTO courses(id,company_id,project_id,created_by) VALUES($1,$2,$3,'test-owner')`,
    [courseId, companyId, projectId])
  const persona = STARTER_TEAM.find(agent => agent.presetKey === 'nova')!
  await pool.query(`UPDATE participants SET name=$3,role=$4,preset_key='nova',system_prompt=$5,tools=$6::jsonb,capabilities=$7::jsonb
    WHERE company_id=$1 AND id=$2`,
  [companyId, agentId, persona.name, persona.role, persona.systemPrompt, JSON.stringify(persona.tools), JSON.stringify(persona.capabilities)])
  const roomId = 'fresh-student-study-room'
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
    VALUES($1,$2,$3,'group','Synthetic course study room',$4::jsonb)`,
  [roomId, companyId, projectId, JSON.stringify(['test-owner', agentId])])
  await pool.query('UPDATE courses SET study_room_conversation_id=$2 WHERE id=$1', [courseId, roomId])
  const homework = new HomeworkApplication(pool, work => withTransaction(pool, work))
  let validationCalls = 0
  __setLlmClientOverrideForTesting(() => ({ chat: { completions: { create: async () => {
    assert.equal(++validationCalls, 1, 'only the explicit local homework validation may call the product model seam')
    return { id: 'fresh-student-local-validation', model: 'integration-test',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant',
        content: JSON.stringify({ valid: true, feedback: 'The task asks for a verifiable protocol distinction.' }) } }],
      usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 } }
  } } } }) as unknown as OpenAI)
  const teacher = { companyId, userId: 'test-owner' }
  const draft = await homework.draft(teacher, courseId, {
    title: 'Explain TCP and UDP', instructions: 'Explain one distinction in your own words.',
    criteria: ['Explain one difference between TCP and UDP reliability.'],
  })
  await runLearningEffects()
  const validated = await homework.detail(teacher, courseId, draft.homework.id)
  assert.equal(validated.homework.validation.status, 'READY')
  assert.equal(validationCalls, 1)
  const { homework: assignment } = await homework.publish(teacher, courseId, draft.homework.id, {
    expectedRevision: validated.homework.revision, visibleHash: validated.homework.visibleHash,
    idempotencyKey: 'publish-fresh-student-homework',
  })
  assert.equal(assignment.status, 'PUBLISHED')

  const studentId = 'fresh-invited-student', email = 'fresh-invited-student@test.local'
  await pool.query(`INSERT INTO users(id,email,display_name,email_verified_at) VALUES($1,$2,'Synthetic student',NOW())`, [studentId, email])
  const invitation = await learningApplication.createInvitation({ companyId, projectId, userId: 'test-owner' }, {
    email, expiresInDays: 1, maxUses: 1,
  })
  const admission = await learningApplication.acceptInvitation(studentId, invitation.token)
  assert.equal(admission.joinedCompany, true)
  assert.equal(admission.course.projectId, projectId)
  assert.deepEqual((await pool.query(`SELECT cm.role,cm.is_admin,pm.role AS project_role FROM company_memberships cm
    JOIN project_memberships pm ON pm.company_id=cm.company_id AND pm.user_id=cm.user_id
    WHERE cm.company_id=$1 AND cm.user_id=$2 AND pm.project_id=$3`, [companyId, studentId, projectId])).rows,
  [{ role: 'STUDENT', is_admin: false, project_role: 'STUDENT' }])
  const scope = { companyId, projectId, userId: studentId }
  const thread = await homework.start(scope, courseId, assignment.id)
  assert.equal(thread.created, true)
  assert.equal(thread.contextType, 'HOMEWORK')
  assert.equal(thread.agentId, agentId)
  assert.deepEqual(thread.participantIds, [studentId, agentId])

  const clientMsgNo = 'fresh-student-question'
  const question = 'I think TCP checks delivery while UDP sends without that guarantee. What distinction should I check?'
  const reply = 'TCP provides ordered, reliable delivery. UDP sends independent datagrams without guaranteeing delivery or order. Explain when that tradeoff would matter.'
  const payload = createNativeMessage({ id: clientMsgNo, role: 'user', content: [{ type: 'text', text: question }] })
  assert.equal(payload.metadata.custom.replyToClientMsgNo, undefined)
  const committed = await imMessagesApplication.acceptUserMessage({ ...scope, channelId: thread.channelId, clientNonce: clientMsgNo, payload })
  assert.equal(committed.kind, 'accepted')
  const accepted = await receiveAgentRequest({ companyId, agentId, channelId: thread.channelId, clientMsgNo, authenticatedUserId: studentId })
  assert.ok('runs' in accepted)
  assert.equal(accepted.runs.length, 1)
  const identity = accepted.runs[0]
  assert.equal(identity.principalId, studentId)
  const api = await lingxiOSControl()
  let modelCalls = 0, sawQuestion = false, sawAssignment = false
  const usage = { available: true, inputTokens: 100, outputTokens: 40 }
  worker = createWorker({ controlPlane: api,
    policy: new ProductRuntimePolicy(),
    worker: { id: 'fresh-student-dialogue', concurrency: 1, shutdownGraceMs: 1_000 },
    resources: { model: 1, python: 1 },
    modelBudget: { inputCostMicrosPerMillion: 1, outputCostMicrosPerMillion: 1 },
    model: { modelId: 'fresh-student-local-fixture', contextWindowTokens: 200_000,
      async run(request) {
        modelCalls++
        const context = JSON.stringify({ instructions: request.instructions, items: request.items })
        sawQuestion ||= context.includes(question)
        sawAssignment ||= context.includes(assignment.title)
        return { output: [{ role: 'assistant', content: reply }], text: reply, model: 'fresh-student-local-fixture', usage }
      },
      async structured() { return { value: { missing: [] }, model: 'fresh-student-local-fixture', usage } },
      async compact() { throw new Error('single-turn student fixture must not compact') },
    },
  })
  await worker.start()
  const deadline = Date.now() + 20_000
  let state = await api.readRunState(identity)
  while (state?.delivery !== 'delivered') {
    assert.notEqual(state?.run.status, 'failed', `fresh student generation failed: ${state?.run.error ?? 'unspecified failure'}`)
    assert.ok(Date.now() < deadline, `fresh student delivery timed out: status=${state?.run.status}, delivery=${state?.delivery}`)
    await delay(25)
    state = await api.readRunState(identity)
  }
  assert.equal(state.run.status, 'succeeded')
  assert.ok(modelCalls > 0)
  assert.equal(sawQuestion, true)
  assert.equal(sawAssignment, true, 'the student model context must include its bound published homework')
  const replies = im!.messages.filter(message => message.channelId === thread.channelId && message.fromUid === agentId
    && message.payload.role === 'assistant' && nativeText(message.payload) === reply)
  assert.equal(replies.length, 1, 'exactly one generated assistant reply must reach canonical IM history')
  assert.ok((await pool.query('SELECT 1 FROM llm_calls WHERE company_id=$1 AND run_id=$2', [companyId, identity.runId])).rows.length,
    'the deterministic native worker call must use the product ledger')
  const references = [{ channelId: thread.channelId, messageIds: [clientMsgNo, replies[0].clientMsgNo] }]
  const evidence = await captureConversationEvidence(pool, scope, projectId, references)
  assert.deepEqual(evidence[0].messages.map(({ id, role, text }) => ({ id, role, text })), [
    { id: clientMsgNo, role: 'user', text: question },
    { id: replies[0].clientMsgNo, role: 'assistant', text: reply },
  ])
  const progress = (await homework.detail(scope, courseId, assignment.id)).student!
  assert.equal(progress.hasLearningRecord, true)
  console.info(JSON.stringify({ scenario: 'fresh-invited-student-bound-homework-dialogue',
    studentRole: 'STUDENT', quoted: false, modelCalls, delivery: state.delivery,
    assistantReplies: replies.length, canonicalEvidenceMessages: evidence[0].messages.length,
    hasLearningRecord: progress.hasLearningRecord, reportAndSubmission: 'not_exercised' }))
})
