import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { ForumApplication, canReadLearningFile } from '../modules/learning/forum-application.js'
import { submitProjectLearningActivity } from '../modules/learning/activities-application.js'
import { ensureEducationPlan } from '../modules/entitlements/public.js'
import { seedUserMembership, ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

// Failure modes: cross-course reads/search/comments/files, student moderation, private source
// disclosure, overwritten retries/versions, late or closed submissions, forged Agent authorship,
// generated work counted as independent evidence, and role revocation during file access.
const companyId = 'forum-school'
const teacher = { companyId, userId: 'forum-teacher' }
const student = { companyId, userId: 'forum-student' }
const peer = { companyId, userId: 'forum-peer' }
const outsider = { companyId, userId: 'forum-outsider' }
const transaction = <T>(work: Parameters<typeof withTransaction<T>>[1]) => withTransaction(pool, work)
const forum = new ForumApplication(pool, transaction)

before(ensureSchemaOnce)
beforeEach(async () => {
  await resetAllTables()
  await ensureEducationPlan(pool)
  await pool.query(`INSERT INTO companies(id,name,slug,type,status,plan_id)
    VALUES ($1,'Forum School',$1,'EDUCATION','ACTIVE','plan-education')`, [companyId])
  for (const scope of [teacher, student, peer, outsider]) {
    await pool.query(`INSERT INTO users(id,email,display_name) VALUES ($1,$1||'@test.local',$1)`, [scope.userId])
    await seedUserMembership(scope.userId, companyId, { role: scope === teacher ? 'TEACHER' : 'STUDENT' })
  }
  for (const projectId of ['forum-project', 'forum-other']) {
    await pool.query(`INSERT INTO projects(id,company_id,kind,plan_id,name,status,created_by)
      VALUES ($1,$2,'TEACHING','plan-education',$1,'ACTIVE',$3)`, [projectId,companyId,teacher.userId])
    await pool.query(`INSERT INTO courses(id,company_id,project_id,created_by) VALUES ($1,$2,$3,$4)`,
      [`course-${projectId}`,companyId,projectId,teacher.userId])
    const users = projectId === 'forum-project' ? [teacher,student,peer] : [teacher,outsider]
    for (const scope of users) await pool.query(`INSERT INTO project_memberships(company_id,project_id,user_id,role,status)
      VALUES ($1,$2,$3,$4,'ACTIVE')`, [companyId,projectId,scope.userId,scope === teacher ? 'TEACHER' : 'STUDENT'])
  }
  await pool.query(`INSERT INTO learning_activities(id,company_id,project_id,title,instructions,kind,status,created_by,published_by,published_at,due_at)
    VALUES ('forum-homework',$1,'forum-project','Historical homework','Explain your result','PRACTICE','PUBLISHED',$2,$2,NOW()-INTERVAL '2 days',NOW()-INTERVAL '1 day')`, [companyId,teacher.userId])
  for (const visibility of ['PROJECT','PRIVATE']) await pool.query(`INSERT INTO knowledge_sources
    (id,company_id,project_id,kind,title,visibility_scope,owner_user_id,created_by_user_id,created_via)
    VALUES ($1,$2,'forum-project','text',$1,$3,$4,$4,'USER')`, [`source-${visibility}`,companyId,visibility,student.userId])
  await pool.query(`INSERT INTO uploaded_files(storage_key,company_id,owner_user_id,company_period_id)
    SELECT 'attachments/forum-school/student.txt',$1,$2,period_id FROM company_memberships
    WHERE company_id=$1 AND user_id=$2 AND ended_at IS NULL`, [companyId,student.userId])
})
after(() => teardownAll())
const course = 'course-forum-project'

const post = { kind: 'case' as const, title: 'My project', body: 'Student work', tags: ['geometry'], links: [], attachments: [] }

test('[integration] forum discovers existing public sources and assignments, isolating every content operation', async () => {
  const created = await forum.createPost(student, course, post)
  assert.equal(created.authorId, student.userId)
  const feed = await forum.list(student, course, {})
  assert.deepEqual(new Set(feed.items.map(item => item.id)), new Set([created.id,'forum-homework','source-PROJECT']))
  assert.equal((await forum.list(student, course, { search: 'PRIVATE' })).items.length, 0)
  assert.equal((await forum.list(student, course, { tag: 'geometry' })).items[0]?.id, created.id)
  await assert.rejects(forum.list(outsider, course, {}))
  await assert.rejects(forum.detail(outsider, course, 'post', created.id))
  await assert.rejects(forum.createPost(outsider, course, post))
  await assert.rejects(forum.comment(outsider, course, 'post', created.id, 'no access'))
  await assert.rejects(forum.comments(outsider, course, 'post', created.id, 0))
  await assert.rejects(forum.detail(student, 'course-forum-other', 'post', created.id))
  await assert.rejects(forum.createPost(student, course, { ...post, sourceId: 'source-PRIVATE' }))
  await forum.comment(student, course, 'post', created.id, 'A comment')
  assert.equal((await forum.comments(peer, course, 'post', created.id, 0)).items[0]?.body, 'A comment')
  await assert.rejects(forum.updateFlags(student, course, 'post', created.id, { featured: true }))
  const featured = await forum.updateFlags(teacher, course, 'post', created.id, { featured: true, pinned: true })
  assert.equal(featured.featured, true)
  assert.equal(featured.authorId, student.userId)
  await assert.rejects(forum.updateFlags(teacher, course, 'source', 'source-PRIVATE', { pinned: true }))
})

test('[integration] submission versions preserve links, private files, late status and idempotency; closure blocks browser and Agent', async () => {
  const input = { companyId, projectId: 'forum-project', activityId: 'forum-homework', learnerId: student.userId,
    answer: 'My answer', links: ['https://example.com/student-work'], attachments: [{ key: 'attachments/forum-school/student.txt', name: 'student.txt' }], idempotencyKey: 'forum-original-v1' }
  const first = await submitProjectLearningActivity(transaction, input)
  assert.deepEqual(await submitProjectLearningActivity(transaction, input), first)
  await submitProjectLearningActivity(transaction, { ...input, answer: 'Revised answer', idempotencyKey: 'forum-original-v2' })
  const history = await forum.submissions(student, course, 'forum-homework', 0)
  assert.equal(history.items.length, 2)
  assert.equal(history.items[0]?.answer, 'Revised answer')
  assert.equal(history.items[1]?.answer, 'My answer')
  assert.equal(history.items[0]?.late, true)
  assert.deepEqual(history.items[0]?.links, input.links)
  assert.deepEqual(history.items[0]?.attachments, input.attachments)
  assert.equal((await forum.submissions(peer, course, 'forum-homework', 0)).items.length, 0)
  assert.equal((await forum.submissions(teacher, course, 'forum-homework', 0)).items.length, 2)
  assert.equal(await canReadLearningFile(pool, input.attachments[0].key, student.userId), true)
  assert.equal(await canReadLearningFile(pool, input.attachments[0].key, teacher.userId), true)
  assert.equal(await canReadLearningFile(pool, input.attachments[0].key, peer.userId), false)
  assert.equal(await canReadLearningFile(pool, input.attachments[0].key, outsider.userId), false)
  assert.equal((await forum.list(peer, course, { search: 'Revised answer' })).items.length, 0)
  await assert.rejects(submitProjectLearningActivity(transaction, { ...input, learnerId: peer.userId, idempotencyKey: 'stolen-file' }))
  await pool.query(`UPDATE learning_activities SET status='CLOSED' WHERE id='forum-homework'`)
  await assert.rejects(submitProjectLearningActivity(transaction, { ...input, idempotencyKey: 'after-close-web' }))
  await assert.rejects(submitProjectLearningActivity(transaction, { ...input, idempotencyKey: 'after-close-agent',
    source: 'AGENT_GENERATED', agentId: 'forum-agent', agentWorkId: 'forum-work' }))
  await pool.query(`UPDATE project_memberships SET status='SUSPENDED' WHERE company_id=$1 AND project_id='forum-project' AND user_id=$2`, [companyId,student.userId])
  assert.equal(await canReadLearningFile(pool, input.attachments[0].key, student.userId), false)
})

test('[integration] Agent provenance cannot become independent human evidence or change the submitting student', async () => {
  const result = await submitProjectLearningActivity(transaction, { companyId,projectId: 'forum-project',activityId: 'forum-homework',learnerId: student.userId,
    answer: 'Agent generated answer', idempotencyKey: 'forum-agent-generated', source: 'AGENT_GENERATED', agentId: 'forum-agent', agentWorkId: 'forum-work' })
  const { rows } = await pool.query(`SELECT a.learner_id,a.source,a.assistance,a.submitted_by_agent,a.agent_work_id,e.level,e.derivation,e.created_by_type
    FROM learning_attempts a JOIN evidence_records e ON e.id=a.evidence_id WHERE a.id=$1`, [result.attemptId])
  assert.deepEqual(rows, [{ learner_id: student.userId,source: 'AGENT_GENERATED',assistance: 'GUIDED',submitted_by_agent: 'forum-agent',agent_work_id: 'forum-work',level: 'L2',derivation: 'COMPUTED',created_by_type: 'AGENT' }])
  await assert.rejects(pool.query(`UPDATE learning_attempts SET assistance='NONE' WHERE id=$1`, [result.attemptId]))
  await assert.rejects(submitProjectLearningActivity(transaction, { companyId,projectId: 'forum-other',activityId: 'forum-homework',learnerId: student.userId,
    answer: 'Out of scope',idempotencyKey: 'forum-agent-outside',source: 'AGENT_GENERATED',agentId: 'forum-agent',agentWorkId: 'forum-work' }))
})

test('[integration] native submission tools bind principal, frozen audience, original messages and Agent provenance', async () => {
  const [{ learningTools }, { createNativeMessage }, { installRecordingWukong }] = await Promise.all([
    import('../modules/learning/agent-tools.js'), import('../../../src/lib/nativeMessage.js'), import('./_recording-wukong.js'),
  ])
  const im = await installRecordingWukong()
  try {
    await pool.query(`INSERT INTO participants(id,company_id,kind,name,role,initial,avatar_bg,status,capabilities)
      VALUES ('forum-agent',$1,'agent','Forum Agent','assistant','F','#abcdef','avail','["learning"]')`, [companyId])
    await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
      VALUES ('forum-room',$1,'forum-project','group','Forum room',$2::jsonb)`, [companyId,JSON.stringify([student.userId,'forum-agent'])])
    await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile)
      VALUES ('forum-room',$1,$2::jsonb)`, [companyId,JSON.stringify({ channelType: 2,members: [student.userId,'forum-agent'] })])
    await pool.query(`INSERT INTO learning_course_rooms(course_id,company_id,conversation_id,purpose,created_by)
      VALUES ($1,$2,'forum-room','discussion',$3)`, [course,companyId,teacher.userId])
    const original = 'My independently written answer. https://example.com/original'
    im.messages.push({ channelId: 'forum-room',channelType: 2,messageId: 'forum-message',clientMsgNo: 'forum-message',messageSeq: 1,
      fromUid: student.userId,timestamp: Date.now()/1000,payload: createNativeMessage({ id: 'forum-message',role: 'user',createdAt: new Date().toISOString(),content: [{ type: 'text',text: original }] }) })
    const tool = learningTools.find(tool => tool.action === 'learning.submit_activity')!
    assert.ok(tool)
    const invoke = async (input: object, audience = [student.userId,'forum-agent']) => {
      const data = tool.parse(input)
      const context = { database: pool,signal: AbortSignal.timeout(10000),requestVersion: 1,
        work: { id: 'forum-work',tenantId: companyId,agentId: 'forum-agent',principalId: student.userId,
          sessionId: 'forum-session',kind: 'turn',lane: 'interactive',triggerRef: 'forum-message',fence: 1,homeEpoch: 1,createdAt: new Date().toISOString(),
          conversation: { conversationId: 'forum-room',policyVersion: 1,source: { messageId: 'forum-message',version: 1 },internal: false,
            audience: { visibility: 'conversation',participantIds: audience } } },
        action: { runId: 'forum-work',cellId: 'submit',callIndex: 0,action: tool.action,args: data,idempotencyKey: 'forum-native' },
      } as unknown as import('@lyyzka/lingxios').ActionContext
      return transaction(async db => {
        const action = { ...context,database: db }
        await tool.authorize(action,data)
        return tool.execute(action,data)
      })
    }
    await invoke({ activityId: 'forum-homework',source: 'AGENT_RELAY',evidenceClientMsgNos: ['forum-message'],idempotencyKey: 'forum-native-relay' })
    const history = await forum.submissions(student,course,'forum-homework',0)
    assert.equal(history.items[0]?.answer,original)
    assert.equal(history.items[0]?.source,'AGENT_RELAY')
    assert.equal(history.items[0]?.agentId,'forum-agent')
    await invoke({ activityId: 'forum-homework',source: 'AGENT_GENERATED',answer: 'Generated draft',idempotencyKey: 'forum-native-generated' })
    await assert.rejects(invoke({ activityId: 'forum-homework',source: 'AGENT_RELAY',answer: 'Forged original',evidenceClientMsgNos: ['forum-message'],idempotencyKey: 'forum-forged-relay' }))
    await assert.rejects(invoke({ activityId: 'forum-homework',source: 'AGENT_RELAY',evidenceClientMsgNos: ['non-human-message'],idempotencyKey: 'forum-forged-message' }))
    await assert.rejects(invoke({ activityId: 'forum-homework',source: 'AGENT_GENERATED',answer: 'Private',idempotencyKey: 'forum-peer-audience' },[student.userId,peer.userId,'forum-agent']))
    await pool.query(`UPDATE learning_activities SET status='CLOSED' WHERE id='forum-homework'`)
    await assert.rejects(invoke({ activityId: 'forum-homework',source: 'AGENT_GENERATED',answer: 'Too late',idempotencyKey: 'forum-native-closed' }))
  } finally { await im.close() }
})


test('[integration] HTTP forum and private download routes reject cross-course access and forged browser provenance', async () => {
  const [{ createServer }, { buildApiTestApp }, { storage }] = await Promise.all([
    import('node:http'), import('./_helpers.js'), import('../storage.js'),
  ])
  const key = 'attachments/forum-school/student.txt'
  await storage.put(key, Buffer.from('Private homework file'), 'text/plain')
  const servers: import('node:http').Server[] = []
  const clients = new Map<string, string>()
  try {
    for (const scope of [teacher,student,peer,outsider]) {
      const server = createServer(await buildApiTestApp(scope.userId))
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      servers.push(server)
      const address = server.address(); assert.ok(address && typeof address !== 'string')
      clients.set(scope.userId, `http://127.0.0.1:${address.port}/api`)
    }
    const call = (scope: typeof teacher, path: string, method = 'GET', data?: unknown) => fetch(`${clients.get(scope.userId)}${path}`, {
      method,headers: { 'content-type': 'application/json','x-company-id': companyId },...(data ? { body: JSON.stringify(data) } : {}),
    })
    const submit = `/courses/${course}/activities/forum-homework/submit`
    assert.equal((await call(student, submit, 'POST', { answer: 'Cannot forge Agent provenance',idempotencyKey: 'forged-http-source',source: 'AGENT_GENERATED' })).status,400)
    assert.equal((await call(student, submit, 'POST', { answer: 'Browser submission',links: ['https://example.com/browser'],attachments: [{ key,name: 'student.txt' }],idempotencyKey: 'http-submission-1' })).status,201)
    for (const scope of [student,teacher]) {
      const response = await call(scope,`/files?key=${encodeURIComponent(key)}`)
      assert.equal(response.status,200)
      assert.equal(await response.text(),'Private homework file')
    }
    for (const scope of [peer,outsider]) assert.equal((await call(scope,`/files?key=${encodeURIComponent(key)}`)).status,404)
    assert.equal((await call(outsider,`/courses/${course}/forum?search=Browser`)).status,404)
    assert.equal((await call(student,`/courses/course-forum-other/forum`)).status,404)
    const created = await call(student,`/courses/${course}/forum`,'POST',post)
    assert.equal(created.status,201)
    const item = await created.json() as { id: string }
    const target = `/courses/${course}/forum/post/${item.id}`
    assert.equal((await call(outsider,target)).status,404)
    assert.equal((await call(outsider,`${target}/comments`,'POST',{ body: 'forbidden' })).status,404)
    assert.equal((await call(student,target,'PATCH',{ pinned: true,official: true,featured: true })).status,403)
    assert.equal((await call(teacher,target,'PATCH',{ pinned: true,featured: true })).status,200)
    assert.equal((await call(student,`/courses/${course}/activities`,'POST',{ title: 'Unauthorized assignment',instructions: 'No',type: 'PRACTICE' })).status,403)
    await call(teacher,`/courses/${course}/activities/forum-homework/close`,'POST')
    assert.equal((await call(student,submit,'POST',{ answer: 'After close',idempotencyKey: 'after-http-close' })).status,409)
  } finally {
    for (const server of servers) await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
