import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { ForumApplication, canReadLearningFile } from '../modules/learning/forum-application.js'
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

const conversationReferences=[{channelId:'evidence-room',messageIds:['evidence-user','evidence-assistant']}]
let evidenceIm:Awaited<ReturnType<typeof import('./_recording-wukong.js').installRecordingWukong>>
before(ensureSchemaOnce)
beforeEach(async () => {
  await resetAllTables()
  evidenceIm=await (await import('./_recording-wukong.js')).installRecordingWukong()
  await ensureEducationPlan(pool)
  await pool.query(`INSERT INTO companies(id,name,slug,type,status,plan_id)
    VALUES ($1,'Forum School',$1,'EDUCATION','ACTIVE','plan-education')`, [companyId])
  for (const scope of [teacher, student, peer, outsider]) {
    await pool.query(`INSERT INTO users(id,email,display_name) VALUES ($1,$1||'@test.local',$1)`, [scope.userId])
    await seedUserMembership(scope.userId, companyId, { role: scope === teacher ? 'TEACHER' : 'STUDENT',isAdmin:false })
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
  await pool.query(`INSERT INTO course_forum_posts(id,company_id,project_id,title,body,kind,status,author_user_id,created_at,due_at)
    VALUES ('forum-homework',$1,'forum-project','Historical homework','Explain your result','assignment','PUBLISHED',$2,NOW()-INTERVAL '2 days',NOW()-INTERVAL '1 day')`, [companyId,teacher.userId])
  for (const visibility of ['PROJECT','PRIVATE']) await pool.query(`INSERT INTO knowledge_sources
    (id,company_id,project_id,kind,title,visibility_scope,owner_user_id,created_by_user_id,created_via)
    VALUES ($1,$2,'forum-project','text',$1,$3,$4,$4,'USER')`, [`source-${visibility}`,companyId,visibility,student.userId])
  await pool.query(`INSERT INTO uploaded_files(storage_key,company_id,owner_user_id,company_period_id)
    SELECT 'attachments/forum-school/student.txt',$1,$2,period_id FROM company_memberships
    WHERE company_id=$1 AND user_id=$2 AND ended_at IS NULL`, [companyId,student.userId])
  await pool.query(`INSERT INTO participants(id,company_id,kind,name,role,initial,avatar_bg,status,capabilities)
    VALUES('evidence-agent',$1,'agent','Evidence Agent','assistant','E','#abcdef','avail','["learning"]')`,[companyId])
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES('evidence-room',$1,'forum-project','group','Learning evidence',$2::jsonb)`,[companyId,JSON.stringify([student.userId,'evidence-agent'])])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES('evidence-room',$1,$2::jsonb)`,[companyId,JSON.stringify({channelType:2,members:[student.userId,'evidence-agent']})])
  const {createNativeMessage}=await import('../im/message-types.js')
  for(const [index,role] of (['user','assistant'] as const).entries()) evidenceIm.messages.push({channelId:'evidence-room',channelType:2,messageId:`evidence-${role}`,clientMsgNo:`evidence-${role}`,messageSeq:index+1,fromUid:role==='user'?student.userId:'evidence-agent',timestamp:Date.now()/1000,payload:createNativeMessage({id:`evidence-${role}`,role,content:[{type:'text',text:role==='user'?'My explanation: two congruent triangles form a rectangle.':'Explain how you would apply that to a new triangle.'}]})})
})
afterEach(async()=>{await evidenceIm.close()})
after(() => teardownAll())
const course = 'course-forum-project'

const post = { kind: 'share' as const, title: 'My project', body: 'Student work', tags: ['geometry'], links: [], attachments: [] }

async function submit(input: { companyId: string; projectId: string; activityId: string; learnerId: string; answer: string; idempotencyKey: string;
  links?: string[]; attachments?: { key: string; name: string }[]; source?: 'AGENT_RELAY' | 'AGENT_GENERATED'; agentId?: string; agentWorkId?: string }) {
  return forum.submit({ companyId: input.companyId, userId: input.learnerId }, `course-${input.projectId}`, input.activityId,
    { conversationReferences, answer: input.answer, idempotencyKey: input.idempotencyKey, links: input.links, attachments: input.attachments },
    input.source ? { source: input.source, id: input.agentId!, workId: input.agentWorkId! } : undefined)
}

test('[integration] forum discovers assignments without aggregating sources, isolating every content operation', async () => {
  const created = await forum.createPost(student, course, post)
  assert.equal(created.authorId, student.userId)
  const feed = await forum.list(student, course, {})
  assert.deepEqual(new Set(feed.items.map(item => item.id)), new Set([created.id,'forum-homework']))
  assert.equal((await forum.list(student, course, { search: 'PRIVATE' })).items.length, 0)
  assert.equal((await forum.list(student, course, { search: 'source-PROJECT' })).items.length, 0)
  for (const kind of ['case', 'official', 'featured', 'resource']) {
    await assert.rejects(forum.createPost(teacher, course, { ...post, kind } as never))
    await assert.rejects(forum.list(teacher, course, { kind } as never))
  }
  await assert.rejects(forum.updateFlags(teacher, course, 'post', created.id, { featured: true } as never))
  await assert.rejects(forum.updateFlags(teacher, course, 'post', created.id, { official: true } as never))
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
  await assert.rejects(forum.updateFlags(student, course, 'post', created.id, { pinned: true }))
  const featured = await forum.updateFlags(teacher, course, 'post', created.id, { pinned: true })
  assert.equal(featured.pinned, true)
  assert.equal(featured.authorId, student.userId)
  await assert.rejects(forum.updateFlags(teacher, course, 'post', 'source-PRIVATE', { pinned: true }))
})

test('[integration] submission versions preserve links, private files, late status and idempotency; closure blocks browser and Agent', async () => {
  const input = { companyId, projectId: 'forum-project', activityId: 'forum-homework', learnerId: student.userId,
    answer: 'My answer', links: ['https://example.com/student-work'], attachments: [{ key: 'attachments/forum-school/student.txt', name: 'student.txt' }], idempotencyKey: 'forum-original-v1' }
  const first = await submit(input)
  assert.deepEqual(await submit(input), first)
  await submit({ ...input, answer: 'Revised answer', idempotencyKey: 'forum-original-v2' })
  // Wall clocks may move backward, timestamps may tie, and retried writes must
  // not consume a visible version. Acceptance order still defines the latest.
  await pool.query(`UPDATE course_forum_submissions SET submitted_at=NOW()+INTERVAL '1 day' WHERE id=$1`, [first.attemptId])
  const history = await forum.submissions(student, course, 'forum-homework', 0)
  assert.equal(history.items.length, 2)
  assert.equal(history.items[0]?.answer, 'Revised answer')
  assert.equal(history.items[1]?.answer, 'My answer')
  assert.deepEqual(history.items.map(item => [item.answer, item.version]), [['Revised answer', 2], ['My answer', 1]])
  await pool.query(`UPDATE course_forum_submissions SET submitted_at='2026-01-01T00:00:00Z' WHERE assignment_id='forum-homework'`)
  assert.deepEqual((await forum.submissions(student, course, 'forum-homework', 0)).items.map(item => [item.answer, item.version]),
    [['Revised answer', 2], ['My answer', 1]])
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
  await assert.rejects(submit({ ...input, learnerId: peer.userId, idempotencyKey: 'stolen-file' }))
  await pool.query(`UPDATE course_forum_posts SET status='CLOSED' WHERE id='forum-homework'`)
  await assert.rejects(submit({ ...input, idempotencyKey: 'after-close-web' }))
  await assert.rejects(submit({ ...input, idempotencyKey: 'after-close-agent',
    source: 'AGENT_GENERATED', agentId: 'forum-agent', agentWorkId: 'forum-work' }))
  await pool.query(`UPDATE project_memberships SET status='SUSPENDED' WHERE company_id=$1 AND project_id='forum-project' AND user_id=$2`, [companyId,student.userId])
  assert.equal(await canReadLearningFile(pool, input.attachments[0].key, student.userId), false)
})

// Comment attachments must persist, require the uploader's grant, and follow the
// current target visibility rather than leaving an uploader or old-course bypass.
test('[integration] comment files follow course membership and current source visibility', async () => {
  const referenced = await forum.createPost(student, course, { ...post, sourceId: 'source-PROJECT' })
  const attachments = [{ key: 'attachments/forum-school/student.txt', name: 'student.txt' }]
  const input = { body: '', links: ['https://example.com/discussion'], attachments }
  await assert.rejects(forum.comment(peer, course, 'post', referenced.id, input))
  await assert.rejects(forum.comment(outsider, course, 'post', referenced.id, input))
  await forum.comment(student, course, 'post', referenced.id, input)
  const comment = (await forum.comments(peer, course, 'post', referenced.id, 0)).items[0]
  assert.deepEqual({ body: comment.body, links: comment.links, attachments: comment.attachments }, input)
  assert.equal(await canReadLearningFile(pool, attachments[0].key, peer.userId), true)
  assert.equal(await canReadLearningFile(pool, attachments[0].key, outsider.userId), false)
  await pool.query(`UPDATE knowledge_sources SET visibility_scope='PRIVATE' WHERE id='source-PROJECT'`)
  await assert.rejects(forum.comments(student, course, 'post', referenced.id, 0))
  assert.equal(await canReadLearningFile(pool, attachments[0].key, student.userId), false)
  assert.equal(await canReadLearningFile(pool, attachments[0].key, teacher.userId), false)
})

test('[integration] Agent provenance cannot become independent human evidence or change the submitting student', async () => {
  const result = await submit({ companyId,projectId: 'forum-project',activityId: 'forum-homework',learnerId: student.userId,
    answer: 'Agent generated answer', idempotencyKey: 'forum-agent-generated', source: 'AGENT_GENERATED', agentId: 'forum-agent', agentWorkId: 'forum-work' })
  const { rows } = await pool.query(`SELECT learner_id,source,assistance,submitted_by_agent,agent_work_id
    FROM course_forum_submissions WHERE id=$1`, [result.attemptId])
  assert.deepEqual(rows, [{ learner_id: student.userId,source: 'AGENT_GENERATED',assistance: 'GUIDED',submitted_by_agent: 'forum-agent',agent_work_id: 'forum-work' }])
  await assert.rejects(pool.query(`UPDATE course_forum_submissions SET assistance='NONE' WHERE id=$1`, [result.attemptId]))
  await assert.rejects(submit({ companyId,projectId: 'forum-other',activityId: 'forum-homework',learnerId: student.userId,
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
    const original = 'My independently written answer. https://example.com/original'
    im.messages.push({ channelId: 'forum-room',channelType: 2,messageId: 'forum-message',clientMsgNo: 'forum-message',messageSeq: 1,
      fromUid: student.userId,timestamp: Date.now()/1000,payload: createNativeMessage({ id: 'forum-message',role: 'user',createdAt: new Date().toISOString(),content: [{ type: 'text',text: original }] }) })
    im.messages.push({channelId:'forum-room',channelType:2,messageId:'forum-reply',clientMsgNo:'forum-reply',messageSeq:2,fromUid:'forum-agent',timestamp:Date.now()/1000,payload:createNativeMessage({id:'forum-reply',role:'assistant',content:[{type:'text',text:'Explain your reasoning in a new example.'}]})})
    const tool = learningTools.find(tool => tool.action === 'learning.submit_assignment')!
    assert.ok(tool)
    const invoke = async (input: object, audience = [student.userId,'forum-agent']) => {
      const data = tool.parse({...input,conversationReferences:[{channelId:'forum-room',messageIds:['forum-message','forum-reply']}]})
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
    await invoke({ assignmentId: 'forum-homework',source: 'AGENT_RELAY',answer: original,messageIds: ['forum-message'],idempotencyKey: 'forum-native-relay' })
    const history = await forum.submissions(student,course,'forum-homework',0)
    assert.equal(history.items[0]?.answer,original)
    assert.equal(history.items[0]?.source,'AGENT_RELAY')
    assert.equal(history.items[0]?.agentId,'forum-agent')
    await invoke({ assignmentId: 'forum-homework',source: 'AGENT_GENERATED',answer: 'Generated draft',idempotencyKey: 'forum-native-generated' })
    await assert.rejects(invoke({ assignmentId: 'forum-homework',source: 'AGENT_RELAY',answer: 'Forged original',messageIds: ['forum-message'],idempotencyKey: 'forum-forged-relay' }))
    await assert.rejects(invoke({ assignmentId: 'forum-homework',source: 'AGENT_RELAY',answer: original,messageIds: ['non-human-message'],idempotencyKey: 'forum-forged-message' }))
    await assert.rejects(invoke({ assignmentId: 'forum-homework',source: 'AGENT_GENERATED',answer: 'Private',idempotencyKey: 'forum-peer-audience' },[student.userId,peer.userId,'forum-agent']))
    await pool.query(`UPDATE course_forum_posts SET status='CLOSED' WHERE id='forum-homework'`)
    await assert.rejects(invoke({ assignmentId: 'forum-homework',source: 'AGENT_GENERATED',answer: 'Too late',idempotencyKey: 'forum-native-closed' }))
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
    const submit = `/courses/${course}/forum/post/forum-homework/submit`
    assert.equal((await call(student, submit, 'POST', { answer: 'Cannot forge Agent provenance',idempotencyKey: 'forged-http-source',source: 'AGENT_GENERATED' })).status,400)
    assert.equal((await call(student, submit, 'POST', { conversationReferences, answer: 'Browser submission',links: ['https://example.com/browser'],attachments: [{ key,name: 'student.txt' }],idempotencyKey: 'http-submission-1' })).status,201)
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
    assert.equal((await call(student,target,'PATCH',{ pinned: true })).status,403)
    assert.equal((await call(teacher,target,'PATCH',{ pinned: true })).status,200)
    const commentKey = 'attachments/forum-school/comment.txt'
    await pool.query(`INSERT INTO uploaded_files(storage_key,company_id,owner_user_id,company_period_id)
      SELECT $1,$2,$3,period_id FROM company_memberships WHERE company_id=$2 AND user_id=$3 AND ended_at IS NULL`, [commentKey,companyId,student.userId])
    await storage.put(commentKey, Buffer.from('Course discussion file'), 'text/plain')
    const commentInput = { body: '', links: [], attachments: [{ key: commentKey,name: 'comment.txt' }] }
    assert.equal((await call(peer,`${target}/comments`,'POST',commentInput)).status,403)
    assert.equal((await call(student,`${target}/comments`,'POST',commentInput)).status,201)
    const comments = await (await call(peer,`${target}/comments`)).json() as { items: { attachments: unknown }[] }
    assert.deepEqual(comments.items[0].attachments,commentInput.attachments)
    assert.equal((await call(peer,`/files?key=${encodeURIComponent(commentKey)}`)).status,200)
    assert.equal((await call(outsider,`/files?key=${encodeURIComponent(commentKey)}`)).status,404)
    assert.equal((await call(student,`/courses/${course}/activities`,'POST',{ title: 'Unauthorized assignment',instructions: 'No',type: 'PRACTICE' })).status,404)
    await call(teacher,`/courses/${course}/forum/post/forum-homework/close`,'POST')
    assert.equal((await call(student,submit,'POST',{ conversationReferences, answer: 'After close',idempotencyKey: 'after-http-close' })).status,409)
  } finally {
    for (const server of servers) await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('[integration] inline edits, comments, reactions, archive and filters obey author and course grants', async () => {
  const item = await forum.createPost(student,course,{...post,body:'Original https://example.test #geometry'})
  await assert.rejects(forum.updatePost(peer,course,item.id,{...post,body:'Forged edit'}))
  await forum.updatePost(student,course,item.id,{...post,body:'Edited explanation'})
  assert.equal((await forum.detail(peer,course,'post',item.id)).body,'Edited explanation')
  await forum.react(peer,course,item.id,{emoji:'👍',active:true})
  await forum.react(peer,course,item.id,{emoji:'👍',active:true})
  assert.deepEqual((await forum.detail(student,course,'post',item.id)).reactions,[{emoji:'👍',userIds:[peer.userId]}])
  await assert.rejects(forum.react(outsider,course,item.id,{emoji:'👍',active:true}))
  const comment = await forum.comment(student,course,'post',item.id,'Original comment')
  await assert.rejects(forum.editComment(peer,course,item.id,comment.id,{body:'Forged'}))
  await forum.editComment(student,course,item.id,comment.id,{body:'Edited comment'})
  assert.equal((await forum.comments(peer,course,'post',item.id,0)).items[0].body,'Edited comment')
  await forum.editComment(teacher,course,item.id,comment.id,null)
  assert.equal((await forum.comments(peer,course,'post',item.id,0)).items.length,0)
  await forum.updateFlags(student,course,'post',item.id,{archived:true})
  assert.equal((await forum.list(student,course,{})).items.some(row=>row.id===item.id),false)
  assert.equal((await forum.list(student,course,{archived:'true'})).items[0].id,item.id)
  await assert.rejects(forum.react(student,course,item.id,{emoji:'👍',active:true}))
  await forum.updateFlags(student,course,'post',item.id,{archived:false})
  assert.equal((await forum.list(student,course,{from:'2099-01-01T00:00:00Z'})).items.length,0)
  await assert.rejects(forum.deletePost(peer,course,item.id))
  await forum.deletePost(student,course,item.id)
  await assert.rejects(forum.detail(student,course,'post',item.id))
  await assert.rejects(forum.createPost(student,course,{...post,kind:'assignment'}))
})

test('[integration] concurrent retries preserve one version and teacher feedback survives closure and revocation', async () => {
  const input={conversationReferences,answer:'One accepted submission',idempotencyKey:'concurrent-key'}
  const results=await Promise.all(Array.from({length:8},()=>forum.submit(student,course,'forum-homework',input)))
  assert.equal(new Set(results.map(row=>row.attemptId)).size,1)
  assert.equal((await forum.submissions(student,course,'forum-homework',0)).items.length,1)
  await assert.rejects(forum.submit(student,course,'forum-homework',{...input,answer:'Different content'}))
  await assert.rejects(forum.feedback(peer,course,'forum-homework',results[0].attemptId,{body:'Forged teacher feedback'}))
  await forum.feedback(teacher,course,'forum-homework',results[0].attemptId,{body:'Verified feedback'})
  await assert.rejects(forum.deletePost(teacher,course,'forum-homework'))
  await forum.closeAssignment(teacher,course,'forum-homework')
  assert.equal((await forum.submissions(student,course,'forum-homework',0)).items[0].feedback[0].body,'Verified feedback')
  assert.equal((await forum.submissions(peer,course,'forum-homework',0)).items.length,0)
  await pool.query("UPDATE project_memberships SET status='SUSPENDED' WHERE company_id=$1 AND project_id='forum-project' AND user_id=$2",[companyId,student.userId])
  await assert.rejects(forum.submissions(student,course,'forum-homework',0))
})

// Issue 146 failures were enumerated in docs/issue-146-validation.md before implementation.
test('[integration] references are mandatory, private and frozen; each accepted version has a durable assessment',async()=>{
  const input={answer:'My own explanation',idempotencyKey:'evidence-contract',conversationReferences}
  for(const refs of [[],[{channelId:'evidence-room',messageIds:['evidence-user','invented']}],[{channelId:'evidence-room',messageIds:['evidence-assistant','evidence-assistant']}]])
    await assert.rejects(forum.submit(student,course,'forum-homework',{...input,conversationReferences:refs}))
  await assert.rejects(forum.submit(peer,course,'forum-homework',input))
  await assert.rejects(forum.conversation(teacher,course,'evidence-room'))
  const accepted=await forum.submit(student,course,'forum-homework',input)
  await forum.submit(student,course,'forum-homework',input)
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM learning_effects WHERE kind='forum.assess' AND effect_key=$1",[accepted.attemptId])).rows[0].n,1)
  const frozen=(await forum.submissions(teacher,course,'forum-homework',0)).items[0]
  assert.equal(frozen.assessment.status,'PENDING')
  assert.equal(frozen.conversationReferences[0].messages.length,2)
  evidenceIm.messages.push({...evidenceIm.messages[0],messageId:'later',clientMsgNo:'later',messageSeq:3})
  assert.equal((await forum.submissions(teacher,course,'forum-homework',0)).items[0].conversationReferences[0].messages.length,2)
  await forum.submit(student,course,'forum-homework',{...input,answer:'New answer',idempotencyKey:'second-version'})
  const students=await forum.students(teacher,course,'forum-homework',0,student.userId)
  assert.equal(students.items.length,1);assert.equal(students.items[0].version,2)
  assert.equal('answer' in students.items[0],false)
  assert.equal((await forum.students(teacher,course,'forum-homework',0,'no matching name')).items.length,0)
  await assert.rejects(forum.students(peer,course,'forum-homework',0,''))
  await pool.query("UPDATE project_memberships SET status='SUSPENDED' WHERE company_id=$1 AND user_id=$2",[companyId,teacher.userId])
  await assert.rejects(forum.submissions(teacher,course,'forum-homework',0))
})

test('[integration] assessment retries fail honestly and persist only grounded student evidence',async()=>{
  const {__setLlmClientOverrideForTesting}=await import('../llm.js')
  const {runLearningEffects}=await import('../modules/learning/worker.js')
  let result:unknown={mastery:'MASTERED',reason:'Invented assessment',evidence:[{reference:0,messageId:'evidence-assistant',excerpt:'Explain'}]}
  __setLlmClientOverrideForTesting(()=>({chat:{completions:{create:async()=>({id:'forum-fixture-model',model:'integration-test',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(result)}}],usage:{prompt_tokens:40,completion_tokens:20,total_tokens:60}})}}}) as unknown as import('openai').default)
  try {
    const accepted=await forum.submit(student,course,'forum-homework',{answer:'Two triangles form a rectangle',idempotencyKey:'assessment-retry',conversationReferences})
    await runLearningEffects()
    let version=(await forum.submissions(teacher,course,'forum-homework',0)).items[0]
    assert.equal(version.assessment.status,'FAILED')
    assert.equal(version.assessment.mastery,undefined)
    result={mastery:'DEVELOPING',reason:'能解释拼接，但还需要独立完成新的例题。',evidence:[{reference:0,messageId:'evidence-user',excerpt:'two congruent triangles form a rectangle'}]}
    await pool.query("UPDATE learning_effects SET available_at=NOW() WHERE kind='forum.assess' AND effect_key=$1",[accepted.attemptId])
    await runLearningEffects()
    version=(await forum.submissions(teacher,course,'forum-homework',0)).items[0]
    assert.equal(version.assessment.status,'READY');assert.equal(version.assessment.mastery,'DEVELOPING')
    assert.equal(version.assessment.evidence[0].messageId,'evidence-user')
    assert.equal((await pool.query("SELECT status FROM learning_effects WHERE kind='forum.assess' AND effect_key=$1",[accepted.attemptId])).rows[0].status,'completed')
  } finally {__setLlmClientOverrideForTesting(null)}
})
