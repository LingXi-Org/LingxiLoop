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
await installRecordingWukong()
// Synthetic auth and in-memory objects are confined to this loopback-only test server.
const app = express()
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
