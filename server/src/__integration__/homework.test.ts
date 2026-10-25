import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import type OpenAI from 'openai'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { HomeworkApplication } from '../modules/learning/homework-application.js'
import type { LearningAttachment } from '../modules/learning/forum-contracts.js'
import { runLearningEffects as runLearningEffectsOnce } from '../modules/learning/worker.js'
import { createHomeworkThread } from '../modules/context-threads/public.js'
import { __setLlmClientOverrideForTesting } from '../llm.js'
import { createNativeMessage } from '../im/message-types.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedUserMembership, teardownAll } from './_helpers.js'

// Failure inventory, written before implementation: see e2e/homework/acceptance.md.
// These cases exercise persisted business boundaries, not a browser-only hidden-field check.
// Assessment retry failures: aliases/order or concurrent calls bill the same evidence twice;
// a retry supersedes an in-flight/READY judgment or erases the report/shared/manual review;
// INVALID cannot recover, or concurrent recovery creates multiple revisions; new evidence
// or a teacher return reuses stale mastery/receipts; cached evidence bypasses a revoked file grant.
// A missing/completed delivery effect must not strand PENDING evidence forever on an idempotent retry.
// Learning-record submission failures: requiring assessment/mastery rejects a real learner's
// incomplete work; opening a thread, saving an answer, assistant text, another person's text,
// or another homework's messages falsely count as learning; a report hides gaps/dependence.
// Returned work wrongly requires new mastery evidence, omits current feedback, or accepts an
// old report; answer changes, evidence permissions, idempotency, and atomic pairing still apply.
// A malformed/ungrounded model report must discard unsupported conclusions and explicitly
// remain unverified; that fallback must never turn required task material or revoked access into success.
// Authorized learning/answer attachments still count when content cannot be extracted;
// report that limitation without inventing a read, while required task material and ACL failures block.
// A report fingerprint read before the submit transaction can become stale while authorization
// locks are held: a genuine learner or assistant message during that wait must reject the old pair.
const companyId = 'homework-school'
const courseId = 'homework-course'
const projectId = 'homework-project'
const teacher = { companyId, userId: 'homework-teacher' }
const colleague = { companyId, userId: 'homework-colleague' }
const student = { companyId, userId: 'homework-student' }
const peer = { companyId, userId: 'homework-peer' }
const outsider = { companyId, userId: 'homework-outsider' }
const transaction = <T>(work: Parameters<typeof withTransaction<T>>[1]) => withTransaction(pool, work)
const homework = new HomeworkApplication(pool, transaction)
const servers: Server[] = []
const clients = new Map<string, string>()
let im: Awaited<ReturnType<typeof installRecordingWukong>>
const modelReplies: unknown[] = []
let lastModelRequest: unknown
const visible = { title: 'Explain triangle area', instructions: 'Explain why a triangle is half of a rectangle and solve a new example.',
  criteria: ['Explain the half-rectangle relationship independently.', 'Apply the relationship to a new triangle.'], links: [], attachments: [] as LearningAttachment[], dueAt: null as string | null }
const path = (id: string, suffix = '') => `/courses/${courseId}/homeworks/${id}${suffix}`
const call = (scope: typeof teacher, url: string, method = 'GET', body?: unknown) => fetch(`${clients.get(scope.userId)}${url}`, {
  method, headers: { 'content-type': 'application/json', 'x-company-id': scope.companyId }, ...(body ? { body: JSON.stringify(body) } : {}),
})

before(async () => {
  await ensureSchemaOnce()
  for (const scope of [teacher, colleague, student, peer, outsider]) {
    const server = createServer(await buildApiTestApp(scope.userId))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    servers.push(server)
    const address = server.address(); assert.ok(address && typeof address !== 'string')
    clients.set(scope.userId, `http://127.0.0.1:${address.port}/api`)
  }
})
beforeEach(async () => {
  await resetAllTables()
  im = await installRecordingWukong()
  modelReplies.length = 0
  lastModelRequest = undefined
  __setLlmClientOverrideForTesting(() => ({ chat: { completions: { create: async (request: unknown) => {
    lastModelRequest = request
    assert.ok(modelReplies.length, 'Unexpected model call: every scripted judgment must be explicit')
    const scripted = modelReplies.shift()
    const result = typeof scripted === 'function' ? await scripted() : scripted
    return { id: 'homework-scripted-model', model: 'integration-test', choices: [{ index: 0, finish_reason: 'stop',
      message: { role: 'assistant', content: JSON.stringify(result) } }], usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 } }
  } } } }) as unknown as OpenAI)
  await pool.query(`INSERT INTO companies(id,name,slug,type,status,plan_id) VALUES ($1,'Homework School',$1,'EDUCATION','ACTIVE','plan-education')`, [companyId])
  for (const scope of [teacher, colleague, student, peer, outsider]) await seedUserMembership(scope.userId, companyId,
    { role: [teacher, colleague].includes(scope) ? 'TEACHER' : 'STUDENT', isAdmin: false })
  for (const id of [projectId, 'homework-other-project']) {
    await pool.query(`INSERT INTO projects(id,company_id,kind,plan_id,name,status,created_by) VALUES ($1,$2,'TEACHING','plan-education',$1,'ACTIVE',$3)`, [id, companyId, teacher.userId])
    await pool.query('INSERT INTO courses(id,company_id,project_id,created_by) VALUES ($1,$2,$3,$4)',
      [id === projectId ? courseId : 'homework-other-course', companyId, id, teacher.userId])
    for (const scope of id === projectId ? [teacher, colleague, student, peer] : [teacher, outsider]) {
      await pool.query(`INSERT INTO project_memberships(company_id,project_id,user_id,role,status) VALUES ($1,$2,$3,$4,'ACTIVE')`,
        [companyId, id, scope.userId, [teacher, colleague].includes(scope) ? 'TEACHER' : 'STUDENT'])
    }
  }
  for (const [id, preset] of [['homework-nova', 'nova'], ['homework-other-agent', 'sage']]) {
    await pool.query(`INSERT INTO participants(id,company_id,kind,preset_key,name,role,initial,avatar_bg,status,capabilities)
      VALUES ($1,$2,'agent',$3,$1,'assistant','A','#abcdef','avail','["learning","files","web"]')`, [id, companyId, preset])
  }
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
    VALUES ('homework-study-room',$1,$2,'group','Homework study room',$3::jsonb)`,
    [companyId, projectId, JSON.stringify([teacher.userId, student.userId, peer.userId, 'homework-nova', 'homework-other-agent'])])
  await pool.query(`UPDATE courses SET study_room_conversation_id='homework-study-room' WHERE id=$1`, [courseId])
})
afterEach(async () => { __setLlmClientOverrideForTesting(null); await im?.close() })
after(async () => {
  for (const server of servers) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  await teardownAll()
})

async function published(overrides: Partial<typeof visible> = {}) {
  const draft = await homework.draft(teacher, courseId, { ...visible, ...overrides })
  modelReplies.push({ valid: true, feedback: 'The task has clear independently verifiable requirements.' })
  await runLearningEffects()
  const validated = await homework.detail(teacher, courseId, draft.homework.id)
  assert.equal(validated.homework.validation.status, 'READY')
  return homework.publish(teacher, courseId, draft.homework.id, {
    expectedRevision: validated.homework.revision, visibleHash: validated.homework.visibleHash, idempotencyKey: `publish-${draft.homework.id}`,
  })
}

async function runLearningEffects() {
  const snapshot = () => pool.query<{ clock: Date; transaction_time: Date; statement_time: Date; blocked_sessions: number;
    effects: Array<{ status: string; attempts: number }> }>(`SELECT clock_timestamp() AS clock,NOW() AS transaction_time,
    statement_timestamp() AS statement_time,
    (SELECT count(*)::int FROM pg_stat_activity WHERE datname=current_database() AND cardinality(pg_blocking_pids(pid))>0) AS blocked_sessions,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('kind',kind,'status',status,'attempts',attempts,'generation',generation,'queued_generation',queued_generation,
      'available_at',available_at,'eligible',available_at<=NOW(),'lease_expires_at',lease_expires_at,
      'error_kind',CASE WHEN error IS NULL THEN 'none' WHEN error ILIKE '%deadlock%' THEN 'deadlock'
        WHEN error ILIKE '%lease%' THEN 'lease' ELSE 'other' END)) FROM learning_effects),'[]'::jsonb) AS effects`)
  const before = (await snapshot()).rows[0]
  await runLearningEffectsOnce()
  const after = (await snapshot()).rows[0]
  if (after.effects.some(effect => effect.status === 'pending' && effect.attempts === 0)) {
    console.info('[homework] unclaimed effect diagnostic', JSON.stringify({ before, after }))
  }
}

async function waitForActorLock(blockerPid: number) {
  const end = Date.now() + 10_000
  while (Date.now() < end) {
    const { rows } = await pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
      AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid)) AND query LIKE '%FROM users%'`, [blockerPid])
    if (rows.length) return
    await delay(20)
  }
  assert.fail('Expected the concurrent operation to wait on the deliberately held actor row')
}

test('[integration] validation finalization and a concurrent draft revision cannot form an effect/actor lock cycle', async () => {
  const [{ claimLearningEffects, completeLearningEffect }, { runHomeworkEffect }] = await Promise.all([
    import('../modules/learning/effects-repository.js'), import('../modules/learning/homework-effects.js'),
  ])
  const draft = await homework.draft(teacher, courseId, visible)
  const [effect] = await claimLearningEffects(pool, 1)
  assert.ok(effect && effect.kind === 'homework.validate')
  let entered!: () => void, release!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  const held = new Promise<void>(resolve => { release = resolve })
  modelReplies.push(async () => { entered(); await held; return { valid: true, feedback: 'Old revision checked once.' } })
  const finished = runHomeworkEffect(effect).then(() => null, error => error as Error)
  const blocker = await pool.connect()
  try {
    await Promise.race([started, delay(10_000).then(() => assert.fail('Validation model did not start'))])
    await blocker.query('BEGIN')
    await blocker.query("SET LOCAL lock_timeout='5s'")
    await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [teacher.userId])
    const { rows: [{ pid }] } = await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
    release()
    await waitForActorLock(pid)
    const updating = new HomeworkApplication(blocker, work => work(blocker))
    const revised = await updating.updateDraft(teacher, courseId, draft.homework.id,
      { ...visible, title: 'Concurrent new revision', expectedRevision: 1 })
    assert.equal(revised.homework.revision, 2)
    await blocker.query('COMMIT')
    assert.equal(await finished, null, 'Neither operation may fail with a deadlock and retry a paid judgment')
    await completeLearningEffect(pool, effect)
    const pending = await homework.detail(teacher, courseId, draft.homework.id)
    assert.equal(pending.homework.validation.status, 'PENDING')
    modelReplies.push({ valid: true, feedback: 'Latest revision checked once.' })
    await runLearningEffects()
    const latest = await homework.detail(teacher, courseId, draft.homework.id)
    assert.equal(latest.homework.validation.status, 'READY')
    assert.equal(latest.homework.validation.revision, 2)
    const calls = await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM llm_calls WHERE company_id=$1 AND purpose='homework.validate'", [companyId])
    assert.equal(calls.rows[0].count, 2)
  } finally {
    release(); await blocker.query('ROLLBACK'); blocker.release(); await finished
  }
})

test('[integration] an effect lease expiring during authorization lock wait cannot install its judgment', async () => {
  const [{ claimLearningEffects, completeLearningEffect }, { runHomeworkEffect }] = await Promise.all([
    import('../modules/learning/effects-repository.js'), import('../modules/learning/homework-effects.js'),
  ])
  const draft = await homework.draft(teacher, courseId, visible)
  const [effect] = await claimLearningEffects(pool, 1)
  assert.ok(effect)
  let entered!: () => void, release!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  const held = new Promise<void>(resolve => { release = resolve })
  modelReplies.push(async () => { entered(); await held; return { valid: true, feedback: 'Paid result from an owner whose lease will expire.' } })
  const finished = runHomeworkEffect(effect).then(() => null, error => error as Error)
  const blocker = await pool.connect()
  try {
    await Promise.race([started, delay(10_000).then(() => assert.fail('Validation model did not start'))])
    await blocker.query('BEGIN')
    await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [teacher.userId])
    const { rows: [{ pid }] } = await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
    release(); await waitForActorLock(pid)
    await pool.query('UPDATE learning_effects SET lease_expires_at=clock_timestamp() WHERE id=$1', [effect.id])
    await blocker.query('COMMIT')
    const failure = await finished
    assert.ok(failure instanceof Error && /lease/i.test(failure.message), 'Expiry is checked after lock acquisition, not at transaction BEGIN')
    assert.equal((await homework.detail(teacher, courseId, draft.homework.id)).homework.validation.status, 'PENDING')
    const [next] = await claimLearningEffects(pool, 1)
    assert.ok(next && next.leaseToken !== effect.leaseToken)
    modelReplies.push({ valid: true, feedback: 'Fresh owner recovered the validation.' })
    await runHomeworkEffect(next); await completeLearningEffect(pool, next)
    assert.equal((await homework.detail(teacher, courseId, draft.homework.id)).homework.validation.status, 'READY')
  } finally { release(); await blocker.query('ROLLBACK'); blocker.release(); await finished }
})

test('[integration] each homework learner resumes one private thread and renewed authorization guards existing bindings', async () => {
  const first = await published()
  const second = await published({ title: 'Another triangle task' })
  const scope = { ...student, projectId }
  const input = { homeworkId: first.homework.id, agentId: 'homework-nova' }
  const opened = await createHomeworkThread(scope, input)
  const resumed = await createHomeworkThread(scope, input)
  assert.deepEqual({ id: resumed.id, channelId: resumed.channelId, participants: resumed.participantIds },
    { id: opened.id, channelId: opened.channelId, participants: [student.userId, 'homework-nova'] })
  assert.notEqual((await createHomeworkThread(scope, { ...input, homeworkId: second.homework.id })).channelId, opened.channelId)
  assert.notEqual((await createHomeworkThread({ ...peer, projectId }, input)).channelId, opened.channelId)
  await assert.rejects(createHomeworkThread({ ...teacher, projectId }, input))
  await assert.rejects(createHomeworkThread({ ...outsider, projectId }, input))
  await assert.rejects(createHomeworkThread({ ...student, projectId: 'homework-other-project' }, input))
  await assert.rejects(createHomeworkThread({ ...scope, companyId: 'different-tenant' }, input))
  await assert.rejects(createHomeworkThread(scope, { ...input, agentId: 'homework-other-agent' }))
  const draft = await homework.draft(teacher, courseId, visible)
  await assert.rejects(createHomeworkThread(scope, { ...input, homeworkId: draft.homework.id }))
  await pool.query(`UPDATE project_memberships SET status='SUSPENDED' WHERE company_id=$1 AND project_id=$2 AND user_id=$3`, [companyId, projectId, student.userId])
  await assert.rejects(createHomeworkThread(scope, input))
  await pool.query(`UPDATE project_memberships SET status='ACTIVE' WHERE company_id=$1 AND project_id=$2 AND user_id=$3`, [companyId, projectId, student.userId])
  await pool.query(`UPDATE participants SET departed_at=NOW() WHERE company_id=$1 AND id='homework-nova'`, [companyId])
  await assert.rejects(createHomeworkThread(scope, input))
})

function evidenceJudgment(criteria: string[], messageId: string, text: string, met: boolean) {
  return { criteria: criteria.map(criterion => ({ criterion, met, independent: met, feedback: met ? 'Explained and transferred independently.' : 'Explain the relationship in your own words.' })),
    completion: met ? 'All requirements demonstrated.' : 'More evidence needed.', assistance: 'A similar example was discussed.', independence: met ? 'New example solved independently.' : 'Independence remains unverified.',
    weaknesses: met ? [] : ['Explain the factor one half.'], evidence: [{ messageId, excerpt: text }] }
}

function commitAssistantReply(thread:{channelId:string;agentId:string}) {
  const id=`assistant-reply-${im.messages.length+1}`
  im.messages.push({channelId:thread.channelId,channelType:2,messageId:id,clientMsgNo:id,messageSeq:im.messages.length+1,fromUid:thread.agentId,timestamp:Date.now()/1000,payload:createNativeMessage({id,role:'assistant',content:[{type:'text',text:'Explain your reasoning and try a new example.'}]})})
}
function currentReferences() {
  const human=im.messages.find(message=>message.fromUid===student.userId&&message.payload.role==='user')
  const reply=human && [...im.messages].reverse().find(message=>message.channelId===human.channelId&&message.payload.role==='assistant'&&message.messageSeq>human.messageSeq)
  return human&&reply?[{channelId:human.channelId,messageIds:[human.clientMsgNo,reply.clientMsgNo]}]:[]
}

function commitLearnerEvidence(thread: { channelId: string; agentId?:string }, text: string) {
  const clientMsgNo = `canonical-evidence-${im.messages.length + 1}`, messageId = `stored-${clientMsgNo}`
  im.messages.push({ channelId: thread.channelId, channelType: 2, messageId, clientMsgNo, messageSeq: im.messages.length + 1,
    fromUid: student.userId, timestamp: Date.now() / 1000,
    payload: createNativeMessage({ id: clientMsgNo, role: 'user', content: [{ type: 'text', text }] }) })
  if(thread.agentId) commitAssistantReply(thread as {channelId:string;agentId:string})
  return { messageId, clientMsgNo, text }
}

async function nativeAssessment(id: string, thread: { channelId: string; agentId: string }, messageIds: string[]) {
  const { homeworkLearnerTools } = await import('../modules/learning/homework-tools.js')
  const tool = homeworkLearnerTools.find(item => item.action === 'learning.assess_homework')!
  const data = tool.parse({ homeworkId: id, messageIds })
  const runId = `homework-assessment-${randomUUID()}`
  const context = { database: pool, signal: AbortSignal.timeout(30000), requestVersion: 1,
    work: { id: runId, tenantId: companyId, agentId: thread.agentId, principalId: student.userId,
      sessionId: 'homework-learner-session', kind: 'turn', lane: 'interactive', triggerRef: messageIds[0], fence: 1, homeEpoch: 1, createdAt: new Date().toISOString(),
      conversation: { conversationId: thread.channelId, policyVersion: 1, source: { messageId: messageIds[0], version: 1 }, internal: false,
        audience: { visibility: 'conversation', participantIds: [student.userId, thread.agentId] } } },
    action: { runId, cellId: 'assess', callIndex: 0, action: tool.action, args: data, idempotencyKey: `${runId}-assess` },
  } as unknown as import('@lyyzka/lingxios').ActionContext
  const result = await transaction(async db => { const action = { ...context, database: db }; await tool.authorize(action, data); return tool.execute(action, data) })
  assert.equal(result.ok, true)
  const value = (result as { value: { homeworkId: string; assessmentId: string; evidenceRevision: number; returnEpoch: number; status: 'PENDING' | 'READY' } }).value
  return { value, verify: () => tool.verify!(context, data, value) }
}

async function concurrentAssessments(id: string, thread: { channelId: string; agentId: string }, variants: string[][]) {
  const results = await Promise.allSettled(variants.map(ids => nativeAssessment(id, thread, ids)))
  for (const result of results) if (result.status === 'rejected') throw result.reason
  return results.map(result => { assert.ok(result.status === 'fulfilled'); return result.value })
}

async function assessmentHistory(id: string) {
  return (await pool.query<{ id: string; status: string; evidence_revision: number; return_epoch: number }>(
    'SELECT id,status,evidence_revision,return_epoch FROM homework_assessments WHERE company_id=$1 AND homework_id=$2 AND learner_id=$3 ORDER BY evidence_revision',
    [companyId, id, student.userId])).rows
}

async function assess(id: string, met: boolean, scope = student, text = 'Two congruent triangles form a rectangle. For base 10 and height 3, half of 30 is 15 square units.', attachmentKey?: string) {
  const thread = await homework.start(scope, courseId, id)
  const messageId = `evidence-${scope.userId}-${im.messages.length + 1}`
  im.messages.push({ channelId: thread.channelId, channelType: 2, messageId, clientMsgNo: messageId,
    messageSeq: im.messages.length + 1, fromUid: scope.userId, timestamp: Date.now() / 1000,
    payload: createNativeMessage({ id: messageId, role: 'user', content: [{ type: 'text', text }], ...(attachmentKey ? {
      attachments: [{ id: attachmentKey, type: 'file', name: 'evidence.txt', contentType: 'text/plain', status: { type: 'complete' },
        content: [{ type: 'file', data: attachmentKey, sourceType: 'id', mimeType: 'text/plain' }] }],
    } : {}) }) })
  commitAssistantReply(thread)
  await homework.requestAssessment(scope, courseId, id, { messageIds: [messageId] }, { agentId: thread.agentId, channelId: thread.channelId })
  const required = (await homework.detail(scope, courseId, id)).homework.criteria
  const judgment = evidenceJudgment(required, messageId, text, met)
  modelReplies.push(judgment)
  await runLearningEffects()
  return { thread, messageId, judgment, state: (await homework.detail(scope, courseId, id)).student! }
}

async function report(id: string, judgment: Awaited<ReturnType<typeof assess>>['judgment'], scope = student) {
  const state = (await homework.detail(scope, courseId, id)).student!
  await homework.requestReport(scope, courseId, id, { expectedAnswerRevision: state.answerRevision })
  modelReplies.push(judgment)
  await runLearningEffects()
  const ready = (await homework.detail(scope, courseId, id)).student!
  assert.equal(ready.reportStatus, 'READY')
  assert.ok(ready.report)
  return ready
}

test('[integration] a genuine learning record permits a truthful report and paired submission without an assessment', async () => {
  const { homework: task } = await published()
  const thread = await homework.start(student, courseId, task.id)
  const message = commitLearnerEvidence(thread, 'I am still unsure why the triangle needs one half and currently calculate 30 square units.')
  const saved = await homework.saveAnswer(student, courseId, task.id, { expectedRevision: 0, text: 'My current answer is 30 square units; I still need help explaining the one-half factor.', links: [], attachments: [] })
  assert.equal(saved.unlocked, false, 'Submitting a learning record must not imply demonstrated mastery')
  assert.equal(saved.reportStatus,'PENDING','saving an answer must automatically queue its learning report')
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM learning_effects WHERE kind='homework.report' AND status='pending' AND payload->>'homeworkId'=$1",[task.id])).rows[0].n,1)
  const judgment = evidenceJudgment(task.criteria, message.clientMsgNo, message.text, false)
  const ready = await report(task.id, judgment)
  assert.equal(Reflect.get(saved, 'hasLearningRecord'), true)
  assert.equal(saved.canSubmit, true)
  assert.equal(Reflect.get(ready.report!, 'verification'), 'verified')
  assert.match(Reflect.get(ready.report!, 'evidenceHash'), /^[a-f0-9]{64}$/)
  assert.equal(ready.unlocked, false)
  assert.deepEqual(ready.report!.criteria, judgment.criteria)
  assert.deepEqual(ready.report!.weaknesses, judgment.weaknesses)
  assert.equal(ready.report!.independence, judgment.independence)
  assert.deepEqual(await assessmentHistory(task.id), [], 'The learner never needed the assess tool to run')
  const result = await homework.submit(student, courseId, task.id, { expectedAnswerRevision: ready.answerRevision, reportId: ready.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'learning-record-without-assess' })
  assert.deepEqual({ answer: result.answer, report: result.report }, { answer: saved.answer, report: ready.report })
  assert.equal((await homework.submissions(teacher, courseId, task.id)).items[0].id, result.id)
  assert.equal((await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM llm_calls WHERE company_id=$1 AND purpose='homework.assess'", [companyId])).rows[0].count, 0)
})

test('[integration] only the current learner persisted nonempty messages in this homework count as learning records', async () => {
  const { homework: task } = await published()
  const { homework: other } = await published({ title: 'A separate homework with separate learning records' })
  const thread = await homework.start(student, courseId, task.id)
  const otherThread = await homework.start(student, courseId, other.id)
  await homework.saveAnswer(student, courseId, task.id, { expectedRevision: 0, text: 'An answer draft alone is not a learning conversation.', links: [], attachments: [] })
  const variants = [
    { name: 'no message', messages: [] },
    { name: 'empty learner message', channelId: thread.channelId, fromUid: student.userId, role: 'user' as const, text: '   ' },
    { name: 'assistant answer', channelId: thread.channelId, fromUid: thread.agentId, role: 'assistant' as const, text: 'The assistant supplies a complete solution.' },
    { name: 'peer learner', channelId: thread.channelId, fromUid: peer.userId, role: 'user' as const, text: 'A different learner supplies the explanation.' },
    { name: 'outsider learner', channelId: thread.channelId, fromUid: outsider.userId, role: 'user' as const, text: 'An outsider supplies the explanation.' },
    { name: 'different homework', channelId: otherThread.channelId, fromUid: student.userId, role: 'user' as const, text: 'My genuine learning for another homework.' },
  ]
  for (const variant of variants) {
    im.messages.length = 0
    if ('channelId' in variant) im.messages.push({ channelId: variant.channelId!, channelType: 2, messageId: `invalid-${variant.name}`, clientMsgNo: `invalid-${variant.name}`,
      messageSeq: 1, fromUid: variant.fromUid!, timestamp: Date.now() / 1000,
      payload: createNativeMessage({ id: `invalid-${variant.name}`, role: variant.role!, content: [{ type: 'text', text: variant.text! }] }) })
    const state = (await homework.detail(student, courseId, task.id)).student!
    assert.equal(Reflect.get(state, 'hasLearningRecord'), false, variant.name)
    assert.equal(state.canSubmit, false, variant.name)
    await assert.rejects(homework.requestReport(student, courseId, task.id, { expectedAnswerRevision: 1 }), variant.name)
    await assert.rejects(homework.submit(student, courseId, task.id, { expectedAnswerRevision: 1, reportId: 'invented-ready-report', conversationReferences:currentReferences(), idempotencyKey: `no-record-${variant.name}` }), variant.name)
  }
  assert.deepEqual(await assessmentHistory(task.id), [])
  assert.equal((await homework.submissions(student, courseId, task.id)).items.length, 0)
  assert.equal((await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM llm_calls WHERE company_id=$1 AND purpose='homework.report'", [companyId])).rows[0].count, 0)
})

test('[integration] an authorized unreadable learning attachment alone permits an unverified submission while revoked access still rejects', async () => {
  const { homework: task } = await published()
  const thread = await homework.start(student, courseId, task.id)
  const { storage } = await import('../storage.js')
  const key = `attachments/${companyId}/learning-photo.png`, messageId = 'committed-learning-photo'
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4NQAAAAASUVORK5CYII=', 'base64')
  await storage.put(key, bytes, 'image/png')
  await pool.query(`INSERT INTO uploaded_files(storage_key,company_id,owner_user_id,company_period_id)
    SELECT $1,$2,$3,period_id FROM company_memberships WHERE company_id=$2 AND user_id=$3 AND ended_at IS NULL`, [key, companyId, student.userId])
  im.messages.push({ channelId: thread.channelId, channelType: 2, messageId, clientMsgNo: messageId, messageSeq: im.messages.length + 1,
    fromUid: student.userId, timestamp: Date.now() / 1000,
    payload: createNativeMessage({ id: messageId, role: 'user', content: [], attachments: [{ id: key, type: 'file', name: 'learning-photo.png',
      contentType: 'image/png', status: { type: 'complete' }, content: [{ type: 'file', data: key, sourceType: 'id', mimeType: 'image/png' }] }] }) })
  await pool.query(`INSERT INTO knowledge_sources(id,company_id,project_id,conversation_id,title,kind,status,visibility_scope,
    owner_user_id,created_by_user_id,created_via,origin_client_msg_no,origin_attachment_id)
    VALUES('homework-photo-source',$1,$2,$3,'Learner photo','text','ready','PRIVATE',$4,$4,'USER',$5,$6)`,
    [companyId, projectId, thread.channelId, student.userId, messageId, key])
  commitAssistantReply(thread)
  await homework.saveAnswer(student, courseId, task.id, { expectedRevision: 0, text: 'My current attempt is attached in the learning conversation; I need teacher feedback.', links: [], attachments: [] })
  const judgment = { ...evidenceJudgment(task.criteria, messageId, '', false), evidence: [] }
  const ready = await report(task.id, judgment)
  assert.equal(Reflect.get(ready, 'hasLearningRecord'), true)
  assert.equal(Reflect.get(ready.report!, 'verification'), 'unverified')
  assert.equal(ready.unlocked, false)
  assert.ok(ready.report!.criteria.every(item => !item.met && !item.independent))
  assert.match(JSON.stringify(ready.report), /附件[^。\n]{0,100}(?:未|无法|不能|不可)[^。\n]{0,30}(?:读取|核实|核验)/)
  assert.deepEqual(ready.report!.evidenceSources, [], 'An unread image cannot become a fabricated textual excerpt')
  assert.deepEqual(await assessmentHistory(task.id), [])
  const submitted = await homework.submit(student, courseId, task.id, { expectedAnswerRevision: ready.answerRevision, reportId: ready.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'file-only-learning-record' })
  assert.deepEqual(submitted.report, ready.report)
  await pool.query(`INSERT INTO conversation_source_exclusions(conversation_id,source_id,user_id) VALUES($1,'homework-photo-source',$2)`, [thread.channelId, student.userId])
  await assert.rejects(homework.submit(student, courseId, task.id, { expectedAnswerRevision: ready.answerRevision, reportId: ready.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'revoked-file-only-learning-record' }))
  assert.equal((await homework.submissions(student, courseId, task.id)).items.length, 1)
})

test('[integration] a changed learning conversation invalidates its report preview even when no assessment ran', async () => {
  const { homework: task } = await published()
  const thread = await homework.start(student, courseId, task.id)
  const first = commitLearnerEvidence(thread, 'I currently multiply base 10 by height 3 and get 30 square units.')
  const answer = { text: 'I need help with the factor one half.', links: [], attachments: [] }
  await homework.saveAnswer(student, courseId, task.id, { ...answer, expectedRevision: 0 })
  const ready = await report(task.id, evidenceJudgment(task.criteria, first.clientMsgNo, first.text, false))
  const second = commitLearnerEvidence(thread, 'I copied the assistant explanation and still cannot justify why dividing by two is valid.')
  await assert.rejects(homework.submit(student, courseId, task.id, { expectedAnswerRevision: ready.answerRevision, reportId: ready.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'stale-learning-preview' }))
  assert.equal((await homework.submissions(student, courseId, task.id)).items.length, 0)
  const updated = await report(task.id, evidenceJudgment(task.criteria, second.clientMsgNo, second.text, false))
  assert.notEqual(Reflect.get(updated.report!, 'evidenceHash'), Reflect.get(ready.report!, 'evidenceHash'))
  assert.equal(updated.answerRevision, ready.answerRevision)
  const submitted = await homework.submit(student, courseId, task.id, { expectedAnswerRevision: updated.answerRevision, reportId: updated.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'current-learning-preview' })
  assert.deepEqual(submitted.answer, answer)
  assert.deepEqual(await assessmentHistory(task.id), [])
})

for (const appendedRole of ['user', 'assistant'] as const) test(`[integration] a genuine ${appendedRole} message committed while submission waits for authorization rejects the old report`, async () => {
  const { homework: task } = await published()
  const thread = await homework.start(student, courseId, task.id)
  const original = commitLearnerEvidence(thread, 'I still need help explaining why the triangle is half of the rectangle.')
  const answer = { text: 'Keep this private partial answer after the stale submission is rejected.', links: [], attachments: [] }
  await homework.saveAnswer(student, courseId, task.id, { ...answer, expectedRevision: 0 })
  const ready = await report(task.id, evidenceJudgment(task.criteria, original.clientMsgNo, original.text, false))
  let entered!: () => void, release!: () => void
  const started = new Promise<void>(resolve => { entered = resolve }), held = new Promise<void>(resolve => { release = resolve })
  const delayed = new HomeworkApplication(pool, work => withTransaction(pool, async db => { entered(); await held; return work(db) }))
  const completed = delayed.submit(student, courseId, task.id, { expectedAnswerRevision: ready.answerRevision, reportId: ready.report!.id, conversationReferences:currentReferences(), idempotencyKey: `waiting-report-${appendedRole}` })
    .then(value => ({ value }), error => ({ error }))
  const blocker = await pool.connect()
  try {
    await Promise.race([started, delay(10000).then(() => assert.fail('Submission did not reach its final transaction'))])
    await blocker.query('BEGIN')
    await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [student.userId])
    const { rows: [{ pid }] } = await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
    release(); await waitForActorLock(pid)
    if (appendedRole === 'user') commitLearnerEvidence(thread, 'I now admit that I copied the explanation and cannot solve the new example.')
    else {
      const messageId = `assistant-help-during-submit-${im.messages.length + 1}`
      im.messages.push({ channelId: thread.channelId, channelType: 2, messageId, clientMsgNo: messageId, messageSeq: im.messages.length + 1,
        fromUid: thread.agentId, timestamp: Date.now() / 1000, payload: createNativeMessage({ id: messageId, role: 'assistant',
          content: [{ type: 'text', text: 'Here is additional help: multiply base by perpendicular height and divide by two.' }] }) })
    }
    await blocker.query('COMMIT')
    assert.ok('error' in await completed, 'A report checked before the lock wait must not cover a newer conversation')
    assert.deepEqual((await homework.detail(student, courseId, task.id)).student!.answer, answer)
    assert.equal((await homework.submissions(student, courseId, task.id)).items.length, 0)
  } finally { release(); await blocker.query('ROLLBACK'); blocker.release(); await completed }
})

test('[integration] invalid model claims yield an explicitly unverified factual report that the learner may submit', async () => {
  const { homework: task } = await published()
  const thread = await homework.start(student, courseId, task.id)
  const message = commitLearnerEvidence(thread, 'I asked for help because I do not understand the factor one half.')
  await homework.saveAnswer(student, courseId, task.id, { expectedRevision: 0, text: 'This is my current partial answer and request for teacher feedback.', links: [], attachments: [] })
  const badJudgment = { ...evidenceJudgment(task.criteria, message.clientMsgNo, message.text, true),
    completion: 'unsupported-completion-sentinel', independence: 'unsupported-independence-sentinel',
    evidence: [{ messageId: 'invented-model-evidence', excerpt: 'unsupported-evidence-sentinel' }] }
  const ready = await report(task.id, badJudgment)
  assert.equal(modelReplies.length, 0, 'The actual model attempt precedes the safe unverified record')
  assert.equal(Reflect.get(ready.report!, 'verification'), 'unverified')
  assert.equal(ready.unlocked, false)
  assert.ok(ready.report!.criteria.every(item => !item.met && !item.independent && /未.*核实|未.*核验|无法.*核实/.test(item.feedback)))
  assert.match(ready.report!.completion, /未.*核实|未.*核验|无法.*核实/)
  assert.doesNotMatch(JSON.stringify(ready.report), /unsupported-(?:completion|independence|evidence)-sentinel|invented-model-evidence/)
  assert.ok(ready.report!.evidenceSources.some(item => item.messageId === message.clientMsgNo && message.text.includes(item.excerpt)))
  const { learnerHomeworkRead, teacherHomeworkOverview } = await import('../modules/learning/homework-reporting.js')
  const learnerView = await learnerHomeworkRead(pool, student, courseId, { homeworkId: task.id, section: 'report', offset: 0 }, AbortSignal.timeout(10000))
  assert.ok('text' in learnerView)
  assert.equal(JSON.parse(learnerView.text).verification, 'unverified', 'The learner native read must retain the qualification')
  const submitted = await homework.submit(student, courseId, task.id, { expectedAnswerRevision: ready.answerRevision, reportId: ready.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'explicit-unverified-submission' })
  assert.deepEqual(submitted.report, ready.report)
  const teacherView = await teacherHomeworkOverview(pool, teacher, courseId, { homeworkId: task.id, learnerId: student.userId, section: 'report', offset: 0 })
  assert.ok('text' in teacherView)
  assert.equal(JSON.parse(teacherView.text).verification, 'unverified', 'The teacher native read must not present unverified flags as a confirmed finding')
  assert.equal((await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM llm_calls WHERE company_id=$1 AND purpose='homework.report'", [companyId])).rows[0].count, 1)
})

test('[integration] optional assessment diagnostics do not invalidate a ready report for unchanged learning records', async () => {
  const { homework: task } = await published()
  const thread = await homework.start(student, courseId, task.id)
  const first = commitLearnerEvidence(thread, 'I understand that two triangles form a rectangle, but need help using the formula.')
  const second = commitLearnerEvidence(thread, 'My attempted new example is still incomplete.')
  await homework.saveAnswer(student, courseId, task.id, { expectedRevision: 0, text: 'This partial answer needs teacher feedback.', links: [], attachments: [] })
  const judgment = evidenceJudgment(task.criteria, first.clientMsgNo, first.text, false)
  const ready = await report(task.id, judgment)
  const receipt = await nativeAssessment(task.id, thread, [second.clientMsgNo])
  const pending = (await homework.detail(student, courseId, task.id)).student!
  assert.deepEqual(pending.report, ready.report)
  assert.equal(pending.reportStatus, 'READY')
  assert.notEqual(pending.evidenceRevision, ready.evidenceRevision)
  modelReplies.push(evidenceJudgment(task.criteria, second.clientMsgNo, second.text, false))
  await runLearningEffects()
  const assessed = (await homework.detail(student, courseId, task.id)).student!
  assert.deepEqual(assessed.report, ready.report)
  assert.equal((await receipt.verify()).status, 'passed')
  const submitted = await homework.submit(student, courseId, task.id, { expectedAnswerRevision: ready.answerRevision, reportId: ready.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'assessment-is-informational' })
  assert.deepEqual(submitted.report, ready.report)
})

test('[integration] canonical assessment retries reuse pending and negative ready evidence without erasing manual review or reports', async () => {
  const [{ claimLearningEffects, completeLearningEffect }, { runHomeworkEffect }] = await Promise.all([
    import('../modules/learning/effects-repository.js'), import('../modules/learning/homework-effects.js'),
  ])
  const { homework: task } = await published()
  const thread = await homework.start(student, courseId, task.id)
  const firstMessage = commitLearnerEvidence(thread, 'I think base times height is the full triangle area.')
  const secondMessage = commitLearnerEvidence(thread, 'For base 10 and height 3 I got 30 and cannot explain the one-half factor.')
  const first = await nativeAssessment(task.id, thread, [firstMessage.messageId, secondMessage.clientMsgNo])
  const retried = await concurrentAssessments(task.id, thread, [
    [secondMessage.messageId, firstMessage.clientMsgNo],
    [firstMessage.clientMsgNo, firstMessage.messageId, secondMessage.messageId],
    [firstMessage.clientMsgNo, secondMessage.clientMsgNo],
  ])
  assert.deepEqual([first, ...retried].map(item => item.value.evidenceRevision), [1, 1, 1, 1])
  assert.deepEqual(retried.map(item => item.value), retried.map(() => first.value))
  assert.deepEqual(await assessmentHistory(task.id), [{ id: first.value.assessmentId, status: 'PENDING', evidence_revision: 1, return_epoch: 0 }])
  const negative = evidenceJudgment(task.criteria, secondMessage.clientMsgNo, secondMessage.text, false)
  const [effect] = await claimLearningEffects(pool, 1)
  assert.equal(effect.kind, 'homework.assess')
  let entered!: () => void, release!: () => void
  const started = new Promise<void>(resolve => { entered = resolve }), held = new Promise<void>(resolve => { release = resolve })
  modelReplies.push(async () => { entered(); await held; return negative })
  const running = runHomeworkEffect(effect).then(() => null, error => error as Error)
  try {
    await Promise.race([started, delay(10_000).then(() => assert.fail('Assessment model did not start'))])
    assert.deepEqual((await nativeAssessment(task.id, thread, [secondMessage.messageId, firstMessage.messageId])).value, first.value)
    release(); assert.equal(await running, null); await completeLearningEffect(pool, effect)
  } finally { release(); await running }
  assert.deepEqual(await assessmentHistory(task.id), [{ id: first.value.assessmentId, status: 'READY', evidence_revision: 1, return_epoch: 0 }])
  const ready = await nativeAssessment(task.id, thread, [firstMessage.clientMsgNo, secondMessage.clientMsgNo])
  assert.deepEqual(ready.value, { ...first.value, status: 'READY' })
  assert.equal((await first.verify()).status, 'passed', 'Completing and repeating the same evidence preserves the native receipt')
  await homework.saveAnswer(student, courseId, task.id, { expectedRevision: 0, text: 'My private answer is still being reviewed.', links: [], attachments: [] })
  await homework.shareEvidence(student, courseId, task.id, { expectedEvidenceRevision: 1 })
  await homework.manualUnlock(teacher, courseId, task.id, { learnerId: student.userId, expectedEvidenceRevision: 1, reason: 'I checked the shared evidence orally and retain the recorded doubts.' })
  const beforeRetry = await report(task.id, negative)
  assert.ok(beforeRetry.report!.manualReview && beforeRetry.manualReview)
  assert.ok(beforeRetry.criteria.every(item => !item.met && !item.independent))
  assert.deepEqual((await nativeAssessment(task.id, thread, [secondMessage.clientMsgNo, firstMessage.messageId])).value, ready.value)
  assert.deepEqual((await homework.detail(student, courseId, task.id)).student, beforeRetry)
  await runLearningEffects()
  assert.equal(modelReplies.length, 0)
  assert.equal((await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM llm_calls WHERE company_id=$1 AND purpose='homework.assess'", [companyId])).rows[0].count, 1)
  assert.equal((await first.verify()).status, 'passed')
})

test('[integration] invalid assessment retries converge once while new evidence and teacher returns invalidate old native receipts', async () => {
  const { homework: task } = await published()
  const thread = await homework.start(student, courseId, task.id)
  const message = commitLearnerEvidence(thread, 'Two equal triangles make a rectangle, so each has half the area. Base 10 and height 3 gives 15 square units.')
  const initial = await nativeAssessment(task.id, thread, [message.clientMsgNo])
  const judgment = evidenceJudgment(task.criteria, message.clientMsgNo, message.text, true)
  modelReplies.push({ ...judgment, evidence: [{ messageId: 'invented-evidence', excerpt: 'not committed by the learner' }] })
  await runLearningEffects()
  assert.equal((await assessmentHistory(task.id))[0].status, 'INVALID')
  assert.equal(modelReplies.length, 0)
  const retry = await concurrentAssessments(task.id, thread, [[message.messageId], [message.clientMsgNo], [message.clientMsgNo, message.messageId]])
  assert.deepEqual(retry.map(item => item.value.evidenceRevision), [2, 2, 2])
  assert.deepEqual(retry.map(item => item.value), retry.map(() => retry[0].value))
  assert.notEqual(retry[0].value.assessmentId, initial.value.assessmentId)
  assert.deepEqual((await assessmentHistory(task.id)).map(item => ({ status: item.status, revision: item.evidence_revision })),
    [{ status: 'INVALID', revision: 1 }, { status: 'PENDING', revision: 2 }])
  modelReplies.push(judgment); await runLearningEffects()
  assert.deepEqual((await nativeAssessment(task.id, thread, [message.clientMsgNo])).value, { ...retry[0].value, status: 'READY' })
  assert.equal((await retry[0].verify()).status, 'passed')
  const newMessage = commitLearnerEvidence(thread, 'With base 8 and height 5, half of the rectangle area 40 is 20 square units.')
  const changed = await nativeAssessment(task.id, thread, [newMessage.messageId])
  assert.equal(changed.value.evidenceRevision, 3)
  assert.notEqual(changed.value.assessmentId, retry[0].value.assessmentId)
  assert.equal((await retry[0].verify()).status, 'failed', 'A receipt for older evidence cannot verify the replacement')
  const newJudgment = evidenceJudgment(task.criteria, newMessage.clientMsgNo, newMessage.text, true)
  modelReplies.push(newJudgment); await runLearningEffects()
  await homework.saveAnswer(student, courseId, task.id, { expectedRevision: 0, text: 'The independently explained triangle area is 20 square units.', links: [], attachments: [] })
  const ready = await report(task.id, newJudgment)
  assert.deepEqual((await nativeAssessment(task.id, thread, [newMessage.clientMsgNo])).value, { ...changed.value, status: 'READY' })
  assert.deepEqual((await homework.detail(student, courseId, task.id)).student, ready)
  await homework.submit(student, courseId, task.id, { expectedAnswerRevision: ready.answerRevision, reportId: ready.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'retry-contract-submission' })
  const submitted = (await homework.submissions(student, courseId, task.id)).items[0]
  await homework.review(teacher, courseId, task.id, { learnerId: student.userId, expectedSubmissionId: submitted.id, decision: 'RETURNED', reason: 'Explain how doubling the height changes the area.' })
  assert.equal((await homework.detail(student, courseId, task.id)).student!.evidenceRevision, 3)
  assert.equal((await changed.verify()).status, 'failed', 'A teacher return invalidates the native receipt before any new assessment')
  const afterReturn = await nativeAssessment(task.id, thread, [newMessage.clientMsgNo])
  assert.equal(afterReturn.value.evidenceRevision, 4)
  assert.equal(afterReturn.value.returnEpoch, changed.value.returnEpoch + 1)
  assert.notEqual(afterReturn.value.assessmentId, changed.value.assessmentId)
  await runLearningEffects()
  assert.deepEqual((await assessmentHistory(task.id)).map(item => ({ status: item.status, revision: item.evidence_revision, epoch: item.return_epoch })),
    [{ status: 'INVALID', revision: 1, epoch: 0 }, { status: 'READY', revision: 2, epoch: 0 }, { status: 'READY', revision: 3, epoch: 0 }, { status: 'INVALID', revision: 4, epoch: 1 }])
  assert.equal((await homework.detail(student, courseId, task.id)).student!.unlocked, false)
  assert.equal(modelReplies.length, 0, 'Pre-return evidence must fail before another model request')
})

for (const orphanedEffect of ['missing', 'completed'] as const) test(`[integration] pending assessment retry restores a ${orphanedEffect} effect without replacing the evidence receipt`, async () => {
  const [{ claimLearningEffects, completeLearningEffect }, { runHomeworkEffect }] = await Promise.all([
    import('../modules/learning/effects-repository.js'), import('../modules/learning/homework-effects.js'),
  ])
  const { homework: task } = await published()
  const thread = await homework.start(student, courseId, task.id)
  const message = commitLearnerEvidence(thread, 'Two equal triangles make a rectangle. Base 10 and height 3 gives half of 30, which is 15 square units.')
  const first = await nativeAssessment(task.id, thread, [message.clientMsgNo])
  const [pending] = await assessmentHistory(task.id)
  const effectScope = [companyId, task.id]
  if (orphanedEffect === 'missing') await pool.query("DELETE FROM learning_effects WHERE company_id=$1 AND kind='homework.assess' AND payload->>'homeworkId'=$2", effectScope)
  else await pool.query("UPDATE learning_effects SET status='completed',completed_at=clock_timestamp() WHERE company_id=$1 AND kind='homework.assess' AND payload->>'homeworkId'=$2", effectScope)
  assert.deepEqual((await nativeAssessment(task.id, thread, [message.messageId])).value, first.value)
  assert.deepEqual(await assessmentHistory(task.id), [pending])
  const effects = await claimLearningEffects(pool, 1)
  assert.equal(effects.length, 1, 'A retry must make the original pending assessment runnable again')
  assert.equal(effects[0].kind, 'homework.assess')
  modelReplies.push(evidenceJudgment(task.criteria, message.clientMsgNo, message.text, true))
  await runHomeworkEffect(effects[0]); await completeLearningEffect(pool, effects[0])
  assert.deepEqual(await assessmentHistory(task.id), [{ ...pending, status: 'READY' }])
  assert.equal((await homework.detail(student, courseId, task.id)).student!.unlocked, true)
  assert.equal((await first.verify()).status, 'passed')
  assert.equal(modelReplies.length, 0)
})

test('[integration] host assessment sees the assistants published commentary and public explanation when judging copied help', async () => {
  const { homework: task } = await published()
  const thread = await homework.start(student, courseId, task.id)
  const messageId = 'published-assistant-help'
  const commentary = 'Public hint: the triangle area is half of base times perpendicular height.'
  const explanation = 'Public explanation: for base 10 and height 3, the result is 15 square units.'
  im.messages.push({ channelId: thread.channelId, channelType: 2, messageId, clientMsgNo: messageId,
    messageSeq: 1, fromUid: thread.agentId, timestamp: Date.now() / 1000,
    payload: createNativeMessage({ id: messageId, role: 'assistant', content: [
      { type: 'text', text: commentary, providerMetadata: { lingxiloop: { activity: { version: 1, id: 'hint', kind: 'commentary', label: 'Published hint' } } } },
      { type: 'reasoning', text: explanation, providerMetadata: { lingxiloop: { activity: { version: 1, id: 'explanation', kind: 'commentary', label: 'Published explanation' } } } },
      { type: 'text', text: 'Now explain a different example independently.' },
    ] }) })
  const checked = await assess(task.id, false, student, 'The triangle area is half of base times perpendicular height. For base 10 and height 3, the result is 15 square units.')
  const request = lastModelRequest as { messages: { role: string; content: string }[] }
  const data = JSON.parse(request.messages.find(message => message.role === 'user')!.content) as { messages: { role: string; text: string }[] }
  const assistance = data.messages.filter(message => message.role === 'assistant').map(message => message.text).join('\n')
  assert.ok(assistance.includes(commentary), 'Visible assistant commentary must reach the host assistance context')
  assert.ok(assistance.includes(explanation), 'Explicitly published explanations must reach the host assistance context')
  assert.equal(checked.state.unlocked, false)
})

test('[integration] latest locked teacher decision wins when transaction start order differs from review order', async () => {
  const { homework: task } = await published()
  const mastered = await assess(task.id, true)
  await homework.saveAnswer(student, courseId, task.id, { expectedRevision: 0, text: 'Initial independent answer', links: [], attachments: [] })
  const ready = await report(task.id, mastered.judgment)
  const submitted = await homework.submit(student, courseId, task.id,
    { expectedAnswerRevision: ready.answerRevision, reportId: ready.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'review-order-submission' })
  let entered!: () => void, release!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  const held = new Promise<void>(resolve => { release = resolve })
  const delayed = new HomeworkApplication(pool, work => withTransaction(pool, async db => { entered(); await held; return work(db) }))
  const returned = delayed.review(teacher, courseId, task.id, { learnerId: student.userId,
    expectedSubmissionId: submitted.id, decision: 'RETURNED', reason: 'Explain the doubled height after my earlier acceptance.' }).then(() => null, error => error as Error)
  try {
    await started
    await homework.review(colleague, courseId, task.id, { learnerId: student.userId,
      expectedSubmissionId: submitted.id, decision: 'PASSED', reason: 'The original answer is accepted.' })
    assert.equal((await homework.detail(student, courseId, task.id)).student!.status, 'PASSED')
    release()
    assert.equal(await returned, null)
    const current = (await homework.detail(student, courseId, task.id)).student!
    assert.equal(current.status, 'RETURNED', 'The last serialized review must determine the current status')
    assert.equal(current.latestSubmission!.feedback, 'Explain the doubled height after my earlier acceptance.')
    const saved = await homework.saveAnswer(student, courseId, task.id,
      { expectedRevision: ready.answerRevision, text: 'I can revise work that the teacher has just returned.', links: [], attachments: [] })
    assert.equal(saved!.answerRevision, ready.answerRevision + 1)
  } finally { release(); await returned }
})

test('[integration] submitted time and late status use the same post-lock database time', async () => {
  const { homework: task } = await published({ dueAt: '2020-01-01T00:00:00.000Z' })
  const mastered = await assess(task.id, true)
  await homework.saveAnswer(student, courseId, task.id, { expectedRevision: 0, text: 'Independent answer submitted across the deadline.', links: [], attachments: [] })
  const ready = await report(task.id, mastered.judgment)
  const dueAt = new Date(Date.now() + 5_000).toISOString()
  await homework.extendDeadline(teacher, courseId, task.id, { expectedRevision: task.revision, dueAt })
  let entered!: () => void, release!: () => void, beganAt: Date | undefined
  const started = new Promise<void>(resolve => { entered = resolve })
  const held = new Promise<void>(resolve => { release = resolve })
  const delayed = new HomeworkApplication(pool, work => withTransaction(pool, async db => {
    beganAt = (await db.query<{ now: Date }>('SELECT NOW() AS now')).rows[0].now
    entered(); await held; return work(db)
  }))
  const submitted = delayed.submit(student, courseId, task.id,
    { expectedAnswerRevision: ready.answerRevision, reportId: ready.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'deadline-lock-wait' })
  const completed = submitted.then(value => ({ value }), error => ({ error }))
  const blocker = await pool.connect()
  try {
    await started
    assert.ok(beganAt && beganAt.getTime() < Date.parse(dueAt), 'The transaction must begin before the deadline')
    await blocker.query('BEGIN')
    await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [student.userId])
    const { rows: [{ pid }] } = await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
    release(); await waitForActorLock(pid)
    const { rows: [{ wait_ms }] } = await pool.query<{ wait_ms: number }>(
      'SELECT GREATEST(0,EXTRACT(EPOCH FROM $1::timestamptz-clock_timestamp())*1000)::float AS wait_ms', [dueAt])
    await delay(wait_ms + 25)
    const clockWaitEnd = performance.now() + 10_000
    let dbBeforeRelease = (await pool.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0].now
    while (dbBeforeRelease.getTime() <= Date.parse(dueAt) && performance.now() < clockWaitEnd) {
      await delay(20)
      dbBeforeRelease = (await pool.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0].now
    }
    assert.ok(dbBeforeRelease.getTime() > Date.parse(dueAt), 'The database clock must pass the deadline before the authorization lock is released')
    await blocker.query('COMMIT')
    const outcome = await completed
    if ('error' in outcome) throw outcome.error
    assert.equal(outcome.value.late, true, JSON.stringify({ dueAt, waitMs: wait_ms, dbBeforeRelease, submittedAt: outcome.value.submittedAt }))
    assert.ok(new Date(outcome.value.submittedAt).getTime() > Date.parse(dueAt), 'The recorded submission time must be after its deadline')
    const { rows } = await pool.query(`SELECT s.late=(s.submitted_at>h.due_at) AS consistent
      FROM homework_submissions s JOIN homeworks h ON h.id=s.homework_id WHERE s.id=$1`, [outcome.value.id])
    assert.equal(rows[0].consistent, true)
  } finally { release(); await blocker.query('ROLLBACK'); blocker.release(); await completed }
})

test('[integration] manual review waiting for the learner cannot deadlock with the learner saving a draft', async () => {
  const { homework: task } = await published()
  const missing = await assess(task.id, false)
  await homework.shareEvidence(student, courseId, task.id, { expectedEvidenceRevision: missing.state.evidenceRevision })
  const blocker = await pool.connect()
  let reviewed: Promise<Error | null> | undefined
  try {
    await blocker.query('BEGIN')
    await blocker.query("SET LOCAL lock_timeout='5s'")
    await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [student.userId])
    const { rows: [{ pid }] } = await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
    reviewed = homework.manualUnlock(teacher, courseId, task.id, { learnerId: student.userId,
      expectedEvidenceRevision: missing.state.evidenceRevision, reason: 'Independent explanation was verified orally.' }).then(() => null, error => error as Error)
    await waitForActorLock(pid)
    const saving = new HomeworkApplication(blocker, work => work(blocker))
    const saved = await saving.saveAnswer(student, courseId, task.id,
      { expectedRevision: 0, text: 'Concurrent private answer survives the manual review.', links: [], attachments: [] })
    assert.equal(saved!.answerRevision, 1)
    await blocker.query('COMMIT')
    assert.equal(await reviewed, null, 'Manual review and learner changes must share a consistent dependency lock order')
    const state = (await homework.detail(student, courseId, task.id)).student!
    assert.equal(state.answer.text, 'Concurrent private answer survives the manual review.')
    assert.equal(state.unlocked, true)
  } finally { await blocker.query('ROLLBACK'); blocker.release(); await reviewed }
})

test('[integration] private drafts and truthful partial mastery reports form one idempotent versioned submission pair', async () => {
  const { homework: task } = await published({ dueAt: '2020-01-01T00:00:00.000Z' })
  const locked = (await homework.detail(student, courseId, task.id)).student!
  assert.equal(locked.unlocked, false)
  await homework.saveAnswer(student, courseId, task.id, { expectedRevision: locked.answerRevision, text: 'private-answer-sentinel', links: [], attachments: [] })
  const teacherView = await homework.detail(teacher, courseId, task.id)
  assert.equal(teacherView.student, null)
  assert.doesNotMatch(JSON.stringify(await homework.learners(teacher, courseId, task.id)), /private-answer-sentinel|answerRevision|"report"/)
  await assert.rejects(homework.submit(student, courseId, task.id, { expectedAnswerRevision: 1, reportId: 'invented-report', conversationReferences:currentReferences(), idempotencyKey: 'premature-submit' }))
  assert.equal((await call(student, path(task.id, '/answer'), 'PATCH', { expectedRevision: 1, text: 'forged', links: [], attachments: [], unlocked: true })).status, 400)
  const missing = await assess(task.id, false)
  assert.equal(missing.state.unlocked, false)
  await assert.rejects(homework.requestAssessment(student, courseId, task.id, { messageIds: [missing.messageId] }, { agentId: missing.thread.agentId, channelId: 'foreign-thread' }))
  await assert.rejects(homework.requestAssessment(peer, courseId, task.id, { messageIds: [missing.messageId] }, { agentId: missing.thread.agentId, channelId: missing.thread.channelId }))
  const partial = { ...missing.judgment, criteria: missing.judgment.criteria.map((item, index) => ({ ...item, met: index === 0, independent: false })) }
  const ready = await report(task.id, partial)
  assert.equal(ready.unlocked, false)
  assert.equal(Reflect.get(ready.report!, 'verification'), 'verified')
  assert.deepEqual(ready.report!.criteria, partial.criteria)
  const input = { expectedAnswerRevision: ready.answerRevision, reportId: ready.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'same-human-click' }
  const [first, retried] = await Promise.all([homework.submit(student, courseId, task.id, input), homework.submit(student, courseId, task.id, input)])
  assert.deepEqual(retried, first)
  const history = await homework.submissions(student, courseId, task.id)
  assert.equal(history.items.length, 1)
  assert.equal(history.items[0].late, true)
  assert.equal(history.items[0].answer.text, 'private-answer-sentinel')
  assert.equal(history.items[0].report.id, ready.report!.id)
  assert.equal((await homework.submissions(peer, courseId, task.id)).items.length, 0)
  assert.equal((await homework.submissions(teacher, courseId, task.id)).items.length, 1)
  await assert.rejects(homework.submissions(outsider, courseId, task.id))
  const changed = await homework.saveAnswer(student, courseId, task.id, { expectedRevision: ready.answerRevision, text: 'Revised private answer', links: [], attachments: [] })
  assert.ok(changed)
  assert.equal(changed.report, null)
  await assert.rejects(homework.submit(student, courseId, task.id, { ...input, expectedAnswerRevision: changed.answerRevision }))
  assert.equal((await homework.submissions(student, courseId, task.id)).items[0].answer.text, 'private-answer-sentinel')
  await assert.rejects(homework.updateDraft(teacher, courseId, task.id, { ...visible, expectedRevision: task.revision, instructions: 'Silently change published rules' }))
})

test('[integration] pending replacement preserves history, stale teacher review rejects, and closed return exception is consumed once', async () => {
  const { homework: task } = await published()
  const mastered = await assess(task.id, true)
  let state = await homework.saveAnswer(student, courseId, task.id, { expectedRevision: 0, text: 'First independently written answer', links: [], attachments: [] })
  state = await report(task.id, mastered.judgment)
  await homework.submit(student, courseId, task.id, { expectedAnswerRevision: state.answerRevision, reportId: state.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'first-submission' })
  const first = (await homework.submissions(student, courseId, task.id)).items[0]
  state = await homework.saveAnswer(student, courseId, task.id, { expectedRevision: state.answerRevision, text: 'Improved independently written answer', links: [], attachments: [] })
  state = await report(task.id, mastered.judgment)
  await homework.submit(student, courseId, task.id, { expectedAnswerRevision: state.answerRevision, reportId: state.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'second-submission' })
  const history = await homework.submissions(student, courseId, task.id)
  assert.deepEqual(history.items.map(item => item.version), [2, 1])
  const latest = history.items[0]
  await assert.rejects(homework.review(teacher, courseId, task.id, { learnerId: student.userId, expectedSubmissionId: first.id, decision: 'PASSED', reason: 'Stale review' }))
  await assert.rejects(homework.review(peer, courseId, task.id, { learnerId: student.userId, expectedSubmissionId: latest.id, decision: 'PASSED', reason: 'Peer cannot review' }))
  await homework.review(teacher, courseId, task.id, { learnerId: student.userId, expectedSubmissionId: latest.id, decision: 'PASSED', reason: 'Independent reasoning accepted.' })
  await assert.rejects(homework.saveAnswer(student, courseId, task.id, { expectedRevision: state.answerRevision, text: 'Change accepted work', links: [], attachments: [] }))
  await homework.close(teacher, courseId, task.id, { expectedRevision: task.revision })
  await homework.review(teacher, courseId, task.id, { learnerId: student.userId, expectedSubmissionId: latest.id, decision: 'RETURNED', reason: 'Explain how the area changes when the height doubles.' })
  await assert.rejects(homework.submit(student, courseId, task.id, { expectedAnswerRevision: state.answerRevision, reportId: state.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'return-without-recheck' }))
  const returned = (await homework.detail(student, courseId, task.id)).student!
  assert.equal(returned.canSubmit, true, 'A returned learner retains a genuine learning record without proving mastery again')
  const assessmentCount = (await assessmentHistory(task.id)).length
  state = await homework.saveAnswer(student, courseId, task.id, { expectedRevision: state.answerRevision, text: 'The area doubles because the rectangle area doubles and the triangle remains one half.', links: [], attachments: [] })
  const currentFeedback = 'Explain how the area changes when the height doubles.'
  const revisionJudgment = { ...mastered.judgment, criteria: mastered.judgment.criteria.map(item => ({ ...item, met: false, independent: false, feedback: currentFeedback })),
    completion: `Current teacher feedback still needs review: ${currentFeedback}`, weaknesses: [currentFeedback] }
  state = await report(task.id, revisionJudgment)
  assert.equal((await assessmentHistory(task.id)).length, assessmentCount, 'Returning work must not require another assessment call')
  const request = lastModelRequest as { messages: { role: string; content: string }[] }
  const data = JSON.parse(request.messages.find(message => message.role === 'user')!.content) as { teacherFeedback: string }
  assert.equal(data.teacherFeedback, currentFeedback)
  assert.ok(state.report!.completion.includes(currentFeedback))
  assert.ok(state.report!.returnEpoch > latest.report.returnEpoch)
  await homework.submit(student, courseId, task.id, { expectedAnswerRevision: state.answerRevision, reportId: state.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'closed-return-resubmission' })
  assert.deepEqual((await homework.submissions(student, courseId, task.id)).items.map(item => item.version), [3, 2, 1])
  await assert.rejects(homework.submit(student, courseId, task.id, { expectedAnswerRevision: state.answerRevision, reportId: state.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'closed-exception-consumed' }))
  const other = await assess(task.id, true, peer)
  const peerAnswer = await homework.saveAnswer(peer, courseId, task.id, { expectedRevision: other.state.answerRevision, text: 'First answer after close', links: [], attachments: [] })
  assert.ok(peerAnswer)
  await assert.rejects(homework.requestReport(peer, courseId, task.id, { expectedAnswerRevision: peerAnswer.answerRevision }))
  await assert.rejects(homework.submit(peer, courseId, task.id, { expectedAnswerRevision: peerAnswer.answerRevision, reportId: 'closed-first-report', conversationReferences:currentReferences(), idempotencyKey: 'closed-first-submission' }))
})

test('[integration] manual unlock needs learner-shared evidence and preserves unresolved host findings without exposing private drafts', async () => {
  const { homework: task } = await published()
  await homework.saveAnswer(student, courseId, task.id, { expectedRevision: 0, text: 'private-unsubmitted-answer', links: [], attachments: [] })
  await assert.rejects(homework.manualUnlock(teacher, courseId, task.id, { learnerId: student.userId, expectedEvidenceRevision: 0, reason: 'No evidence yet' }))
  const missing = await assess(task.id, false)
  await assert.rejects(homework.manualUnlock(teacher, courseId, task.id, { learnerId: student.userId, expectedEvidenceRevision: missing.state.evidenceRevision, reason: 'Not shared yet' }))
  await homework.shareEvidence(student, courseId, task.id, { expectedEvidenceRevision: missing.state.evidenceRevision })
  const summary = JSON.stringify(await homework.learners(teacher, courseId, task.id))
  assert.doesNotMatch(summary, /private-unsubmitted-answer/)
  await homework.manualUnlock(teacher, courseId, task.id, { learnerId: student.userId, expectedEvidenceRevision: missing.state.evidenceRevision, reason: 'I verified the relationship orally using the shared evidence.' })
  const ready = await report(task.id, missing.judgment)
  assert.equal(ready.unlocked, true)
  assert.ok(ready.report!.manualReview)
  assert.ok(ready.report!.manualReview!.remainingDoubts.length > 0)
  assert.ok(ready.report!.criteria.some(item => !item.met))
  await homework.close(teacher, courseId, task.id, { expectedRevision: task.revision })
  await assert.rejects(homework.submit(student, courseId, task.id, { expectedAnswerRevision: ready.answerRevision, reportId: ready.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'manual-does-not-bypass-close' }))
})

test('[integration] fabricated assessment evidence stays invalid while an unreadable authorized answer permits an unverified submission', async () => {
  const { homework: task } = await published()
  const missing = await assess(task.id, false)
  const revised = commitLearnerEvidence(missing.thread, 'I now propose a new independent explanation for review.')
  await homework.requestAssessment(student, courseId, task.id, { messageIds: [revised.clientMsgNo] }, { agentId: missing.thread.agentId, channelId: missing.thread.channelId })
  modelReplies.push({ ...missing.judgment, criteria: missing.judgment.criteria.map(item => ({ ...item, met: true, independent: true })),
    evidence: [{ messageId: 'fabricated-uncommitted-message', excerpt: 'invented mastery' }] })
  await runLearningEffects()
  assert.equal(modelReplies.length, 0, 'The fabricated provider result must actually be consumed by a new evidence assessment')
  assert.deepEqual((await assessmentHistory(task.id)).map(item => ({ status: item.status, revision: item.evidence_revision })),
    [{ status: 'READY', revision: 1 }, { status: 'INVALID', revision: 2 }])
  const rejected = (await homework.detail(student, courseId, task.id)).student!
  assert.equal(rejected.unlocked, false)
  assert.ok(rejected.criteria.every(item => !item.met && item.feedback.length > 0 && item.feedback !== '等待学习证据'))
  const mastered = await assess(task.id, true)
  const key = `attachments/${companyId}/unreadable.png`
  await pool.query(`INSERT INTO uploaded_files(storage_key,company_id,owner_user_id,company_period_id)
    SELECT $1,$2,$3,period_id FROM company_memberships WHERE company_id=$2 AND user_id=$3 AND ended_at IS NULL`, [key, companyId, student.userId])
  const { storage } = await import('../storage.js')
  await storage.put(key, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4NQAAAAASUVORK5CYII=', 'base64'), 'image/png')
  const answer = { text: 'Preserve this answer on failed file reading', links: [], attachments: [{ key, name: 'unreadable.png' }] }
  const saved = await homework.saveAnswer(student, courseId, task.id, { ...answer, expectedRevision: mastered.state.answerRevision })
  assert.ok(saved)
  await homework.requestReport(student, courseId, task.id, { expectedAnswerRevision: saved.answerRevision })
  modelReplies.push({ ...mastered.judgment, criteria: mastered.judgment.criteria.map(item => ({ ...item, met: false, independent: false })) })
  await runLearningEffects()
  const ready = (await homework.detail(student, courseId, task.id)).student!
  const effectState = ready.reportStatus === 'READY' ? [] : (await pool.query(`SELECT status,attempts,available_at,lease_expires_at,NOW() AS transaction_time,clock_timestamp() AS observed_at,
    CASE WHEN error IS NULL THEN 'none' WHEN error ILIKE '%deadlock%' THEN 'deadlock' WHEN error ILIKE '%lease%' THEN 'lease' ELSE 'other' END AS error_kind
    FROM learning_effects WHERE company_id=$1 AND kind='homework.report' AND payload->>'homeworkId'=$2`, [companyId, task.id])).rows
  assert.equal(ready.reportStatus, 'READY', JSON.stringify(effectState))
  assert.deepEqual(ready.answer, answer)
  assert.equal(Reflect.get(ready.report!, 'verification'), 'unverified')
  assert.equal(ready.unlocked, false, 'A previous positive assessment cannot hide the current answer-reading limitation')
  assert.ok(ready.report!.criteria.every(item => !item.met && !item.independent))
  assert.match(JSON.stringify(ready.report), /附件[^。\n]{0,100}(?:未|无法|不能|不可)[^。\n]{0,30}(?:读取|核实|核验)/)
  assert.doesNotMatch(JSON.stringify(ready.report), /API_KEY|Authorization|Bearer|prompt_tokens/)
  const submitted = await homework.submit(student, courseId, task.id, { expectedAnswerRevision: saved.answerRevision, reportId: ready.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'unreadable-answer-not-understood' })
  assert.deepEqual({ answer: submitted.answer, report: submitted.report }, { answer, report: ready.report })
})

test('[integration] changed bytes of a committed chat attachment invalidate a ready report without losing the answer', async () => {
  const { homework: task } = await published()
  const { storage } = await import('../storage.js')
  const key = `attachments/${companyId}/original-evidence.txt`
  await storage.put(key, Buffer.from('Canonical material version A'), 'text/plain')
  const checked = await assess(task.id, true, student, 'Two equal triangles make a rectangle, so each has half the area. A base of 10 and height of 3 gives area 15.', key)
  await homework.saveAnswer(student, courseId, task.id, { expectedRevision: 0, text: 'Keep this independent explanation after evidence changes', links: [], attachments: [] })
  const ready = await report(task.id, checked.judgment)
  assert.ok(ready.report!.materialHashes.length >= 1)
  await storage.put(key, Buffer.from('Canonical material version B'), 'text/plain')
  await assert.rejects(homework.submit(student, courseId, task.id, { expectedAnswerRevision: ready.answerRevision, reportId: ready.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'changed-evidence-bytes' }))
  assert.equal((await homework.detail(student, courseId, task.id)).student!.answer.text, 'Keep this independent explanation after evidence changes')
  assert.equal((await homework.submissions(student, courseId, task.id)).items.length, 0)
})

async function assessWithRevocableFile(id: string) {
  const { storage } = await import('../storage.js')
  const key = `attachments/${companyId}/revoked-evidence.txt`
  await storage.put(key, Buffer.from('Two equal triangles form one rectangle.'), 'text/plain')
  const checked = await assess(id, true, student, 'I explained the half-rectangle relationship and independently calculated the new area.', key)
  await pool.query(`INSERT INTO knowledge_sources(id,company_id,project_id,conversation_id,title,kind,status,visibility_scope,
    owner_user_id,created_by_user_id,created_via,origin_client_msg_no,origin_attachment_id)
    VALUES('homework-evidence-source',$1,$2,$3,'Learner evidence','text','ready','PRIVATE',$4,$4,'USER',$5,$6)`,
    [companyId, projectId, checked.thread.channelId, student.userId, checked.messageId, key])
  return checked
}

test('[integration] cached ready assessment cannot bypass revoked access to its committed attachment', async () => {
  const { homework: task } = await published()
  const checked = await assessWithRevocableFile(task.id)
  const cached = await nativeAssessment(task.id, checked.thread, [checked.messageId])
  assert.equal(cached.value.evidenceRevision, checked.state.evidenceRevision)
  assert.equal(cached.value.status, 'READY')
  const before = await assessmentHistory(task.id)
  const calls = Number((await pool.query('SELECT count(*) FROM llm_calls')).rows[0].count)
  await pool.query(`INSERT INTO conversation_source_exclusions(conversation_id,source_id,user_id) VALUES($1,'homework-evidence-source',$2)`,
    [checked.thread.channelId, student.userId])
  await assert.rejects(nativeAssessment(task.id, checked.thread, [checked.messageId]), 'Same message IDs do not preserve a revoked attachment grant')
  assert.deepEqual(await assessmentHistory(task.id), before)
  await runLearningEffects()
  assert.equal(Number((await pool.query('SELECT count(*) FROM llm_calls')).rows[0].count), calls)
  assert.equal(modelReplies.length, 0)
})

test('[integration] revoked access to committed chat evidence blocks an existing report and preserves the private draft', async () => {
  const { homework: task } = await published()
  const checked = await assessWithRevocableFile(task.id)
  const text = 'Keep my private draft when the underlying evidence grant is revoked.'
  await homework.saveAnswer(student, courseId, task.id, { expectedRevision: 0, text, links: [], attachments: [] })
  const ready = await report(task.id, checked.judgment)
  await pool.query(`INSERT INTO conversation_source_exclusions(conversation_id,source_id,user_id) VALUES($1,'homework-evidence-source',$2)`,
    [checked.thread.channelId, student.userId])
  await assert.rejects(homework.submit(student, courseId, task.id,
    { expectedAnswerRevision: ready.answerRevision, reportId: ready.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'revoked-evidence-not-submitted' }))
  const calls = Number((await pool.query('SELECT count(*) FROM llm_calls')).rows[0].count)
  await homework.requestReport(student, courseId, task.id, { expectedAnswerRevision: ready.answerRevision })
  await runLearningEffects()
  const state = (await homework.detail(student, courseId, task.id)).student!
  assert.equal(state.answer.text, text)
  assert.equal(state.reportStatus, 'INVALID')
  assert.ok(state.reportFeedback.length > 0)
  assert.equal(Number((await pool.query('SELECT count(*) FROM llm_calls')).rows[0].count), calls, 'Revoked evidence must fail before another paid judgment')
  assert.equal((await homework.submissions(student, courseId, task.id)).items.length, 0)
})

test('[integration] evidence access revoked during a paid report cannot install a ready report', async () => {
  const [{ claimLearningEffects }, { runHomeworkEffect }] = await Promise.all([
    import('../modules/learning/effects-repository.js'), import('../modules/learning/homework-effects.js'),
  ])
  const { homework: task } = await published()
  const checked = await assessWithRevocableFile(task.id)
  const text = 'My private answer survives revocation while the paid report is in flight.'
  const saved = await homework.saveAnswer(student, courseId, task.id, { expectedRevision: 0, text, links: [], attachments: [] })
  await homework.requestReport(student, courseId, task.id, { expectedAnswerRevision: saved!.answerRevision })
  const [effect] = await claimLearningEffects(pool, 1)
  assert.equal(effect.kind, 'homework.report')
  let entered!: () => void, release!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  const held = new Promise<void>(resolve => { release = resolve })
  modelReplies.push(async () => { entered(); await held; return checked.judgment })
  const completed = runHomeworkEffect(effect).then(() => null, error => error as Error)
  try {
    await Promise.race([started, delay(10_000).then(() => assert.fail('Report model did not start'))])
    await pool.query(`INSERT INTO conversation_source_exclusions(conversation_id,source_id,user_id) VALUES($1,'homework-evidence-source',$2)`,
      [checked.thread.channelId, student.userId])
    release()
    assert.equal(await completed, null)
    const state = (await homework.detail(student, courseId, task.id)).student!
    assert.equal(state.reportStatus, 'INVALID')
    assert.equal(state.report, null)
    assert.ok(state.reportFeedback.length > 0)
    assert.equal(state.answer.text, text)
  } finally { release(); await completed }
})

test('[integration] evidence access revoked after material reading but before the submission transaction rejects atomically', async () => {
  const { homework: task } = await published()
  const checked = await assessWithRevocableFile(task.id)
  const text = 'My private answer survives the final authorization race.'
  await homework.saveAnswer(student, courseId, task.id, { expectedRevision: 0, text, links: [], attachments: [] })
  const ready = await report(task.id, checked.judgment)
  let entered!: () => void, release!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  const held = new Promise<void>(resolve => { release = resolve })
  const delayed = new HomeworkApplication(pool, work => withTransaction(pool, async db => { entered(); await held; return work(db) }))
  const completed = delayed.submit(student, courseId, task.id,
    { expectedAnswerRevision: ready.answerRevision, reportId: ready.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'evidence-grant-race' })
    .then(value => ({ value }), error => ({ error }))
  try {
    await Promise.race([started, delay(10_000).then(() => assert.fail('Submission did not reach its final transaction'))])
    await pool.query(`INSERT INTO conversation_source_exclusions(conversation_id,source_id,user_id) VALUES($1,'homework-evidence-source',$2)`,
      [checked.thread.channelId, student.userId])
    release()
    assert.ok('error' in await completed, 'A report checked before evidence revocation cannot be submitted afterward')
    assert.equal((await homework.detail(student, courseId, task.id)).student!.answer.text, text)
    assert.equal((await homework.submissions(student, courseId, task.id)).items.length, 0)
  } finally { release(); await completed }
})

test('[integration] worker results cannot install over newer answers or expired queue ownership', async () => {
  const [{ claimLearningEffects, completeLearningEffect }, { runHomeworkEffect }] = await Promise.all([
    import('../modules/learning/effects-repository.js'), import('../modules/learning/homework-effects.js'),
  ])
  const { homework: task } = await published()
  const checked = await assess(task.id, true)
  await homework.saveAnswer(student, courseId, task.id, { expectedRevision: 0, text: 'Version one', links: [], attachments: [] })
  await homework.requestReport(student, courseId, task.id, { expectedAnswerRevision: 1 })
  const [effect] = await claimLearningEffects(pool, 1)
  assert.ok(effect && effect.kind === 'homework.report')
  let release!: () => void, entered!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  const held = new Promise<void>(resolve => { release = resolve })
  modelReplies.push(async () => { entered(); await held; return checked.judgment })
  const running = runHomeworkEffect(effect)
  await started
  await homework.saveAnswer(student, courseId, task.id, { expectedRevision: 1, text: 'Version two survives stale result', links: [], attachments: [] })
  release(); await running; await completeLearningEffect(pool, effect)
  let state = (await homework.detail(student, courseId, task.id)).student!
  assert.equal(state.answer.text, 'Version two survives stale result')
  assert.equal(state.report, null)
  await homework.requestReport(student, courseId, task.id, { expectedAnswerRevision: 2 })
  const [oldOwner] = await claimLearningEffects(pool, 1)
  assert.ok(oldOwner)
  await pool.query(`UPDATE learning_effects SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1`, [oldOwner.id])
  const [newOwner] = await claimLearningEffects(pool, 1)
  assert.ok(newOwner && newOwner.leaseToken !== oldOwner.leaseToken)
  modelReplies.push(checked.judgment)
  await assert.rejects(runHomeworkEffect(oldOwner), /lease/i)
  state = (await homework.detail(student, courseId, task.id)).student!
  assert.equal(state.report, null)
  modelReplies.push(checked.judgment)
  await runHomeworkEffect(newOwner); await completeLearningEffect(pool, newOwner)
  state = (await homework.detail(student, courseId, task.id)).student!
  assert.equal(state.reportStatus, 'READY')
  assert.equal(state.report!.answerRevision, 2)
})

// #424 failure inventory: a readable presentation is rejected before the model;
// material/provider/invalid-input failures are conflated; retry loses attachments
// or increments the visible draft; an old validation permits a newer publication.
test('[integration] 424 material and service failures remain distinct and same-revision retry retains the draft', async () => {
  const { storage } = await import('../storage.js')
  const key = `attachments/${companyId}/scan-only.pdf`
  await pool.query(`INSERT INTO uploaded_files(storage_key,company_id,owner_user_id,company_period_id)
    SELECT $1,$2,$3,period_id FROM company_memberships WHERE company_id=$2 AND user_id=$3 AND ended_at IS NULL`, [key, companyId, teacher.userId])
  await storage.put(key, Buffer.from('%PDF-1.4 unreadable scan fixture'), 'application/pdf')
  const unreadable = await homework.draft(teacher, courseId, { ...visible, attachments: [{ key, name: 'scan-only.pdf' }] })
  await runLearningEffects()
  let detail = await homework.detail(teacher, courseId, unreadable.homework.id)
  assert.equal(detail.homework.validation.status, 'MATERIAL_ERROR')
  assert.equal(detail.homework.canPublish, false)
  assert.match(detail.homework.validation.feedback, /scan-only\.pdf/)
  assert.match(detail.homework.validation.feedback, /重新|转换|导出/)
  assert.deepEqual(detail.homework.attachments, unreadable.homework.attachments)
  await storage.put(key, Buffer.from('Two equal triangles form one rectangle.'), 'text/plain')
  detail = await homework.updateDraft(teacher, courseId, unreadable.homework.id, { ...visible,
    attachments: unreadable.homework.attachments, expectedRevision: detail.homework.revision })
  modelReplies.push(() => { throw new Error('Fixture provider unavailable') })
  await runLearningEffects()
  detail = await homework.detail(teacher, courseId, unreadable.homework.id)
  assert.equal(detail.homework.validation.status, 'ERROR')
  assert.equal(detail.homework.canPublish, false)
  const failed = detail.homework
  assert.match(failed.validation.feedback, /重试/)
  assert.doesNotMatch(failed.validation.feedback, /Fixture provider unavailable|请检查内容/)
  const retry = { expectedRevision: failed.revision }
  for (const other of [colleague, student]) assert.equal((await call(other, path(failed.id, '/validate'), 'POST', retry)).status, 403)
  assert.equal((await call(teacher, `/courses/homework-other-course/homeworks/${failed.id}/validate`, 'POST', retry)).status, 404)
  assert.equal((await call(teacher, path(failed.id, '/validate'), 'POST', { expectedRevision: failed.revision - 1 })).status, 409)
  assert.equal((await call(teacher, path(failed.id, '/publish'), 'POST', {
    expectedRevision: failed.revision, visibleHash: failed.visibleHash, idempotencyKey: '424-unchecked-draft',
  })).status, 409)
  const retried = await call(teacher, path(failed.id, '/validate'), 'POST', retry)
  assert.equal(retried.status, 200)
  detail = await retried.json() as Awaited<ReturnType<HomeworkApplication['detail']>>
  assert.equal(detail.homework.validation.status, 'PENDING')
  assert.equal(detail.homework.validation.feedback, '')
  assert.equal(detail.homework.validation.revision, null)
  for (const field of ['title', 'instructions', 'criteria', 'attachments', 'links', 'revision', 'visibleHash'] as const) {
    assert.deepEqual(detail.homework[field], failed[field], `retry retains ${field}`)
  }
  assert.equal((await call(teacher, path(failed.id, '/validate'), 'POST', retry)).status, 200)
  modelReplies.push({ valid: true, feedback: 'Readable requirements verified.' })
  await runLearningEffects()
  detail = await homework.detail(teacher, courseId, unreadable.homework.id)
  assert.equal(detail.homework.validation.status, 'READY')
  assert.equal(detail.homework.canPublish, true)
  assert.equal(detail.homework.validation.revision, failed.revision)
  assert.equal((await homework.publish(teacher, courseId, failed.id, {
    expectedRevision: failed.revision, visibleHash: failed.visibleHash, idempotencyKey: '424-recovered-draft',
  })).homework.status, 'PUBLISHED')
})

test('[integration] 424 input rejection and malformed model responses do not validate a newer draft', async () => {
  const draft = await homework.draft(teacher, courseId, { ...visible, criteria: ['Complete 10 conversation turns.'] })
  modelReplies.push({ valid: false, issues: [{ field: 'criteria', excerpt: 'Complete 10 conversation turns.',
    reason: '对话次数不能说明学生独立掌握了知识。', suggestion: '改为独立解释三角形与矩形的面积关系，并应用到一个新例子。' }] })
  await runLearningEffects()
  let detail = await homework.detail(teacher, courseId, draft.homework.id)
  assert.equal(detail.homework.validation.status, 'INVALID')
  assert.match(detail.homework.validation.feedback, /验收标准/)
  assert.equal(detail.homework.canPublish, false)
  detail = await homework.updateDraft(teacher, courseId, draft.homework.id, { ...visible, title: 'Corrected triangle task', expectedRevision: 1 })
  assert.equal(detail.homework.validation.feedback, '')
  modelReplies.push({ valid: 'yes', feedback: 'Malformed response' })
  await runLearningEffects()
  detail = await homework.detail(teacher, courseId, draft.homework.id)
  assert.equal(detail.homework.validation.status, 'ERROR')
  assert.equal((await call(teacher, path(draft.homework.id, '/validate'), 'POST', { expectedRevision: 2 })).status, 200)
  modelReplies.push({ valid: true, feedback: '可以确认发布。' })
  await runLearningEffects()
  const ready = (await homework.detail(teacher, courseId, draft.homework.id)).homework
  assert.equal(ready.validation.revision, 2)
  assert.equal(ready.canPublish, true)
  detail = await homework.updateDraft(teacher, courseId, ready.id, { ...visible, instructions: 'A changed task needs its own validation.', expectedRevision: 2 })
  assert.equal(detail.homework.canPublish, false)
  assert.equal((await call(teacher, path(ready.id, '/publish'), 'POST', {
    expectedRevision: detail.homework.revision, visibleHash: detail.homework.visibleHash, idempotencyKey: '424-stale-validation',
  })).status, 409)
})

// #453: historical ambiguous INVALID must recover without rewriting or replacing
// readable attachments; a fresh ungrounded denial must not blame teacher content.
test('[integration] 453 a vague model rejection remains retryable instead of becoming an input error', async () => {
  const draft = await homework.draft(teacher, courseId, visible)
  modelReplies.push({ valid: false, feedback: '无法验证作业要求或完整读取材料，请检查内容、提供可读取的文字材料后重试。' })
  await runLearningEffects()
  const failed = (await homework.detail(teacher, courseId, draft.homework.id)).homework
  assert.equal(failed.validation.status, 'ERROR')
  assert.equal(failed.canPublish, false)
  assert.match(failed.validation.feedback, /重试|重新检查/)
  assert.doesNotMatch(failed.validation.feedback, /请检查内容|作业要求需要修改/)
})

test('[integration] 453 historical INVALID rechecks the unchanged PPTX and publishes only the current READY revision', async () => {
  const { storage } = await import('../storage.js')
  const key = `attachments/${companyId}/historical-chapter.pptx`
  const bytes = await readFile(new URL('../__tests__/fixtures/homework-presentations/material.pptx', import.meta.url))
  await storage.put(key, bytes, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
  await pool.query(`INSERT INTO uploaded_files(storage_key,company_id,owner_user_id,company_period_id)
    SELECT $1,$2,$3,period_id FROM company_memberships WHERE company_id=$2 AND user_id=$3 AND ended_at IS NULL`, [key, companyId, teacher.userId])
  const draft = await homework.draft(teacher, courseId, { ...visible, title: '合成章节练习',
    instructions: '独立说明加法，并说明输入和输出的关系。', criteria: ['独立说明加法。', '解释输入输出关系。'], attachments: [{ key, name: 'historical-chapter.pptx' }] })
  await pool.query(`UPDATE homeworks SET validation_status='INVALID',validated_revision=revision,validation_feedback=$2 WHERE id=$1`,
    [draft.homework.id, '无法验证作业要求或完整读取材料，请检查内容、提供可读取的文字材料后重试。'])
  await pool.query("UPDATE learning_effects SET status='completed' WHERE effect_key=$1 AND kind='homework.validate'", [draft.homework.id])
  const original = (await homework.detail(teacher, courseId, draft.homework.id)).homework
  const publish = { expectedRevision: original.revision, visibleHash: original.visibleHash, idempotencyKey: '453-historical-pptx' }
  assert.equal((await call(teacher, path(original.id, '/publish'), 'POST', publish)).status, 409)
  const retried = await call(teacher, path(original.id, '/validate'), 'POST', { expectedRevision: original.revision })
  assert.equal(retried.status, 200)
  const pending = (await retried.json() as Awaited<ReturnType<HomeworkApplication['detail']>>).homework
  assert.equal(pending.validation.status, 'PENDING')
  assert.equal(pending.validation.feedback, '')
  assert.equal(pending.validation.revision, null)
  for (const field of ['title', 'instructions', 'criteria', 'attachments', 'links', 'dueAt', 'revision', 'visibleHash'] as const) {
    assert.deepEqual(pending[field], original[field], `historical retry retains ${field}`)
  }
  assert.equal((await call(teacher, path(original.id, '/validate'), 'POST', { expectedRevision: original.revision })).status, 200)
  assert.equal((await call(teacher, path(original.id, '/publish'), 'POST', publish)).status, 409)
  modelReplies.push({ valid: true, feedback: '章节文字已读取，可以确认发布。' })
  await runLearningEffects()
  const checked = (await homework.detail(teacher, courseId, original.id)).homework
  assert.equal(checked.validation.status, 'READY')
  assert.equal(checked.validation.revision, original.revision)
  assert.equal(checked.validation.feedback, '章节文字已读取，可以确认发布。')
  const request = lastModelRequest as { messages: Array<{ role: string; content: string }> }
  const input = JSON.parse(request.messages.find(message => message.role === 'user')!.content) as { materials: Array<{ source: string; text: string; hash: string }> }
  assert.equal(input.materials[0].source, key)
  assert.match(input.materials[0].text, /独立说明加法/)
  assert.match(input.materials[0].text, /Input 输入/)
  const calls = await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM llm_calls WHERE company_id=$1 AND purpose='homework.validate'", [companyId])
  assert.equal(calls.rows[0].count, 1, 'Repeated retry queues one fresh validation')
  assert.equal((await homework.publish(teacher, courseId, original.id, publish)).homework.status, 'PUBLISHED')
})

test('[integration] 424 uploaded PPTX text reaches validation and the current draft can be published', async () => {
  const { storage } = await import('../storage.js')
  const key = `attachments/${companyId}/chapter.pptx`
  const bytes = await readFile(new URL('../__tests__/fixtures/homework-presentations/material.pptx', import.meta.url))
  await storage.put(key, bytes, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
  await pool.query(`INSERT INTO uploaded_files(storage_key,company_id,owner_user_id,company_period_id)
    SELECT $1,$2,$3,period_id FROM company_memberships WHERE company_id=$2 AND user_id=$3 AND ended_at IS NULL`, [key, companyId, teacher.userId])
  const draft = await homework.draft(teacher, courseId, { ...visible, title: '合成章节练习',
    instructions: '独立说明加法，并说明输入和输出的关系。', criteria: ['独立说明加法。', '解释输入输出关系。'], attachments: [{ key, name: 'chapter.pptx' }] })
  modelReplies.push({ valid: true, feedback: '章节文字已读取，可以确认发布。' })
  await runLearningEffects()
  const checked = (await homework.detail(teacher, courseId, draft.homework.id)).homework
  assert.equal(checked.validation.status, 'READY')
  assert.equal(checked.validation.revision, checked.revision)
  const request = lastModelRequest as { messages: Array<{ role: string; content: string }> }
  const input = JSON.parse(request.messages.find(message => message.role === 'user')!.content) as { materials: Array<{ source: string; text: string; hash: string; contentStatus?: string }> }
  assert.equal(input.materials[0].source, key)
  assert.match(input.materials[0].text, /独立说明加法/)
  assert.match(input.materials[0].text, /Input 输入/)
  assert.equal(input.materials[0].contentStatus, undefined)
  assert.equal(input.materials[0].hash.length, 64)
  const published = await homework.publish(teacher, courseId, checked.id, {
    expectedRevision: checked.revision, visibleHash: checked.visibleHash, idempotencyKey: '424-pptx-publication',
  })
  assert.equal(published.homework.status, 'PUBLISHED')
  assert.deepEqual(published.homework.attachments, draft.homework.attachments)
})

test('[integration] 424 unreadable attachments name the file and recovery without calling the validator', async () => {
  const { storage } = await import('../storage.js')
  const cases = [
    { name: 'unsupported.png', mime: 'image/png', bytes: Buffer.from('image fixture'), reason: /格式|暂不支持/ },
    { name: 'image-only.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      bytes: await readFile(new URL('../__tests__/fixtures/homework-presentations/image-only.pptx', import.meta.url)), reason: /没有|未提取|无法提取/ },
    { name: 'legacy.ppt', mime: 'application/vnd.ms-powerpoint',
      bytes: await readFile(new URL('../__tests__/fixtures/homework-presentations/material.ppt', import.meta.url)), reason: /旧版 PPT.*另存为 PPTX/ },
    { name: 'corrupt.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', bytes: Buffer.from('not a presentation'), reason: /损坏|格式|无法提取/ },
    { name: 'long.txt', mime: 'text/plain', bytes: Buffer.from('a'.repeat(60001)), reason: /过大|超出|超过/ },
    { name: 'large.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', bytes: Buffer.alloc(16 * 1024 * 1024 + 1), reason: /16|过大|超出|超过/ },
  ]
  for (const item of cases) {
    const key = `attachments/${companyId}/${item.name}`
    await storage.put(key, item.bytes, item.mime)
    await pool.query(`INSERT INTO uploaded_files(storage_key,company_id,owner_user_id,company_period_id)
      SELECT $1,$2,$3,period_id FROM company_memberships WHERE company_id=$2 AND user_id=$3 AND ended_at IS NULL`, [key, companyId, teacher.userId])
    const draft = await homework.draft(teacher, courseId, { ...visible, attachments: [{ key, name: item.name }] })
    await runLearningEffects()
    const detail = await homework.detail(teacher, courseId, draft.homework.id)
    assert.equal(detail.homework.validation.status, 'MATERIAL_ERROR', item.name)
    assert.ok(detail.homework.validation.feedback.includes(item.name))
    assert.match(detail.homework.validation.feedback, item.reason)
    assert.match(detail.homework.validation.feedback, /请/)
    assert.equal(detail.homework.canPublish, false)
    assert.deepEqual(detail.homework.attachments, draft.homework.attachments)
  }
  assert.equal(lastModelRequest, undefined, 'unreadable materials never reach the model')
})

test('[integration] homework draft is teacher-owned and absent from learner feeds until explicit validated confirmation', async () => {
  await assert.rejects(homework.draft(student, courseId, visible))
  const draft = await homework.draft(teacher, courseId, visible)
  const id = draft.homework.id
  assert.equal(draft.homework.status, 'DRAFT')
  assert.equal(draft.homework.canPublish, false)
  for (const scope of [student, peer, outsider]) assert.equal((await call(scope, path(id))).status, 404)
  assert.equal((await call(colleague, path(id, '/publish'), 'POST', {
    expectedRevision: draft.homework.revision, visibleHash: draft.homework.visibleHash, idempotencyKey: 'other-teacher-publish',
  })).status, 403)
  assert.equal((await call(teacher, path(id, '/publish'), 'POST', {
    expectedRevision: draft.homework.revision, visibleHash: draft.homework.visibleHash, idempotencyKey: 'unvalidated-publish',
  })).status, 409)
  const feed = await (await call(student, `/courses/${courseId}/forum`)).json() as { items: { id: string }[] }
  assert.ok(!feed.items.some(item => item.id === id))
  const counts = await pool.query(`SELECT to_regclass('learning_activities') activities,to_regclass('learning_missions') missions`)
  assert.deepEqual(counts.rows, [{ activities: null, missions: null }])
})

test('[integration] card edits reject stale revisions, foreign course scope and forbidden client authority fields', async () => {
  const draft = await homework.draft(teacher, courseId, visible)
  const id = draft.homework.id
  const update = { ...visible, expectedRevision: draft.homework.revision, title: 'Revised triangle task' }
  assert.equal((await call(teacher, path(id, '/draft'), 'PATCH', update)).status, 200)
  assert.equal((await call(teacher, path(id, '/draft'), 'PATCH', update)).status, 409)
  assert.equal((await call(colleague, path(id, '/draft'), 'PATCH', update)).status, 403)
  assert.equal((await call(student, path(id, '/draft'), 'PATCH', update)).status, 403)
  assert.equal((await call(teacher, `/courses/homework-other-course/homeworks/${id}`)).status, 404)
  assert.equal((await call(teacher, path(id, '/draft'), 'PATCH', { ...update, unlocked: true, validatedRevision: 99, status: 'PUBLISHED' })).status, 400)
  assert.equal((await call(teacher, path(id, '/publish'), 'POST', {
    expectedRevision: draft.homework.revision, visibleHash: draft.homework.visibleHash, idempotencyKey: 'stale-card-publish',
  })).status, 409)
})

test('[integration] existing managed teacher bindings refresh their persona while ordinary custom agents retain theirs', async () => {
  const [{ ensureTeacherAgentForCourse }, { TEACHER_PROMPT }, { loadRuntimeBinding }] = await Promise.all([
    import('../modules/learning/teacher-agent-application.js'), import('../modules/learning/teacher-preset.js'),
    import('../agent-runtime/context.js'),
  ])
  const managed = await ensureTeacherAgentForCourse(companyId, courseId, pool, transaction)
  await pool.query(`UPDATE participants SET system_prompt='Legacy v3: prepare objectives and publish activities.' WHERE company_id=$1 AND id=$2`, [companyId, managed.agentId])
  await pool.query('UPDATE learning_project_teacher_agents SET preset_version=3 WHERE company_id=$1 AND agent_id=$2', [companyId, managed.agentId])
  const teacherBinding = await loadRuntimeBinding({ tenantId: companyId, agentId: managed.agentId, principalId: teacher.userId, conversationId: managed.roomId })
  assert.equal(teacherBinding.teacher_managed, true)
  assert.equal(teacherBinding.system_prompt === TEACHER_PROMPT, true, 'The next teacher turn must use the current managed persona')
  const customPrompt = 'My custom tutor style: ask one concise question at a time.'
  await pool.query('UPDATE participants SET system_prompt=$1 WHERE company_id=$2 AND id=$3', [customPrompt, companyId, 'homework-nova'])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES('homework-study-room',$1,$2::jsonb)`,
    [companyId, JSON.stringify({ channelType: 2, members: [student.userId, 'homework-nova'] })])
  const ordinary = await loadRuntimeBinding({ tenantId: companyId, agentId: 'homework-nova', principalId: student.userId, conversationId: 'homework-study-room' })
  assert.equal(ordinary.teacher_managed, false)
  assert.equal(ordinary.system_prompt === customPrompt, true, 'An unmanaged custom persona must remain intact')
})

test('[integration] native teacher revisions update the same draft and require fresh human confirmation; no model publication/review tool exists', async () => {
  const [{ teacherTools }, { ensureTeacherAgentForCourse }] = await Promise.all([
    import('../modules/learning/public.js'), import('../modules/learning/teacher-agent-application.js'),
  ])
  const tool = teacherTools.find(item => item.action === 'teacher.draft_homework')!
  assert.ok(tool)
  assert.ok(!teacherTools.some(item => /(?:publish_homework|review_homework|manual_unlock|draft_activity|publish_activity)$/.test(item.action)))
  assert.throws(() => tool.parse({ ...visible, homeworkId: 'partial-draft' }))
  assert.throws(() => tool.parse({ ...visible, expectedRevision: 1 }))
  const draft = await homework.draft(teacher, courseId, visible)
  const binding = await ensureTeacherAgentForCourse(companyId, courseId, pool, transaction)
  const invoke = async (selectedTool: typeof tool, scope: typeof teacher, input: object) => {
    const data = selectedTool.parse(input)
    const context = { database: pool, signal: AbortSignal.timeout(15000), requestVersion: 1,
      work: { id: 'homework-teacher-tool', tenantId: companyId, agentId: binding.agentId, principalId: scope.userId,
        sessionId: 'homework-teacher-session', kind: 'turn', lane: 'interactive', triggerRef: 'homework-teacher-message', fence: 1, homeEpoch: 1, createdAt: new Date().toISOString(),
        conversation: { conversationId: binding.roomId, policyVersion: 1, source: { messageId: 'homework-teacher-message', version: 1 }, internal: false,
          audience: { visibility: 'conversation', participantIds: [teacher.userId, colleague.userId, binding.agentId] } } },
      action: { runId: 'homework-teacher-tool', cellId: 'draft', callIndex: 0, action: selectedTool.action, args: data, idempotencyKey: 'native-draft-edit' },
    } as unknown as import('@lyyzka/lingxios').ActionContext
    return transaction(async db => {
      const action = { ...context, database: db }; await selectedTool.authorize(action, data)
      const result = await selectedTool.execute(action, data)
      if (result.ok && selectedTool.verify) assert.equal((await selectedTool.verify(action, data, result.value)).status, 'passed')
      return result
    })
  }
  const edit = { ...visible, title: 'Agent-revised exact title', homeworkId: draft.homework.id, expectedRevision: draft.homework.revision }
  await assert.rejects(invoke(tool, colleague, edit))
  const receipt = await invoke(tool, teacher, edit)
  assert.ok(receipt.ok)
  assert.equal((receipt.value as { state: { title: string } }).state.title, edit.title)
  assert.deepEqual(JSON.parse((receipt.value as { text: string }).text), { ...visible, title: edit.title })
  assert.equal((receipt.value as { nextOffset: null }).nextOffset, null)
  const updated = await homework.detail(teacher, courseId, draft.homework.id)
  assert.deepEqual({ id: updated.homework.id, title: updated.homework.title, revision: updated.homework.revision, validation: updated.homework.validation.status },
    { id: draft.homework.id, title: edit.title, revision: draft.homework.revision + 1, validation: 'PENDING' })
  await assert.rejects(homework.publish(teacher, courseId, draft.homework.id, {
    expectedRevision: draft.homework.revision, visibleHash: draft.homework.visibleHash, idempotencyKey: 'pre-agent-edit-card',
  }))
  const readTool = teacherTools.find(item => item.action === 'teacher.homework_overview')!
  assert.throws(() => readTool.parse({ section: 'requirements' }))
  assert.throws(() => readTool.parse({ homeworkId: draft.homework.id, learnerId: student.userId, section: 'requirements' }))
  const content = { ...visible, instructions: 'Explain each step. '.repeat(900).trim(),
    criteria: Array.from({ length: 20 }, (_, i) => `${i}: ${'Use independent reasoning. '.repeat(50)}`.trim()) }
  const longReceipt = await invoke(tool, teacher, content)
  assert.ok(longReceipt.ok)
  assert.ok(JSON.stringify(longReceipt.value).length < 8000)
  const longValue = longReceipt.value as { result: { homeworkId: string }; nextOffset: number | null }
  assert.ok(longValue.nextOffset !== null)
  const longDraft = await homework.detail(teacher, courseId, longValue.result.homeworkId)
  const pages: string[] = []
  let offset: number | null = 0
  while (offset !== null) {
    assert.ok(pages.length < 30)
    const result = await invoke(readTool, teacher, { homeworkId: longDraft.homework.id, section: 'requirements', offset })
    assert.ok(result.ok)
    const page = result.value as { text: string; nextOffset: number | null; sourceVersion: string; revision: number }
    assert.ok(JSON.stringify(result.value).length < 8000)
    assert.equal(page.sourceVersion, longDraft.homework.visibleHash)
    assert.equal(page.revision, longDraft.homework.revision)
    assert.ok(page.nextOffset === null || page.nextOffset > offset)
    pages.push(page.text); offset = page.nextOffset
  }
  assert.ok(pages.length > 1)
  assert.deepEqual(JSON.parse(pages.join('')), content)
  assert.equal((await homework.detail(teacher, courseId, longDraft.homework.id)).homework.status, 'DRAFT')
  await assert.rejects(invoke(readTool, student, { homeworkId: longDraft.homework.id, section: 'requirements' }))
})

test('[integration] native homework overview bounds long reports, aggregates the whole class and pages submitted sections without private drafts', async () => {
  const [{ teacherTools }, { ensureTeacherAgentForCourse }] = await Promise.all([
    import('../modules/learning/public.js'), import('../modules/learning/teacher-agent-application.js'),
  ])
  const criteria = Array.from({ length: 20 }, (_, index) => `Explain independently ${index}: ${'Use the half-rectangle relationship. '.repeat(20)}`)
  const { homework: task } = await published({ criteria })
  const checked = await assess(task.id, true)
  const longAnswer = 'Long formal answer with independent reasoning. '.repeat(250)
  await homework.saveAnswer(student, courseId, task.id, { expectedRevision: 0, text: longAnswer, links: [], attachments: [] })
  const ready = await report(task.id, checked.judgment)
  const submitted = await homework.submit(student, courseId, task.id,
    { expectedAnswerRevision: ready.answerRevision, reportId: ready.report!.id, conversationReferences:currentReferences(), idempotencyKey: 'long-overview-submission' })
  await homework.saveAnswer(peer, courseId, task.id, { expectedRevision: 0, text: 'peer-private-unsubmitted-sentinel', links: [], attachments: [] })
  for (let index = 0; index < 10; index++) {
    const learnerId = `homework-page-${String(index).padStart(2, '0')}`
    await seedUserMembership(learnerId, companyId, { role: 'STUDENT' })
    await pool.query(`INSERT INTO project_memberships(company_id,project_id,user_id,role,status) VALUES($1,$2,$3,'STUDENT','ACTIVE')`, [companyId, projectId, learnerId])
  }
  const binding = await ensureTeacherAgentForCourse(companyId, courseId, pool, transaction)
  const tool = teacherTools.find(item => item.action === 'teacher.homework_overview')!
  assert.ok(tool)
  type ToolValue = { counts: Record<string, number>; missingCriteria: { index: number; criterion: string; count: number }[];
    items: { learnerId: string; status: string; submissionId: string | null; submissionVersion: number | null }[];
    submission: { id: string; version: number } | null; text: string; totalChars: number; nextOffset: number | null }
  const invoke = async (input: object, scope = teacher) => {
    const data = tool.parse(input)
    const context = { database: pool, signal: AbortSignal.timeout(15000), requestVersion: 1,
      work: { id: 'homework-overview-tool', tenantId: companyId, agentId: binding.agentId, principalId: scope.userId,
        sessionId: 'homework-overview-session', kind: 'turn', lane: 'interactive', triggerRef: 'homework-overview-message', fence: 1, homeEpoch: 1, createdAt: new Date().toISOString(),
        conversation: { conversationId: binding.roomId, policyVersion: 1, source: { messageId: 'homework-overview-message', version: 1 }, internal: false,
          audience: { visibility: 'conversation', participantIds: [teacher.userId, binding.agentId] } } },
      action: { runId: 'homework-overview-tool', cellId: 'overview', callIndex: 0, action: tool.action, args: data, idempotencyKey: 'native-overview' },
    } as unknown as import('@lyyzka/lingxios').ActionContext
    const result = await transaction(async db => { const action = { ...context, database: db }; await tool.authorize(action, data); return tool.execute(action, data) })
    assert.ok(JSON.stringify(result).length < 8000, 'The entire native result must fit its actual runtime output budget')
    assert.doesNotMatch(JSON.stringify(result), /peer-private-unsubmitted-sentinel|answerHash|materialHashes|evidenceRevision/)
    return (result as { value: ToolValue }).value
  }
  const learners: ToolValue['items'] = []
  let offset: number | null = 0
  do {
    const page = await invoke({ homeworkId: task.id, offset })
    assert.deepEqual(page.counts, { NOT_STARTED: 11, LEARNING: 0, MASTERED: 0, PENDING: 1, PASSED: 0, RETURNED: 0 })
    assert.deepEqual(page.missingCriteria.map(item => ({ index: item.index, count: item.count })), criteria.map((_, index) => ({ index, count: 11 })))
    assert.ok(page.items.length > 0 && page.items.length <= 10)
    learners.push(...page.items)
    assert.ok(page.nextOffset === null || page.nextOffset > offset)
    offset = page.nextOffset
  } while (offset !== null)
  assert.equal(new Set(learners.map(item => item.learnerId)).size, 12)
  assert.deepEqual(learners.find(item => item.learnerId === student.userId),
    { ...learners.find(item => item.learnerId === student.userId), status: 'PENDING', submissionId: submitted.id, submissionVersion: 1 })
  for (const section of ['report', 'answer']) {
    let text = '', next: number | null = 0
    do {
      const page = await invoke({ homeworkId: task.id, learnerId: student.userId, section, offset: next })
      assert.equal(page.submission?.id, submitted.id)
      assert.equal(page.submission?.version, 1)
      assert.ok(page.text.length > 0 && page.text.length <= 4000)
      text += page.text
      assert.ok(page.nextOffset === null || page.nextOffset > next)
      next = page.nextOffset
      if (next === null) assert.equal(text.length, page.totalChars)
    } while (next !== null)
    if (section === 'answer') assert.ok(text.includes(longAnswer))
    else { assert.match(text, /Explain independently 19/); assert.match(text, /Explained and transferred independently/); assert.doesNotMatch(text, /Long formal answer/) }
  }
  const privateLearner = await invoke({ homeworkId: task.id, learnerId: peer.userId, section: 'answer' })
  assert.equal(privateLearner.submission, null)
  await assert.rejects(invoke({ homeworkId: task.id }, student))
  await assert.rejects(invoke({ homeworkId: 'foreign-course-homework' }))
})

test('[integration] learner native reads page full requirements and real materials while retaining private scope and output bounds', async () => {
  const [{ homeworkLearnerTools }, { storage }] = await Promise.all([
    import('../modules/learning/homework-tools.js'), import('../storage.js'),
  ])
  const fixtures = [
    ['triangle-reference.pdf', 'application/pdf'],
    ['triangle-answer.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['triangle-notes.txt', 'text/plain'],
  ] as const
  const attachments = []
  for (const [name, contentType] of fixtures) {
    const key = `attachments/${companyId}/${name}`
    await storage.put(key, await readFile(`e2e/homework/${name}`), contentType)
    await pool.query(`INSERT INTO uploaded_files(storage_key,company_id,owner_user_id,company_period_id)
      SELECT $1,$2,$3,period_id FROM company_memberships WHERE company_id=$2 AND user_id=$3 AND ended_at IS NULL`, [key, companyId, teacher.userId])
    attachments.push({ key, name })
  }
  const criteria = Array.from({ length: 20 }, (_, index) => `Independent criterion ${index}: ${'Explain and transfer the area relationship. '.repeat(20)}`)
  const { homework: task } = await published({ criteria, attachments })
  const thread = await homework.start(student, courseId, task.id)
  const longAnswer = 'Private independent answer. '.repeat(700)
  await homework.saveAnswer(student, courseId, task.id, { expectedRevision: 0, text: longAnswer, links: [], attachments: [] })
  const otherTask = await published({ title: 'A different private homework scope' })
  const tool = homeworkLearnerTools.find(item => item.action === 'learning.get_homework')!
  type Page = { text: string; totalChars: number; nextOffset: number | null; sourceVersion: string }
  const invoke = async (input: object, principalId = student.userId, channelId = thread.channelId) => {
    const data = tool.parse(input)
    const context = { database: pool, signal: AbortSignal.timeout(30000), requestVersion: 1,
      work: { id: 'homework-learner-read', tenantId: companyId, agentId: thread.agentId, principalId,
        sessionId: 'homework-learner-session', kind: 'turn', lane: 'interactive', triggerRef: 'homework-learner-message', fence: 1, homeEpoch: 1, createdAt: new Date().toISOString(),
        conversation: { conversationId: channelId, policyVersion: 1, source: { messageId: 'homework-learner-message', version: 1 }, internal: false,
          audience: { visibility: 'conversation', participantIds: [student.userId, thread.agentId] } } },
      action: { runId: 'homework-learner-read', cellId: 'read', callIndex: 0, action: tool.action, args: data, idempotencyKey: 'native-learner-read' },
    } as unknown as import('@lyyzka/lingxios').ActionContext
    const result = await transaction(async db => { const action = { ...context, database: db }; await tool.authorize(action, data); return tool.execute(action, data) })
    assert.ok(JSON.stringify(result).length < 8000, 'Full native result must fit the runtime output budget')
    return (result as { value: Page }).value
  }
  const summary = await invoke({ homeworkId: task.id })
  assert.ok(!JSON.stringify(summary).includes(longAnswer), 'Default summary must not embed the complete private answer')
  for (const section of ['requirements', 'materials', 'answer']) {
    let offset: number | null = 0, text = '', version: string | undefined
    do {
      const page = await invoke({ homeworkId: task.id, section, offset })
      assert.match(page.sourceVersion, /^[a-f0-9]{64}$/)
      version ??= page.sourceVersion
      assert.equal(page.sourceVersion, version)
      assert.ok(page.text.length > 0 && page.text.length <= 4000)
      text += page.text
      assert.ok(page.nextOffset === null || page.nextOffset > offset)
      offset = page.nextOffset
      if (offset === null) assert.equal(text.length, page.totalChars)
    } while (offset !== null)
    const value = JSON.parse(text)
    if (section === 'requirements') assert.deepEqual(value.criteria, task.criteria)
    else if (section === 'answer') assert.equal(value.text, longAnswer)
    else {
      assert.equal(value.length, 3)
      for (const material of value as { source: string; hash: string; text: string }[]) {
        assert.ok(attachments.some(file => file.key === material.source))
        assert.match(material.hash, /^[a-f0-9]{64}$/)
        assert.ok(material.text.length > 20)
      }
    }
  }
  await assert.rejects(invoke({ homeworkId: task.id, section: 'answer' }, peer.userId))
  await assert.rejects(invoke({ homeworkId: otherTask.homework.id }))
  await assert.rejects(invoke({ homeworkId: task.id }, student.userId, 'homework-study-room'))
  await storage.put(attachments[0].key, Buffer.from('Unsupported material bytes'), 'image/png')
  await assert.rejects(invoke({ homeworkId: task.id, section: 'materials' }))
  await pool.query(`UPDATE project_memberships SET status='SUSPENDED' WHERE company_id=$1 AND project_id=$2 AND user_id=$3`, [companyId, projectId, student.userId])
  await assert.rejects(invoke({ homeworkId: task.id, section: 'materials' }))
})

// Merge failures: equal post/homework IDs leak comments or flags; pagination and archives
// omit one kind; teacher-room lookup skips course membership checks.
test('[integration] homework shares forum filters while keeping target flags, comments and room grants separate', async () => {
  const { ForumApplication } = await import('../modules/learning/forum-application.js')
  const { ensureTeacherAgentForCourse } = await import('../modules/learning/teacher-agent-application.js')
  const forum = new ForumApplication(pool, transaction)
  const { homework: task } = await published()
  await pool.query(`INSERT INTO course_forum_posts(id,company_id,project_id,author_user_id,kind,title,body)
    VALUES($1,$2,$3,$4,'share','Separate forum discussion','Separate content')`, [task.id,companyId,projectId,teacher.userId])
  const comment = await forum.comment(student,courseId,'homework',task.id,'Homework comment')
  await assert.rejects(forum.editComment(student,courseId,task.id,comment.id,{body:'Wrong target'}))
  await forum.comment(student,courseId,'post',task.id,'Post comment')
  const initial = await forum.list(student,courseId,{})
  assert.deepEqual(initial.items.map(item=>({type:item.targetType,count:item.commentCount})).sort((a,b)=>a.type.localeCompare(b.type)),
    [{type:'homework',count:1},{type:'post',count:1}])
  assert.equal((await forum.detail(student,courseId,'post',task.id)).title,'Separate forum discussion')
  assert.equal((await forum.detail(student,courseId,'homework',task.id)).title,task.title)
  assert.deepEqual((await forum.list(student,courseId,{kind:'assignment',search:task.title})).items.map(item=>item.targetType),['homework'])
  await assert.rejects(forum.updateFlags(student,courseId,'homework',task.id,{pinned:true}))
  await forum.updateFlags(teacher,courseId,'homework',task.id,{pinned:true,archived:true})
  assert.deepEqual((await forum.list(student,courseId,{})).items.map(item=>item.targetType),['post'])
  const archived = await forum.list(student,courseId,{archived:'true'})
  assert.deepEqual(archived.items.map(item=>({type:item.targetType,pinned:item.pinned})),[{type:'homework',pinned:true}])
  assert.deepEqual((await forum.comments(student,courseId,'homework',task.id,0)).items.map(item=>item.body),['Homework comment'])
  await forum.updateFlags(teacher,courseId,'homework',task.id,{archived:false})
  assert.equal((await forum.list(student,courseId,{})).items[0].targetType,'homework')
  assert.equal((await forum.list(student,courseId,{offset:1})).items[0].targetType,'post')
  const room = await ensureTeacherAgentForCourse(companyId,courseId,pool,transaction)
  assert.deepEqual(await (await call(teacher,`/courses/${courseId}/teacher-agent`)).json(),{roomId:room.roomId,agentId:room.agentId,roomStatus:'active'})
  assert.equal((await call(student,`/courses/${courseId}/teacher-agent`)).status,403)
  assert.equal((await call(outsider,`/courses/${courseId}/teacher-agent`)).status,404)
})

// #325 failure model, recorded before implementation: the forum entry reads a
// teacher room that course creation no longer provisions. A lost response or
// concurrent retry must reuse one room, restore only the caller's list entry,
// and leave existing homework drafts/files untouched. Preparation must not
// grant course membership, reopen an inactive course, or cross tenant/course.
test('[integration] forum teacher entry prepares one room and preserves drafts on repeated requests', async () => {
  const draft = await homework.draft(teacher, courseId, visible)
  const url = `/courses/${courseId}/teacher-agent`
  assert.equal((await call(teacher, url)).status, 404, 'GET remains a read, not a provisioning side effect')
  const responses = await Promise.all([call(teacher, url, 'POST', {}), call(teacher, url, 'POST', {})])
  for (const response of responses) assert.equal(response.status, 200)
  const first = await responses[0].json() as { roomId: string; agentId: string; roomStatus: string }
  const second = await responses[1].json()
  assert.deepEqual(first, second)
  assert.deepEqual(await (await call(teacher, url)).json(), first)
  const channels = () => fetch(`${clients.get(teacher.userId)}/im/channels`, {
    headers: { 'x-company-id': companyId, 'x-project-id': projectId },
  }).then(response => response.json()) as Promise<Array<{ id: string }>>
  assert.ok((await channels()).some(item => item.id === first.roomId))
  for (const scope of [teacher, colleague]) await pool.query(`INSERT INTO conversation_list_removals(user_id,conversation_id,company_id,project_id)
    VALUES($1,$2,$3,$4)`, [scope.userId,first.roomId,companyId,projectId])
  assert.ok(!(await channels()).some(item => item.id === first.roomId))
  assert.equal((await call(teacher, url, 'POST', {})).status, 200)
  assert.ok((await channels()).some(item => item.id === first.roomId))
  assert.deepEqual((await pool.query('SELECT user_id FROM conversation_list_removals WHERE conversation_id=$1', [first.roomId])).rows,
    [{ user_id: colleague.userId }])
  assert.equal((await pool.query('SELECT 1 FROM learning_course_teacher_rooms WHERE company_id=$1 AND course_id=$2', [companyId,courseId])).rowCount, 1)
  assert.equal((await pool.query('SELECT 1 FROM learning_project_teacher_agents WHERE company_id=$1 AND project_id=$2', [companyId,projectId])).rowCount, 1)
  assert.equal((await pool.query('SELECT 1 FROM homeworks WHERE company_id=$1', [companyId])).rowCount, 1)
  assert.deepEqual(await homework.detail(teacher, courseId, draft.homework.id), draft)
  assert.equal((await pool.query('SELECT 1 FROM course_forum_posts WHERE company_id=$1', [companyId])).rowCount, 0)
})

test('[integration] teacher entry refuses unauthorized or inactive scopes without provisioning', async () => {
  const url = `/courses/${courseId}/teacher-agent`
  assert.equal((await call(student, url, 'POST', {})).status, 403)
  assert.equal((await call(outsider, url, 'POST', {})).status, 404)
  assert.equal((await call(teacher, '/courses/nonexistent/teacher-agent', 'POST', {})).status, 404)
  assert.equal((await call(colleague, '/courses/homework-other-course/teacher-agent', 'POST', {})).status, 404)
  assert.equal((await call({ ...teacher, companyId: 'another-tenant' }, url, 'POST', {})).status, 404)
  await pool.query("UPDATE project_memberships SET status='SUSPENDED' WHERE company_id=$1 AND project_id=$2 AND user_id=$3", [companyId,projectId,teacher.userId])
  assert.equal((await call(teacher, url, 'POST', {})).status, 403)
  await pool.query("UPDATE project_memberships SET status='ACTIVE' WHERE company_id=$1 AND project_id=$2 AND user_id=$3", [companyId,projectId,teacher.userId])
  // A company administrator with no course teacher membership must not be
  // silently added to the teacher group as a side effect of this entry point.
  await pool.query('UPDATE company_memberships SET is_admin=TRUE WHERE company_id=$1 AND user_id=$2 AND ended_at IS NULL', [companyId,colleague.userId])
  assert.equal((await call(colleague, '/courses/homework-other-course/teacher-agent', 'POST', {})).status, 403)
  for (const status of ['DRAFT','COURSE_ENDED','READ_ONLY','ARCHIVED']) {
    await pool.query('UPDATE projects SET status=$3 WHERE company_id=$1 AND id=$2', [companyId,projectId,status])
    assert.equal((await call(teacher, url, 'POST', {})).status, 403)
  }
  assert.equal((await pool.query('SELECT 1 FROM learning_course_teacher_rooms')).rowCount, 0)
  assert.equal((await pool.query('SELECT 1 FROM learning_project_teacher_agents')).rowCount, 0)
})

// Failure model: recovery-only pre-edit text leaks through report JSON, frozen
// submissions or old stored snapshots; stripping it must preserve current native
// formatting, private recovery, report pairing, tenant/peer checks and idempotency.
test('[integration] legacy recovery stays private across current reports and native submission snapshots', async () => {
  const { learnerHomeworkRead, teacherHomeworkOverview } = await import('../modules/learning/homework-reporting.js')
  const { homework: task } = await published()
  const thread = await homework.start(student, courseId, task.id)
  const message = commitLearnerEvidence(thread, 'I can explain my current answer and need feedback about the half factor.')
  const editorDocument = { format: 'blocknote', version: 1, projection: 'CURRENT ANSWER B', sections: ['CURRENT ANSWER B'],
    legacyMarkdown: 'PRIVATE ORIGINAL A', blocks: [{ id: 'current-answer-block', type: 'paragraph',
      props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
      content: [{ type: 'text', text: 'CURRENT ANSWER B', styles: { bold: true } }], children: [] }] }
  const savedResponse = await call(student, path(task.id, '/answer'), 'PATCH',
    { expectedRevision: 0, text: 'CURRENT ANSWER B', editorDocument, links: [], attachments: [] })
  assert.equal(savedResponse.status, 200)
  const privateState = (await homework.detail(student, courseId, task.id)).student!
  assert.equal(privateState.answer.editorDocument?.legacyMarkdown, 'PRIVATE ORIGINAL A')
  const ready = await report(task.id, evidenceJudgment(task.criteria, message.clientMsgNo, message.text, false))
  const modelInput = lastModelRequest as { messages: Array<{ role: string; content: string }> }
  const data = JSON.parse(modelInput.messages.find(item => item.role === 'user')!.content)
  assert.deepEqual(data.answer, { text: 'CURRENT ANSWER B', links: [], attachments: [] })
  const ownTool = await learnerHomeworkRead(pool, student, courseId, { homeworkId: task.id, section: 'answer', offset: 0 }, new AbortController().signal)
  assert.doesNotMatch(JSON.stringify(ownTool), /PRIVATE ORIGINAL A|legacyMarkdown|editorDocument/)
  const input = { expectedAnswerRevision: ready.answerRevision, reportId: ready.report!.id,
    conversationReferences: currentReferences(), idempotencyKey: 'native-current-answer-only' }
  const submittedResponse = await call(student, path(task.id, '/submit'), 'POST', input)
  assert.equal(submittedResponse.status, 200)
  const submitted = await submittedResponse.json() as Awaited<ReturnType<typeof homework.submit>>
  assert.ok(submitted.answer.editorDocument)
  assert.equal(submitted.answer.editorDocument.legacyMarkdown, undefined)
  assert.deepEqual(submitted.answer.editorDocument.blocks, editorDocument.blocks)
  assert.deepEqual((await homework.submit(student, courseId, task.id, input)).answer, submitted.answer)
  const persisted = (await pool.query('SELECT answer FROM homework_submissions WHERE id=$1', [submitted.id])).rows[0].answer
  assert.equal(persisted.editorDocument.legacyMarkdown, undefined)
  // Simulate a row saved by the previous writer; reader must not disclose old
  // recovery metadata, and must not rewrite that immutable historical row.
  await pool.query('UPDATE homework_submissions SET answer=$2::jsonb WHERE id=$1',
    [submitted.id, JSON.stringify({ ...persisted, editorDocument })])
  const teacherItems = (await homework.submissions(teacher, courseId, task.id)).items
  assert.equal(teacherItems[0].answer.editorDocument?.legacyMarkdown, undefined)
  assert.deepEqual(teacherItems[0].answer.editorDocument?.blocks, editorDocument.blocks)
  const teacherTool = await teacherHomeworkOverview(pool, teacher, courseId,
    { homeworkId: task.id, learnerId: student.userId, section: 'answer', offset: 0 })
  assert.doesNotMatch(JSON.stringify(teacherTool), /PRIVATE ORIGINAL A|legacyMarkdown|editorDocument/)
  assert.match(JSON.stringify(teacherTool), /CURRENT ANSWER B/)
  assert.equal((await homework.submissions(peer, courseId, task.id)).items.length, 0)
  await assert.rejects(homework.submissions(outsider, courseId, task.id))
  assert.equal((await homework.detail(student, courseId, task.id)).student!.answer.editorDocument?.legacyMarkdown, 'PRIVATE ORIGINAL A')
  assert.equal((await pool.query('SELECT answer FROM homework_submissions WHERE id=$1', [submitted.id])).rows[0].answer.editorDocument.legacyMarkdown, 'PRIVATE ORIGINAL A')
})

// #381: direct human authoring must enter the existing homework lifecycle. The
// caller UUID is stable across a lost HTTP response; it never grants authority.
test('381 human draft endpoint retries one course-scoped draft and preserves explicit publication', async () => {
  const id=randomUUID(),url=path(id,'/draft')
  const created=await call(teacher,url,'PUT',visible)
  assert.equal(created.status,200)
  const first=await created.json() as {homework:{id:string;status:string;revision:number;visibleHash:string}}
  assert.equal(first.homework.id,id);assert.equal(first.homework.status,'DRAFT')
  const replays=await Promise.all([call(teacher,url,'PUT',visible),call(teacher,url,'PUT',visible)])
  for(const replay of replays){assert.equal(replay.status,200);assert.equal((await replay.json() as {homework:{id:string}}).homework.id,id)}
  const count=await pool.query('SELECT count(*)::int n FROM homeworks WHERE id=$1',[id])
  assert.equal(count.rows[0].n,1)
  assert.equal((await call(teacher,url,'PUT',{...visible,title:'Changed retry'})).status,409)
  assert.equal((await call(colleague,url,'PUT',visible)).status,409)
  assert.equal((await call(student,path(id))).status,404)
  assert.equal((await call(teacher,path(id,'/publish'),'POST',{expectedRevision:first.homework.revision,visibleHash:first.homework.visibleHash,idempotencyKey:'381-publish'})).status,409)
  await pool.query("UPDATE homeworks SET validation_status='READY',validated_revision=revision WHERE id=$1",[id])
  assert.equal((await call(teacher,path(id,'/publish'),'POST',{expectedRevision:first.homework.revision,visibleHash:first.homework.visibleHash,idempotencyKey:'381-publish'})).status,200)
  assert.equal((await call(student,path(id))).status,200)
})

test('381 direct draft rejects student, unrelated course and revoked teacher without writes',async()=>{
  for(const scope of [student,outsider]) assert.ok([403,404].includes((await call(scope,path(randomUUID(),'/draft'),'PUT',visible)).status))
  assert.equal((await call(teacher,path('invalid-id','/draft'),'PUT',visible)).status,400)
  await pool.query("UPDATE project_memberships SET status='SUSPENDED' WHERE company_id=$1 AND project_id=$2 AND user_id=$3",[companyId,projectId,teacher.userId])
  assert.ok([403,404].includes((await call(teacher,path(randomUUID(),'/draft'),'PUT',visible)).status))
  assert.equal((await pool.query('SELECT count(*)::int n FROM homeworks')).rows[0].n,0)
})
