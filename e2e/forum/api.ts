import assert from 'node:assert/strict'
import express from 'express'
import { pool } from '../../server/src/db/pool'
import { ensureSchemaOnce, resetAllTables, seedUserMembership, buildApiTestApp } from '../../server/src/__integration__/_helpers'
import { ensureEducationPlan } from '../../server/src/modules/entitlements/public'
import { insertCourse } from '../../server/src/modules/learning/courses-repository'
import { installRecordingWukong } from '../../server/src/__integration__/_recording-wukong'
import { storage } from '../../server/src/storage'

assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/lingxiloop_forum_test')
assert.equal(process.env.NODE_ENV, 'test')
// Enable source HTTP operations; no external ingestion worker runs in this fixture.
process.env.OPEN_NOTEBOOK_ENABLED = 'true'
await ensureSchemaOnce()
await resetAllTables()
await ensureEducationPlan(pool)
await pool.query("INSERT INTO companies(id,name,slug,type,status,plan_id) VALUES ('e2e-school','Forum School','e2e-school','EDUCATION','ACTIVE','plan-education')")
for (const [name, role] of [['teacher','TEACHER'],['student','STUDENT'],['peer','STUDENT']] as const) {
  await seedUserMembership(`forum-${name}`, 'e2e-school', { role, displayName: `Forum ${name}` })
  await pool.query('UPDATE users SET email_verified_at=NOW() WHERE id=$1', [`forum-${name}`])
}
await insertCourse(pool, { companyId: 'e2e-school',userId: 'forum-teacher',projectId: 'e2e-classroom',courseId: 'e2e-course',roomId: 'forum-room',kind: 'TEACHING',planId: null,
  input: { name: 'E2E Classroom',description: 'Disposable forum classroom',color: '#5266d6' } })
await insertCourse(pool, { companyId: 'e2e-school',userId: 'forum-teacher',projectId: 'forum-other',courseId: 'forum-other-course',roomId: 'forum-other-room',kind: 'TEACHING',planId: null,
  input: { name: 'Other Forum Course',description: 'Isolated other course',color: '#5266d6' } })
for (const name of ['student','peer']) await pool.query("INSERT INTO project_memberships(company_id,project_id,user_id,role) VALUES ('e2e-school','e2e-classroom',$1,'STUDENT')", [`forum-${name}`])
await pool.query("INSERT INTO course_forum_posts(id,company_id,project_id,title,body,kind,status,author_user_id,created_at,due_at) VALUES ('forum-homework','e2e-school','e2e-classroom','Forum homework','Explain your result','assignment','PUBLISHED','forum-teacher',NOW()-INTERVAL '2 days',NOW()-INTERVAL '1 day')")
await pool.query("INSERT INTO knowledge_sources(id,company_id,project_id,kind,title,visibility_scope,owner_user_id,created_by_user_id,created_via) VALUES ('forum-resource','e2e-school','e2e-classroom','text','Historical public resource','PROJECT','forum-teacher','forum-teacher','USER')")
const im=await installRecordingWukong()
const {createNativeMessage}=await import('../../server/src/im/message-types')
await pool.query(`INSERT INTO participants(id,company_id,kind,name,role,initial,avatar_bg,status,capabilities) VALUES('forum-evidence-agent','e2e-school','agent','学习助手','assistant','E','#abcdef','avail','["learning"]')`)
await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES('forum-evidence-room','e2e-school','e2e-classroom','group','我的作业学习对话','["forum-student","forum-evidence-agent"]')`)
await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES('forum-evidence-room','e2e-school','{"channelType":2,"members":["forum-student","forum-evidence-agent"]}')`)
for(const [index,role] of (['user','assistant'] as const).entries())im.messages.push({channelId:'forum-evidence-room',channelType:2,messageId:`forum-evidence-${role}`,clientMsgNo:`forum-evidence-${role}`,messageSeq:index+1,fromUid:role==='user'?'forum-student':'forum-evidence-agent',timestamp:Date.now()/1000,payload:createNativeMessage({id:`forum-evidence-${role}`,role,content:[{type:'text',text:role==='user'?'我用两个全等三角形拼成长方形，所以面积是底乘高的一半。':'请用新的底和高说明你的计算过程。'}]})})
await pool.query(`INSERT INTO course_forum_posts(id,company_id,project_id,title,body,kind,status,author_user_id) VALUES('issue146-assignment','e2e-school','e2e-classroom','Memos 详情与作答验收','说明三角形面积公式，并引用自己的学习过程。','assignment','PUBLISHED','forum-teacher')`)
for(let i=0;i<55;i++){
  const id=`forum-search-${String(i).padStart(2,'0')}`
  await seedUserMembership(id,'e2e-school',{role:'STUDENT',displayName:i===0?'跨页学生':i<3?'同名学生':`参考学生 ${i}`})
  await pool.query(`INSERT INTO project_memberships(company_id,project_id,user_id,role) VALUES('e2e-school','e2e-classroom',$1,'STUDENT')`,[id])
  await pool.query(`INSERT INTO course_forum_submissions(id,company_id,project_id,assignment_id,learner_id,answer,source) VALUES($1,'e2e-school','e2e-classroom','issue146-assignment',$2,$3,'STUDENT_ORIGINAL')`,[`historical-${i}`,id,'历史长作答。'.repeat(1000)])
}
// New homework rendering uses the same real API, with explicitly synthetic historical report data.
await pool.query(`INSERT INTO homeworks(id,company_id,project_id,course_id,created_by,status,title,instructions,criteria,visible_hash,published_at)
  VALUES('issue146-homework','e2e-school','e2e-classroom','e2e-course','forum-teacher','PUBLISHED','Memos 学习报告详情','说明三角形面积公式。','["独立说明面积计算"]','fixture',NOW())`)
const fixtureAnswer={text:'新作业提交正文，仅点击学生后显示。',links:[],attachments:[]}
const fixtureReport={id:'fixture-report',answerRevision:1,verification:'unverified',criteria:[{criterion:'独立说明面积计算',met:false,independent:false,feedback:'证据尚未核实'}],completion:'合成验收报告，未作掌握结论。',assistance:'尚待核实',independence:'尚待核实',weaknesses:['需要独立说明'],evidence:[],manualReview:null}
const fixtureReferences=[{channelId:'forum-evidence-room',messageIds:['forum-evidence-user','forum-evidence-assistant'],title:'我的作业学习对话',capturedAt:new Date().toISOString(),messages:im.messages.map(m=>({id:m.clientMsgNo,role:m.payload.role,text:m.payload.content.filter(p=>p.type==='text').map(p=>'text' in p?p.text:'').join(''),sequence:m.messageSeq}))}]
await pool.query(`INSERT INTO homework_learner_state(company_id,project_id,homework_id,learner_id,latest_submission_id) VALUES('e2e-school','e2e-classroom','issue146-homework','forum-student','fixture-homework-submission')`)
await pool.query(`INSERT INTO homework_submissions(id,company_id,project_id,homework_id,learner_id,version,idempotency_key,content_hash,answer,report,answer_revision,return_epoch,late,conversation_references)
  VALUES('fixture-homework-submission','e2e-school','e2e-classroom','issue146-homework','forum-student',1,'fixture-key','fixture',$1::jsonb,$2::jsonb,1,0,false,$3::jsonb)`,[JSON.stringify(fixtureAnswer),JSON.stringify(fixtureReport),JSON.stringify(fixtureReferences)])
// Synthetic auth and in-memory objects are confined to this loopback-only test server.
const app = express()
// Mirror the public avatar prefix only; private attachment reads still use the
// ordinary authorized file API. The object bytes live in integration storage.
const originalPublicUrl = storage.publicUrl.bind(storage)
storage.publicUrl = async key => key.startsWith('avatars/') ? `/api/fixture-avatar?key=${encodeURIComponent(key)}` : originalPublicUrl(key)
const originalPut = storage.put.bind(storage)
storage.put = async (key,body,mime) => {
  const url=await originalPut(key,body,mime)
  return key.startsWith('avatars/') ? storage.publicUrl(key) : url
}
app.get('/api/fixture-avatar', async (req,res) => {
  const key=String(req.query.key)
  if (!key.startsWith('avatars/e2e-school/')) { res.sendStatus(404); return }
  try {
    const meta=await storage.statObject(key)
    res.type(meta.contentType ?? 'application/octet-stream').send(await storage.readObjectBounded(key,5*1024*1024))
  } catch { res.sendStatus(404) }
})
app.get('/api/fixture-role/:role', (req,res) => {
  if (!['teacher','student','peer'].includes(req.params.role)) { res.sendStatus(400); return }
  res.setHeader('Set-Cookie', `forum-role=${req.params.role}; Path=/; SameSite=Strict; HttpOnly`)
  res.json({ role: req.params.role })
})
let failSourceUpload = false
app.post('/api/fixture-fail-source-upload', (_req, res) => { failSourceUpload = true; res.sendStatus(200) })
app.use((req, res, next) => {
  if (failSourceUpload && req.method === 'POST' && req.path.endsWith('/sources/upload/presign')) {
    failSourceUpload = false; res.status(503).json({ error: 'Temporary upload failure' }); return
  }
  next()
})
let failPost=false
app.post('/api/fixture-fail-next-post',(_req,res)=>{failPost=true;res.sendStatus(200)})
app.use((req,res,next)=>{if(failPost&&req.method==='POST'&&/^\/api\/courses\/[^/]+\/forum$/.test(req.path)){failPost=false;res.status(503).json({error:'Temporary fixture failure'});return}next()})
app.put('/api/fixture-object', express.raw({ type: '*/*',limit: '1mb' }), async (req,res) => {
  await storage.put(String(req.query.key),req.body,req.headers['content-type'] ?? 'text/plain')
  res.sendStatus(200)
})
const actors = new Map(await Promise.all(['teacher','student','peer'].map(async role => [role,await buildApiTestApp(`forum-${role}`)] as const)))
app.use((req,res,next) => {
  const role = /forum-role=(teacher|student|peer)/.exec(req.headers.cookie ?? '')?.[1] ?? 'teacher'
  if (req.url === '/api/session') req.url = '/api/auth/me'
  if (req.path.endsWith('/sources/upload/presign')) {
    const json = res.json.bind(res)
    res.json = value => json(value?.uploadUrl ? { ...value, uploadUrl: `/api/fixture-object?key=${encodeURIComponent(decodeURIComponent(new URL(value.uploadUrl).pathname.slice('/upload/'.length)))}` } : value)
  }
  if (req.path === '/api/uploads/presign') {
    const json = res.json.bind(res)
    res.json = value => json(value?.key ? { ...value, uploadUrl: `/api/fixture-object?key=${encodeURIComponent(value.key)}` } : value)
  }
  actors.get(role)!(req,res,next)
})
app.listen(53097, '127.0.0.1', () => console.log('[forum] browser fixture ready on 53097'))
