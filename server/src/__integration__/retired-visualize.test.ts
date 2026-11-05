import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer, type Server } from 'node:http'
import { createHash } from 'node:crypto'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import type { ActionContext } from '@lingxi-org/lingxios'
import { authorizeAgent } from '../agents/tools.js'
import { ensureTeacherAgentForCourse } from '../modules/learning/teacher-agent-application.js'
import { TEACHER_DESIGN_ACTIONS } from '../modules/learning/teacher-preset.js'
import { createNativeMessage } from '../im/message-types.js'
import { exportRetiredVisualize } from '../im/retired-visualize.js'
import { assertInteractionAdmission } from '../im/interaction-admission.js'
import { messageAcceptanceDigest } from '../im/messages-digest.js'
import { errorHandler } from '../http/errors.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

const userId = 'test-owner', channelId = 'archive-room', runId = 'archive-run', path = '/retained/visualize/lesson.html'
const body = `历史解释正文。\n::visualize${JSON.stringify({ path })}\n保留尾部。`
const html = '<div>retained content</div><script>throw new Error("never execute")</script>'
let companyId: string, projectId: string, agentId: string, origin: string, server: Server
let im: Awaited<ReturnType<typeof installRecordingWukong>>
const actor = () => ({ companyId, channelId, userId })
const archiveUrl = () => `${origin}/api/im/channels/${channelId}/visualize/archive?${new URLSearchParams({ path, sourceMessageId: 'archive-message' })}`
before(async () => {
  await ensureSchemaOnce(); await resetAllTables()
  ;({ companyId, projectId, agentId } = await seedCompanyWithAgent())
  await seedUserMembership(userId, companyId)
  await seedUserMembership('archive-peer', companyId)
  await seedUserMembership('archive-outsider', companyId)
  const members = [userId, 'archive-peer', agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Archive',$4::jsonb)`,
    [channelId, companyId, projectId, JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)`,
    [channelId, companyId, JSON.stringify({ channelType: 2, members })])
  await pool.query(`INSERT INTO agent_run_bindings(run_id,company_id,conversation_id,session_id,agent_id,principal_id,message_protocol)
    VALUES($1,$2,$3,$3,$4,$5,2)`, [runId, companyId, channelId, agentId, userId])
  await pool.query(`INSERT INTO im_visualize_documents(company_id,channel_id,path,run_id,agent_id,created_by,html,source_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [companyId, channelId, path, runId, agentId, userId, html, createHash('sha256').update(html).digest('hex')])
  for (const person of [userId, 'archive-peer']) {
    await pool.query(`INSERT INTO im_visualize_states(company_id,channel_id,path,user_id,state) VALUES($1,$2,$3,$4,$5::jsonb)`,
      [companyId, channelId, path, person, JSON.stringify({ modelContent: { owner: person }, annotation: 'retained' })])
    await pool.query(`INSERT INTO im_visualize_pages(id,company_id,channel_id,path,user_id,project_id,token_hash,instance_key,document_version,source_message_id)
      VALUES($1,$2,$3,$4,$5,$6,'never-export-this-hash','old-instance',1,'archive-message')`,
      [`archive-page-${person}`, companyId, channelId, path, person, projectId])
  }
  im = await installRecordingWukong()
  im.messages.push({ channelId, channelType: 2, messageId: 'archive-message', clientMsgNo: 'archive-client', messageSeq: 1,
    fromUid: agentId, timestamp: Date.now() / 1000, payload: createNativeMessage({ id: 'archive-client', role: 'assistant',
      content: [{ type: 'text', text: body }], custom: { runId } }) })
  const app = await buildApiTestApp(userId); app.use(errorHandler)
  server = createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  origin = `http://127.0.0.1:${address.port}`
})
after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  await im?.close(); await teardownAll()
})

test('archive exports original source/body and only the caller state as inert attachment, without mutating retained data', async () => {
  const response = await fetch(archiveUrl(), { headers: { 'x-company-id': companyId, 'x-project-id': projectId } })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /application\/json/)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="visualize-archive.json"')
  assert.match(response.headers.get('content-security-policy') ?? '', /sandbox/)
  const archive = await response.json() as Awaited<ReturnType<typeof exportRetiredVisualize>>
  assert.equal(archive.retired, true)
  assert.equal(archive.document.html, html)
  assert.equal(archive.document.requestVersion, null, 'unproven historical request version remains null')
  assert.equal(archive.sourceMessage.body, body)
  assert.ok(archive.userState)
  assert.equal((archive.userState.state as { modelContent: { owner: string } }).modelContent.owner, userId)
  assert.deepEqual(archive.pages.map((page: { id: string }) => page.id), [`archive-page-${userId}`])
  assert.equal(JSON.stringify(archive).includes('never-export-this-hash'), false)
  assert.equal(JSON.stringify(archive).includes('archive-peer'), false)
  assert.deepEqual((await pool.query(`SELECT (SELECT count(*)::int FROM im_visualize_documents) documents,
    (SELECT count(*)::int FROM im_visualize_states) states,(SELECT count(*)::int FROM im_visualize_pages) pages`)).rows,
    [{ documents: 1, states: 2, pages: 2 }])
})
test('archive rechecks tenant/project/member/source identity and revoked access', async () => {
  const source = { ...actor(), path, sourceMessageId: 'archive-message' }
  await assert.rejects(exportRetiredVisualize({ ...source, sourceMessageId: 'unrelated-message' }))
  await assert.rejects(exportRetiredVisualize({ ...source, path: '/etc/passwd' }))
  await assert.rejects(exportRetiredVisualize({ ...source, userId: 'archive-outsider' }))
  await assert.rejects(exportRetiredVisualize({ ...source, companyId: 'different-company' }))
  const response = await fetch(archiveUrl(), { headers: { 'x-company-id': companyId, 'x-project-id': 'wrong-project' } })
  assert.equal(response.status, 403)
  const original = im.messages[0]
  im.messages[0] = { ...original, payload: createNativeMessage({ id: 'archive-client', role: 'assistant',
    content: [{ type: 'text', text: body }], custom: { runId: 'wrong-run' } }) }
  await assert.rejects(exportRetiredVisualize(source))
  im.messages[0] = original
  await pool.query(`UPDATE conversations SET members=$3::jsonb WHERE company_id=$1 AND id=$2`, [companyId, channelId, JSON.stringify([agentId, 'archive-peer'])])
  await assert.rejects(exportRetiredVisualize(source))
  await pool.query(`UPDATE conversations SET members=$3::jsonb WHERE company_id=$1 AND id=$2`, [companyId, channelId, JSON.stringify([userId, agentId, 'archive-peer'])])
})
test('every former runtime/write/page/export endpoint is retired and cannot change durable state', async () => {
  for (const [method, suffix] of [['GET', '/document'], ['GET', '/state'], ['POST', '/pages'], ['GET', '/pages/old/resources'],
    ['PUT', '/pages/old/state'], ['POST', '/pages/old/gesture'], ['POST', '/pages/old/follow-up'], ['POST', '/pages/old/open-external'], ['DELETE', '/pages/old']]) {
    const response = await fetch(`${origin}/api/im/channels/${channelId}/visualize${suffix}`, {
      method, headers: { 'x-company-id': companyId, 'x-project-id': projectId, 'content-type': 'application/json' },
      ...(['POST', 'PUT'].includes(method) ? { body: '{}' } : {}),
    })
    assert.equal(response.status, 410, `${method} ${suffix}`)
  }
  assert.equal((await pool.query(`SELECT count(*)::int n FROM im_visualize_pages`)).rows[0].n, 2)
})
test('new legacy follow-ups are rejected while exact already committed echoes can be reconciled', async () => {
  const nonce = 'archive-follow-up'
  const payload = createNativeMessage({ id: nonce, role: 'user', content: [{ type: 'text', text: 'old follow-up' }], custom: { visualizeFollowUp: { old: true } } })
  const input = { ...actor(), clientNonce: nonce, payload }
  await assert.rejects(assertInteractionAdmission(input))
  await pool.query(`INSERT INTO im_send_acceptances(company_id,user_id,client_nonce,input_digest,channel_id,channel_type,payload,status)
    VALUES($1,$2,$3,$4,$5,2,$6::jsonb,'pending')`,
    [companyId, userId, nonce, messageAcceptanceDigest({ channelId, channelType: 2, payload }), channelId, JSON.stringify(payload)])
  await assert.rejects(assertInteractionAdmission(input), /retired/)
  await pool.query(`UPDATE im_send_acceptances SET status='accepted' WHERE company_id=$1 AND client_nonce=$2`, [companyId, nonce])
  await assertInteractionAdmission(input)
  await assert.rejects(assertInteractionAdmission({ ...input, payload: createNativeMessage({ id: nonce, role: 'user',
    content: [{ type: 'text', text: 'changed old follow-up' }], custom: { visualizeFollowUp: { old: true } } }) }), /retired/)
})

test('managed teacher Design authorizes only current conversation edits under explicit capability and live teacher scope', async () => {
  const teachingProject = 'archive-teaching-project', courseId = 'archive-teaching-course'
  await pool.query(`INSERT INTO projects(id,company_id,kind,name,status,created_by) VALUES($1,$2,'TEACHING','Teacher Design','ACTIVE',$3)`,
    [teachingProject, companyId, userId])
  await pool.query(`INSERT INTO courses(id,company_id,project_id,created_by) VALUES($1,$2,$3,$4)`, [courseId, companyId, teachingProject, userId])
  await pool.query(`INSERT INTO project_memberships(company_id,project_id,user_id,role,status) VALUES($1,$2,$3,'TEACHER','ACTIVE')`,
    [companyId, teachingProject, userId])
  const teacher = await ensureTeacherAgentForCourse(companyId, courseId, pool, work => withTransaction(pool, work))
  const invoke = (action: string, change: Record<string, unknown> = {}) => withTransaction(pool, db => authorizeAgent({
    work: { id: 'teacher-design-run', tenantId: companyId, agentId: teacher.agentId, principalId: userId,
      sessionId: teacher.roomId, kind: 'turn', lane: 'interactive', createdAt: new Date().toISOString(),
      meta: { conversationId: teacher.roomId }, ...change },
    action: { action }, database: db, signal: AbortSignal.timeout(5000),
  } as unknown as ActionContext))
  for (const action of TEACHER_DESIGN_ACTIONS) await invoke(action)
  for (const action of ['visualize.save', 'design.start_workspace', 'design.available_agents', 'design.submit_report', 'slides.current']) {
    await assert.rejects(invoke(action), /retired|revoked/)
  }
  await assert.rejects(invoke('design.current', { kind: 'routine' }), /revoked/)
  await assert.rejects(invoke('design.current', { conversation: { conversationId: teacher.roomId, internal: true } }), /revoked/)
  await pool.query(`UPDATE participants SET capabilities='["teacher_admin","knowledge"]' WHERE company_id=$1 AND id=$2`, [companyId, teacher.agentId])
  await assert.rejects(invoke('design.current'), /revoked/)
  await pool.query(`UPDATE participants SET capabilities='["teacher_admin","knowledge","design"]' WHERE company_id=$1 AND id=$2`, [companyId, teacher.agentId])
  await pool.query(`UPDATE learning_course_teacher_rooms SET status='closed' WHERE company_id=$1 AND course_id=$2`, [companyId, courseId])
  await assert.rejects(invoke('design.current'), /closed|teacher_scope_revoked/)
})
