import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { createPermissionService } from '../modules/access/public.js'
import { withTransaction } from '../db/transaction.js'
import { CompanyApplication, CompanyApplicationError } from '../modules/companies/application.js'
import { seedMembershipPeriod, ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

const OWNER = 'u-company-owner'
const MEMBER = 'u-company-member'
const SECOND = 'u-company-second'
const FOREIGN_MEMBER = 'u-company-foreign'
const COMPANY = 'co-company-slice'
const FOREIGN_COMPANY = 'co-company-foreign'

const audits: Array<{ kind: string; companyId: string }> = []
const disconnected: Array<{ userId: string; companyId: string }> = []
let failAudit = false
let syncFailuresRemaining = 0
let nextToken = 0
const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const application = new CompanyApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  auditInTransaction: async (_db, entry) => { if (failAudit) throw new Error('audit unavailable'); audits.push({ kind: entry.kind, companyId: entry.companyId }) },
  syncChannel: async () => {
    if (syncFailuresRemaining > 0) {
      syncFailuresRemaining -= 1
      throw new Error('WuKong unavailable')
    }
  },
  disconnectUser: async (userId, companyId) => { disconnected.push({ userId, companyId }) },
  generateInvitationToken: () => `company-test-token-${nextToken += 1}`,
  hashInvitationToken: hash,
  invitationBaseUrl: 'https://loop.invalid',
  sendInvitationEmail: async () => { throw new Error('email is not configured in this fixture') },
})

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => {
  await resetAllTables()
  failAudit = false
  audits.length = 0
  disconnected.length = 0
  syncFailuresRemaining = 0
  nextToken = 0
  await pool.query(
    `INSERT INTO users (id,email,display_name,avatar_url) VALUES
       ($1,'owner@example.com','Owner',NULL),
       ($2,'member@example.com','Member',NULL),
       ($3,'second@example.com','Second',NULL),
       ($4,'foreign@example.com','Foreign',NULL)`,
    [OWNER, MEMBER, SECOND, FOREIGN_MEMBER],
  )
  await pool.query(`UPDATE users SET email_verified_at=NOW()`)
  await pool.query(
    `INSERT INTO companies (id,name,slug,type,plan_id) VALUES
       ($1,'Company Slice','company-slice','EDUCATION','plan-education'),
       ($2,'Foreign Company','foreign-company','EDUCATION','plan-education')`,
    [COMPANY, FOREIGN_COMPANY],
  )
  await pool.query(
    `INSERT INTO company_memberships (company_id,user_id,role,is_admin) VALUES
       ($1,$3,'TEACHER',TRUE),($1,$4,'TEACHER',FALSE),($2,$5,'TEACHER',TRUE)`,
    [COMPANY, FOREIGN_COMPANY, OWNER, MEMBER, FOREIGN_MEMBER],
  )
  for (const [company,user] of [[COMPANY,OWNER],[COMPANY,MEMBER],[FOREIGN_COMPANY,FOREIGN_MEMBER]]) await seedMembershipPeriod(pool,company!,user!)
  await pool.query(
    `INSERT INTO education_contracts(id,company_id,plan_id,status,starts_at,ends_at,seat_limit) VALUES
       ('contract-company-slice',$1,'plan-education','ACTIVE',NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days',4),
       ('contract-company-foreign',$2,'plan-education','ACTIVE',NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days',1)`,
    [COMPANY, FOREIGN_COMPANY],
  )
  await pool.query(
    `INSERT INTO organization_seats(id,company_id,contract_id,user_id,status) VALUES
       ('seat-company-owner',$1,'contract-company-slice',$3,'ACTIVE'),
       ('seat-company-member',$1,'contract-company-slice',$4,'ACTIVE'),
       ('seat-company-foreign',$2,'contract-company-foreign',$5,'ACTIVE')`,
    [COMPANY, FOREIGN_COMPANY, OWNER, MEMBER, FOREIGN_MEMBER],
  )
})

test('[integration] member removal disconnects immediately and retries IM reconciliation idempotently', async () => {
  await pool.query(
    `INSERT INTO participants (id,company_id,kind,name,initial,avatar_bg,status)
     VALUES ($1,$2,'human','Member','M','#667085','avail')`,
    [MEMBER, COMPANY],
  )
  await pool.query(
    `INSERT INTO conversations (id,company_id,project_id,kind,title,members)
     VALUES ('member-room',$1,NULL,'group','Member room',$2::jsonb)`,
    [COMPANY, JSON.stringify([OWNER, MEMBER])],
  )
  await pool.query(
    `INSERT INTO im_channel_bindings(channel_id,company_id,profile)
     VALUES ('member-room',$1,$2::jsonb)`,
    [COMPANY, JSON.stringify({ channelId: 'member-room', channelType: 2, title: 'Member room', members: [OWNER, MEMBER] })],
  )
  syncFailuresRemaining = 1
  const input = { companyId: COMPANY, userId: OWNER, targetId: MEMBER, audit: { ip: null, userAgent: null } }
  assert.deepEqual(await application.removeMember(input), { ok: true })
  assert.deepEqual(disconnected, [{ userId: MEMBER, companyId: COMPANY }])
  assert.equal((await pool.query(
    `SELECT 1 FROM company_memberships WHERE company_id=$1 AND user_id=$2 AND ended_at IS NULL`, [COMPANY, MEMBER],
  )).rowCount, 0)

  assert.deepEqual(await application.removeMember(input), { ok: true })
  assert.equal(disconnected.length, 2)
  assert.equal(audits.filter((entry) => entry.kind === 'company_member_remove').length, 1)
})

after(async () => { await teardownAll() })

test('[integration] company member mutation never crosses tenant ownership', async () => {
  await assert.rejects(
    application.changeMemberRole({
      companyId: COMPANY, userId: OWNER, targetId: FOREIGN_MEMBER, isAdmin: true,
      audit: { ip: null, userAgent: null },
    }),
    (error) => error instanceof CompanyApplicationError && error.code === 'not_found',
  )
  const foreign = await pool.query<{ role: string }>(
    `SELECT role FROM company_memberships WHERE company_id=$1 AND user_id=$2`,
    [FOREIGN_COMPANY, FOREIGN_MEMBER],
  )
  assert.equal(foreign.rows[0]?.role, 'TEACHER')
})

test('[integration] single-use invitation accepts exactly once under concurrency', async () => {
  const invitation = await application.createInvitation({
    companyId: COMPANY,
    userId: OWNER,
    input: { email: 'second@example.com', isAdmin: false },
    audit: { ip: null, userAgent: null },
  })
  const attempts = await Promise.allSettled([
    application.acceptInvitation(invitation.token, SECOND, { ip: null, userAgent: null }),
    application.acceptInvitation(invitation.token, FOREIGN_MEMBER, { ip: null, userAgent: null }),
  ])
  assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(attempts.filter((result) => result.status === 'rejected').length, 1)
  const state = await pool.query<{ use_count: number }>(
    `SELECT use_count FROM company_invitations WHERE token_hash=$1 AND company_id=$2`,
    [hash(invitation.token), COMPANY],
  )
  assert.equal(state.rows[0]?.use_count, 1)
  const memberships = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM company_memberships WHERE company_id=$1 AND user_id=ANY($2::text[])`,
    [COMPANY, [SECOND, FOREIGN_MEMBER]],
  )
  assert.equal(memberships.rows.length, 1)
})

test('[integration] invitation replay is idempotent without double-counting usage', async () => {
  const invitation = await application.createInvitation({
    companyId: COMPANY,
    userId: OWNER,
    input: { email: 'second@example.com', isAdmin: false },
    audit: { ip: null, userAgent: null },
  })
  const first = await application.acceptInvitation(invitation.token, SECOND, { ip: null, userAgent: null })
  const replay = await application.acceptInvitation(invitation.token, SECOND, { ip: null, userAgent: null })
  assert.equal(first.alreadyMember, false)
  assert.equal(replay.alreadyMember, true)
  const state = await pool.query<{ use_count: number }>(
    `SELECT use_count FROM company_invitations WHERE token_hash=$1`,
    [hash(invitation.token)],
  )
  assert.equal(state.rows[0]?.use_count, 1)
})

test('[integration] invitation acceptance atomically enqueues one durable member onboarding effect', async () => {
  const invitation = await application.createInvitation({
    companyId: COMPANY,
    userId: OWNER,
    input: { email: 'second@example.com', isAdmin: false },
    audit: { ip: null, userAgent: null },
  })
  const accepted = await application.acceptInvitation(invitation.token, SECOND, { ip: null, userAgent: null })
  assert.equal(accepted.alreadyMember, false)
  const retry = await application.acceptInvitation(invitation.token, SECOND, { ip: null, userAgent: null })
  assert.equal(retry.alreadyMember, true)
  const effects = await pool.query<{ status: string; member_id: string }>(
    `SELECT status,member_id FROM company_onboarding_effects WHERE company_id=$1 AND member_id=$2`,
    [COMPANY, SECOND],
  )
  assert.deepEqual(effects.rows, [{ status: 'pending', member_id: SECOND }])
  const state = await pool.query<{ use_count: number }>(
    `SELECT use_count FROM company_invitations WHERE token_hash=$1`,
    [hash(invitation.token)],
  )
  assert.equal(state.rows[0]?.use_count, 1)
})

// Failure cases: non-admin/foreign actor, wrong course, stale student identity,
// duplicate/concurrent requests, old course grants surviving, seat loss, and
// partial revocation. Exercise the real transaction and education triggers.
async function seedPromotionStudent() {
  await pool.query(`INSERT INTO company_memberships(company_id,user_id,role) VALUES($1,$2,'STUDENT')`, [COMPANY,SECOND])
  await seedMembershipPeriod(pool, COMPANY, SECOND)
  await pool.query(`INSERT INTO organization_seats(id,company_id,contract_id,user_id,status)
    VALUES('promotion-seat',$1,'contract-company-slice',$2,'ACTIVE')`, [COMPANY,SECOND])
  await pool.query(`INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status)
    VALUES($1,$2,'human','Student','S','#667085','avail')`, [SECOND,COMPANY])
  await pool.query(`INSERT INTO projects(id,company_id,name,kind,status) VALUES('promotion-course',$1,'Course','TEACHING','ACTIVE'),('other-course',$1,'Other course','TEACHING','ACTIVE')`, [COMPANY])
  await pool.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role,company_period_id)
    SELECT 'promotion-course',company_id,user_id,role,period_id FROM company_memberships
    WHERE company_id=$1 AND user_id IN ($2,$3)`, [COMPANY,OWNER,SECOND])
  await pool.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role,company_period_id)
    SELECT 'other-course',company_id,user_id,role,period_id FROM company_memberships WHERE user_id=$1`, [SECOND])
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
    VALUES('promotion-room',$1,'promotion-course','group','Course',$2::jsonb)`, [COMPANY,JSON.stringify([OWNER,SECOND])])
}
const promotion = () => ({ companyId: COMPANY, userId: OWNER, targetId: SECOND, projectId: 'promotion-course', audit: { ip: null, userAgent: null } })

test('[integration] promotion isolates the old student period and retains the teacher seat', async () => {
  await seedPromotionStudent()
  const old = (await pool.query(`SELECT period_id FROM company_memberships WHERE user_id=$1`, [SECOND])).rows[0].period_id
  await application.promoteStudent(promotion())
  const member = (await pool.query(`SELECT role,is_admin,status,period_id,ended_at FROM company_memberships WHERE user_id=$1`, [SECOND])).rows[0]
  assert.equal(member.role, 'TEACHER'); assert.equal(member.is_admin, false); assert.equal(member.status, 'ACTIVE')
  assert.equal(member.ended_at, null); assert.notEqual(member.period_id, old)
  assert.ok((await pool.query(`SELECT ended_at FROM company_membership_periods WHERE id=$1`, [old])).rows[0].ended_at)
  assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM project_memberships WHERE user_id=$1 AND status='ACTIVE'`, [SECOND])).rows[0].n, 0)
  assert.equal((await pool.query(`SELECT status FROM organization_seats WHERE id='promotion-seat'`)).rows[0].status, 'ACTIVE')
  assert.deepEqual((await pool.query(`SELECT members FROM conversations WHERE id='promotion-room'`)).rows[0].members, [OWNER])
  assert.ok((await pool.query(`SELECT access_revoked_at FROM users WHERE id=$1`, [SECOND])).rows[0].access_revoked_at)
  assert.equal((await pool.query(`SELECT kind FROM company_onboarding_effects WHERE member_id=$1 AND kind='access.revoke'`, [SECOND])).rowCount, 1)
  assert.deepEqual(disconnected, [{ userId: SECOND, companyId: COMPANY }])
  const permissions = createPermissionService(pool)
  assert.equal((await permissions.can({ actorUserId: SECOND, companyId: COMPANY, action: 'course:create' })).allowed, true)
  assert.equal((await permissions.can({ actorUserId: SECOND, companyId: COMPANY, projectId: 'promotion-course', action: 'project:read' })).allowed, false)
  await assert.rejects(application.promoteStudent(promotion()))
})

test('[integration] promotion rejects non-admin, foreign and unrelated-course requests without changing identity', async () => {
  await seedPromotionStudent()
  for (const args of [{ ...promotion(), userId: MEMBER }, { ...promotion(), userId: FOREIGN_MEMBER }, { ...promotion(), projectId: 'unrelated' }]) {
    await assert.rejects(application.promoteStudent(args))
  }
  assert.equal((await pool.query(`SELECT role FROM company_memberships WHERE user_id=$1`, [SECOND])).rows[0].role, 'STUDENT')
})

test('[integration] simultaneous promotion requests only create one teacher period', async () => {
  await seedPromotionStudent()
  const results = await Promise.allSettled([application.promoteStudent(promotion()), application.promoteStudent(promotion())])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM company_membership_periods p JOIN company_memberships m ON m.id=p.membership_id WHERE m.user_id=$1 AND p.role='TEACHER'`, [SECOND])).rows[0].n, 1)
})


test('[integration] promotion rolls back identity, seat and access when audit fails', async () => {
  await seedPromotionStudent()
  failAudit = true
  await assert.rejects(application.promoteStudent(promotion()), /audit unavailable/)
  assert.equal((await pool.query(`SELECT role FROM company_memberships WHERE user_id=$1`, [SECOND])).rows[0].role, 'STUDENT')
  assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM project_memberships WHERE user_id=$1 AND status='ACTIVE'`, [SECOND])).rows[0].n, 2)
  assert.equal((await pool.query(`SELECT status FROM organization_seats WHERE id='promotion-seat'`)).rows[0].status, 'ACTIVE')
  assert.equal((await pool.query(`SELECT access_revoked_at FROM users WHERE id=$1`, [SECOND])).rows[0].access_revoked_at, null)
  assert.equal(disconnected.length, 0)
})
