import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { pool, closeDatabasePools } from '../db/pool.js'
import { assertMigrationsCurrent, migrateDatabase } from '../db/migrate.js'
import { withTransaction } from '../db/transaction.js'
import { hashInvitationToken } from '../http/invitation-token.js'
import { acceptEducationInvitation } from '../modules/companies/admission.js'
import { CompanyApplication } from '../modules/companies/application.js'
import { removeMemberState } from '../modules/companies/repository.js'
import { EducationApplication } from '../modules/education/application.js'
import { auditInTransaction } from '../modules/identity/public.js'
import { insertWsTicket, consumeWsTicketByHash } from '../modules/identity/session-repository.js'
import { insertCourse, addInstitutionalCourseMember } from '../modules/learning/courses-repository.js'
import { createPermissionService, listActiveActorProjectScopes } from '../modules/access/public.js'
import { canPersistHumanUpdate, humanWriteAuthorization } from '../modules/documents/collaboration-repository.js'
import { changeUserLifecycle } from '../modules/platform-operations/user-lifecycle.js'
import { listCalendarReminderRecipients } from '../modules/calendar/repository.js'
import { findLearningDashboardLearner } from '../modules/learning/teacher-reporting-repository.js'
import { listProjects } from '../modules/knowledge/repository.js'

const transaction = <T>(work: Parameters<typeof withTransaction<T>>[1]) => withTransaction(pool, work)
const education = new EducationApplication({ transaction, auditInTransaction, invitationBaseUrl: 'https://loop.test' })
const companies = new CompanyApplication(pool, { transaction, auditInTransaction, syncChannel: async () => {}, disconnectUser: async () => {},
  generateInvitationToken: randomUUID, hashInvitationToken, invitationBaseUrl: 'https://loop.test', sendInvitationEmail: async () => {} })
const audit = { ip: null, userAgent: null }
let companyId: string, otherId: string

async function user(id: string) {
  await pool.query(`INSERT INTO users(id,email,display_name,email_verified_at) VALUES($1,$2,$1,NOW())`, [id,`${id}@test.local`])
}
async function createCompany(slug: string) {
  return education.createCompany('operator', { name: slug, slug, initialAdminEmail: `${slug}-admin@test.local`, planId: 'plan-education', idempotencyKey: slug,
    contract: { startsAt: new Date(Date.now()-86400000).toISOString(), endsAt: new Date(Date.now()+86400000*30).toISOString(), seatLimit: 100, config: {} } })
}
async function teacherInvitation(id: string, isAdmin = false, targetCompany = companyId) {
  const token = randomUUID()
  await pool.query(`INSERT INTO company_invitations(token_hash,company_id,invited_by,email,is_admin,max_uses,expires_at)
    VALUES($1,$2,'operator',$3,$4,1,NOW()+INTERVAL '1 day')`, [hashInvitationToken(token),targetCompany,`${id}@test.local`,isAdmin])
  return token
}
async function course(id: string) {
  await transaction((db) => insertCourse(db, { companyId, userId: 'school-admin', projectId: id, courseId: `course-${id}`, roomId: `room-${id}`,
    kind: 'TEACHING', planId: null, input: { name: id, description: '', color: '#123456' } }))
}
async function studentInvitation(projectId: string, maxUses = 100) {
  const token = randomUUID()
  await pool.query(`INSERT INTO project_invitations(token_hash,company_id,project_id,invited_by,max_uses,expires_at)
    VALUES($1,$2,$3,'school-admin',$4,NOW()+INTERVAL '1 day')`, [hashInvitationToken(token),companyId,projectId,maxUses])
  return token
}
const accept = (id: string, token: string, kind: 'company' | 'project') => transaction((db) => acceptEducationInvitation(db,id,hashInvitationToken(token),kind))
const allowed = async (id: string, projectId: string, action: 'project:read' | 'learning:manage' | 'learning:submit' = 'project:read') =>
  (await createPermissionService(pool).can({ actorUserId: id, projectId, action })).allowed

before(async () => { await assertMigrationsCurrent(); assert.deepEqual(await migrateDatabase(), []) })
beforeEach(async () => {
  await pool.query('TRUNCATE companies,users,audit_events CASCADE')
  await user('operator'); await user('school-admin')
  const created = await createCompany('school')
  companyId = created.companyId
  assert.ok(created.invitation)
  await accept('school-admin',decodeURIComponent(new URL(created.invitation.url).pathname.split('/').at(-1)!), 'company')
  otherId = (await createCompany('other')).companyId
  await course('math'); await course('science')
})
after(async () => { await pool.query('TRUNCATE companies,users,audit_events CASCADE'); await closeDatabasePools() })

test('operator creates no membership; named first teacher administrator admits once', async () => {
  assert.equal((await pool.query(`SELECT 1 FROM company_memberships WHERE user_id='operator'`)).rowCount,0)
  const rows = (await pool.query(`SELECT role,is_admin FROM company_memberships WHERE user_id='school-admin'`)).rows
  assert.deepEqual(rows,[{ role: 'TEACHER', is_admin: true }])
  await user('teacher')
  const token = await teacherInvitation('teacher')
  assert.equal((await accept('teacher',token,'company')).alreadyMember,false)
  assert.equal((await accept('teacher',token,'company')).alreadyMember,true)
  assert.equal((await pool.query(`SELECT use_count FROM company_invitations WHERE token_hash=$1`,[hashInvitationToken(token)])).rows[0].use_count,1)
  await user('wrong-email')
  await assert.rejects(accept('wrong-email',token,'company'),/email mismatch/)
})

test('students join multiple courses, cannot change identity or cross companies', async () => {
  await user('student')
  await accept('student',await studentInvitation('math'),'project')
  await accept('student',await studentInvitation('science'),'project')
  assert.equal(await allowed('student','math','learning:submit'),true)
  assert.equal(await allowed('student','math','learning:manage'),false)
  await assert.rejects(accept('student',await teacherInvitation('student'),'company'),/identity/)
  await assert.rejects(accept('student',await teacherInvitation('student',false,otherId),'company'),/another company/)
  await pool.query(`UPDATE companies SET status='READ_ONLY' WHERE id=$1`,[companyId])
  await assert.rejects(accept('student',await teacherInvitation('student',false,otherId),'company'),/another company/)
})

test('database rejects a second live company and in-period identity conversion', async () => {
  await assert.rejects(pool.query(`INSERT INTO company_memberships(company_id,user_id,role) VALUES($1,'school-admin','TEACHER')`,[otherId]),/unique constraint/)
  await assert.rejects(pool.query(`UPDATE company_memberships SET role='STUDENT',is_admin=false WHERE user_id='school-admin'`),/identity is fixed/)
  await assert.rejects(pool.query(`INSERT INTO project_memberships(company_id,project_id,user_id,role) VALUES($1,'math','operator','STUDENT')`,[companyId]),/matching active company identity/)
})

test('shared invitation concurrency respects use count and replay does not consume twice', async () => {
  await user('s1'); await user('s2')
  const token = await studentInvitation('math',1)
  const results = await Promise.allSettled([accept('s1',token,'project'),accept('s2',token,'project')])
  assert.equal(results.filter((result) => result.status==='fulfilled').length,1)
  const winner = results[0].status==='fulfilled' ? 's1' : 's2'
  assert.equal((await accept(winner,token,'project')).alreadyMember,true)
  assert.equal((await pool.query(`SELECT use_count FROM project_invitations WHERE token_hash=$1`,[hashInvitationToken(token)])).rows[0].use_count,1)
})

test('administrator manages unassigned courses; ordinary teacher needs assignment', async () => {
  await user('teacher'); await accept('teacher',await teacherInvitation('teacher'),'company')
  assert.equal(await allowed('teacher','math','learning:manage'),false)
  await transaction((db) => addInstitutionalCourseMember(db,{ companyId,courseId:'course-math',userId:'teacher',role:'TEACHER' }))
  assert.equal(await allowed('teacher','math','learning:manage'),true)
  await companies.changeMemberRole({ companyId,userId:'school-admin',targetId:'teacher',isAdmin:true,audit })
  assert.equal(await allowed('teacher','science','learning:manage'),true)
  assert.equal((await listProjects(pool,companyId,'teacher')).length,2)
  assert.equal((await listActiveActorProjectScopes(pool,{ actorUserId:'teacher',afterProjectId:null,afterSortAt:null,limit:20 })).length,2)
})

test('last administrator hands over before leaving; course creator can leave and history stays', async () => {
  await assert.rejects(companies.removeMember({ companyId,userId:'school-admin',targetId:'school-admin',audit }),/administrator first/)
  await user('replacement'); await accept('replacement',await teacherInvitation('replacement',true),'company')
  await companies.removeMember({ companyId,userId:'school-admin',targetId:'school-admin',audit })
  assert.equal(await allowed('school-admin','math'),false)
  assert.equal(await allowed('replacement','math','learning:manage'),true)
  assert.deepEqual((await pool.query(`SELECT created_by FROM courses WHERE id='course-math'`)).rows,[{ created_by:'school-admin' }])
  assert.equal((await pool.query(`SELECT 1 FROM audit_events WHERE kind='company_member_remove'`)).rowCount,1)
})

test('departure invalidates tickets and old invitations; new period never restores other courses', async () => {
  await user('student')
  const old = await studentInvitation('math')
  await accept('student',old,'project')
  await accept('student',await studentInvitation('science'),'project')
  await insertWsTicket(pool,{ tokenHash:'old-ticket',userId:'student',expiresAt:new Date(Date.now()+30000) })
  const before = (await pool.query(`SELECT period_id FROM company_memberships WHERE user_id='student'`)).rows[0].period_id
  await transaction((db) => removeMemberState(db,companyId,'student'))
  assert.equal(await consumeWsTicketByHash(pool,'old-ticket'),null)
  assert.equal(await allowed('student','math'),false)
  const fresh = await studentInvitation('math')
  await assert.rejects(accept('student',fresh,'project'),/cleanup in progress/)
  await pool.query(`UPDATE company_onboarding_effects SET status='completed' WHERE kind='access.revoke'`)
  await assert.rejects(accept('student',old,'project'),/new invitation/)
  await accept('student',fresh,'project')
  const after = (await pool.query(`SELECT period_id FROM company_memberships WHERE user_id='student'`)).rows[0].period_id
  assert.notEqual(before,after)
  assert.equal(await allowed('student','math'),true)
  assert.equal(await allowed('student','science'),false)
  assert.equal((await pool.query(`SELECT 1 FROM company_membership_periods WHERE id=$1 AND ended_at IS NOT NULL`,[before])).rowCount,1)
})

test('platform suspension cannot be lifted with an invitation', async () => {
  await user('banned')
  await pool.query(`UPDATE users SET suspended_at=NOW() WHERE id='banned'`)
  await assert.rejects(accept('banned',await studentInvitation('math'),'project'),/non-suspended/)
})

test('departure fences pending document writes and reminder recipients across readmission', async () => {
  await user('student')
  await accept('student',await studentInvitation('math'),'project')
  await pool.query(`INSERT INTO documents(id,company_id,project_id,title,created_by) VALUES('queued-doc',$1,'math','Doc','student')`,[companyId])
  const queuedAt = await transaction(db => humanWriteAuthorization(db,'student'))
  assert.equal(await transaction((db) => canPersistHumanUpdate(db,'queued-doc',companyId,'student',queuedAt)),true)
  await transaction((db) => removeMemberState(db,companyId,'student'))
  assert.equal(await transaction((db) => canPersistHumanUpdate(db,'queued-doc',companyId,'student',queuedAt)),false)
  assert.deepEqual(await listCalendarReminderRecipients(pool,{companyId,creatorId:'student',assigneeId:null}),[])
  await pool.query(`UPDATE company_onboarding_effects SET status='completed' WHERE kind='access.revoke'`)
  await accept('student',await studentInvitation('math'),'project')
  assert.equal(await transaction((db) => canPersistHumanUpdate(db,'queued-doc',companyId,'student',queuedAt)),false)
})

test('emergency operator suspension ends the final administrator period; restoration does not revive it', async () => {
  const change = (action: 'suspend' | 'restore') => transaction(db => changeUserLifecycle(db,{
    action,targetId:'school-admin',adminId:'operator',reason:'security incident',ip:null,userAgent:null,
  }))
  await change('suspend')
  assert.equal(await allowed('school-admin','math'),false)
  assert.equal((await pool.query(`SELECT 1 FROM company_memberships WHERE user_id='school-admin' AND ended_at IS NULL`)).rowCount,0)
  await change('restore')
  assert.equal(await allowed('school-admin','math'),false)
  assert.ok((await pool.query(`SELECT departed_at FROM users WHERE id='school-admin'`)).rows[0].departed_at)
})

test('company retains learner history after a new teacher period replaces the course role', async () => {
  await user('student')
  await accept('student',await studentInvitation('math'),'project')
  await pool.query(`INSERT INTO learning_knowledge_units(id,company_id,project_id,title,success_criteria,created_by)
    VALUES('history-unit',$1,'math','History','Retained','school-admin')`,[companyId])
  await pool.query(`INSERT INTO learning_states(company_id,project_id,user_id,knowledge_unit_id)
    VALUES($1,'math','student','history-unit')`,[companyId])
  await transaction(db => removeMemberState(db,companyId,'student'))
  await pool.query(`UPDATE company_onboarding_effects SET status='completed' WHERE kind='access.revoke'`)
  await accept('student',await teacherInvitation('student'),'company')
  await transaction(db => addInstitutionalCourseMember(db,{companyId,courseId:'course-math',userId:'student',role:'TEACHER'}))
  assert.ok(await findLearningDashboardLearner(pool,{companyId,projectId:'math',learnerId:'student'}))
  assert.equal((await pool.query(`SELECT 1 FROM learning_states WHERE company_id=$1 AND user_id='student'`,[companyId])).rowCount,1)
})
