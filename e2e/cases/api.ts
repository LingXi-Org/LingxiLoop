import assert from 'node:assert/strict'
import express from 'express'
import { pool } from '../../server/src/db/pool'
import { ensureSchemaOnce, resetAllTables, seedUserMembership, buildApiTestApp } from '../../server/src/__integration__/_helpers'
import { ensureEducationPlan } from '../../server/src/modules/entitlements/public'
import { insertCourse } from '../../server/src/modules/learning/courses-repository'
import { installRecordingWukong } from '../../server/src/__integration__/_recording-wukong'

assert.equal(new URL(process.env.DATABASE_URL!).pathname, process.env.CASES_AUTHORING_COVER_FIXTURE === '1'
  ? '/lingxiloop_cases_449_browser_test' : '/lingxiloop_cases_browser_test')
assert.equal(process.env.NODE_ENV, 'test')
await ensureSchemaOnce()
await resetAllTables()
await ensureEducationPlan(pool)
for (const company of ['cases-school', 'cases-other-school']) {
  await pool.query("INSERT INTO companies(id,name,slug,type,status,plan_id) VALUES ($1,$1,$1,'EDUCATION','ACTIVE','plan-education')", [company])
}
for (const [name, role, company] of [['teacher','TEACHER','cases-school'],['teacher2','TEACHER','cases-school'],['student','STUDENT','cases-school'],['outsider','TEACHER','cases-other-school']] as const) {
  await seedUserMembership(`cases-${name}`, company, { role, displayName: `Cases ${name}` })
  await pool.query('UPDATE users SET email_verified_at=NOW() WHERE id=$1', [`cases-${name}`])
}
for (const [projectId,userId,companyId] of [['cases-classroom','cases-teacher','cases-school'],['cases-other-course','cases-teacher2','cases-school'],['cases-outsider-course','cases-outsider','cases-other-school']]) {
  await insertCourse(pool, { companyId,userId,projectId,courseId:`${projectId}-course`,roomId:`${projectId}-room`,kind:'TEACHING',planId:null,input:{name:projectId,description:'Isolated browser acceptance course',color:'#5266d6'} })
}
for (const project of ['cases-classroom','cases-other-course']) await pool.query("INSERT INTO project_memberships(company_id,project_id,user_id,role) VALUES ('cases-school',$1,'cases-student','STUDENT')",[project])
await pool.query("INSERT INTO knowledge_sources(id,company_id,project_id,kind,title,visibility_scope,owner_user_id,created_by_user_id,created_via) VALUES ('cases-independent-resource','cases-school','cases-classroom','text','独立资料保持可用','PROJECT','cases-teacher','cases-teacher','USER')")
await installRecordingWukong()
const app=express()
if (process.env.CASES_AUTHORING_COVER_FIXTURE === '1') {
  await (await import('./authoring-cover-fixture')).installAuthoringCoverFixture(app)
}
let listMode: 'pass'|'hold'|'fail'='pass'
let releaseList:(()=>void)|undefined
app.post('/api/fixture-case-list/:mode',(req,res)=>{
  if(!['pass','hold','fail'].includes(req.params.mode)){res.sendStatus(400);return}
  listMode=req.params.mode as typeof listMode
  if(listMode==='pass'){releaseList?.();releaseList=undefined}
  res.sendStatus(200)
})
app.use((req,res,next)=>{
  if(req.method==='GET'&&req.path==='/api/cases'){
    if(listMode==='hold'){releaseList=next;return}
    if(listMode==='fail'){listMode='pass';res.status(503).json({error:'Recorded list failure'});return}
  }
  next()
})
app.get('/api/fixture-role/:role',(req,res)=>{
  if(!['teacher','teacher2','student','outsider'].includes(req.params.role)){res.sendStatus(400);return}
  res.setHeader('Set-Cookie',`cases-role=${req.params.role}; Path=/; SameSite=Strict; HttpOnly`)
  res.json({role:req.params.role})
})
const actors=new Map(await Promise.all(['teacher','teacher2','student','outsider'].map(async role=>[role,await buildApiTestApp(`cases-${role}`)] as const)))
app.use((req,res,next)=>{
  const role=/cases-role=(teacher2|teacher|student|outsider)/.exec(req.headers.cookie??'')?.[1]??'teacher'
  if(req.url==='/api/session')req.url='/api/auth/me'
  actors.get(role)!(req,res,next)
})
app.listen(53107,'127.0.0.1',()=>console.log('[cases] fixture ready on 53107'))
