import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { CompanyApplication, CompanyApplicationError } from '../modules/companies/application.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

const OWNER = 'u-company-owner'
const MEMBER = 'u-company-member'
const SECOND = 'u-company-second'
const FOREIGN_MEMBER = 'u-company-foreign'
const COMPANY = 'co-company-slice'
const FOREIGN_COMPANY = 'co-company-foreign'

const audits: Array<{ kind: string; companyId: string }> = []
const disconnected: Array<{ userId: string; companyId: string }> = []
let syncFailuresRemaining = 0
let nextToken = 0
const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const application = new CompanyApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  auditInTransaction: async (_db, entry) => { audits.push({ kind: entry.kind, companyId: entry.companyId }) },
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
  await pool.query(
    `INSERT INTO companies (id,name,slug,type,plan_id) VALUES
       ($1,'Company Slice','company-slice','EDUCATION','plan-personal-free'),
       ($2,'Foreign Company','foreign-company','EDUCATION','plan-personal-free')`,
    [COMPANY, FOREIGN_COMPANY],
  )
  await pool.query(
    `INSERT INTO company_memberships (company_id,user_id,role) VALUES
       ($1,$3,'OWNER'),($1,$4,'MEMBER'),($2,$5,'OWNER')`,
    [COMPANY, FOREIGN_COMPANY, OWNER, MEMBER, FOREIGN_MEMBER],
  )
  await pool.query(
    `INSERT INTO education_contracts(id,company_id,plan_id,status,starts_at,ends_at,seat_limit) VALUES
       ('contract-company-slice',$1,'plan-personal-free','ACTIVE',NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days',4),
       ('contract-company-foreign',$2,'plan-personal-free','ACTIVE',NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days',1)`,
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
  await assert.rejects(application.removeMember(input), /reconciliation failed/)
  assert.deepEqual(disconnected, [{ userId: MEMBER, companyId: COMPANY }])
  assert.equal((await pool.query(
    `SELECT 1 FROM company_memberships WHERE company_id=$1 AND user_id=$2`, [COMPANY, MEMBER],
  )).rowCount, 0)

  assert.deepEqual(await application.removeMember(input), { ok: true })
  assert.equal(disconnected.length, 2)
  assert.equal(audits.filter((entry) => entry.kind === 'company_member_remove').length, 1)
})

test('[integration] company member cascade cannot remove a Course creator', async () => {
  await pool.query(
    `INSERT INTO projects(id,company_id,kind,plan_id,name,status,created_by)
     VALUES ('project-company-creator',$1,'INSTITUTIONAL_COURSE','plan-personal-free','Creator Course','ACTIVE',$2)`,
    [COMPANY, MEMBER],
  )
  await pool.query(
    `INSERT INTO courses(id,company_id,project_id,created_by)
     VALUES ('course-company-creator',$1,'project-company-creator',$2)`,
    [COMPANY, MEMBER],
  )
  await pool.query(
    `INSERT INTO project_memberships(company_id,project_id,user_id,role) VALUES
       ($1,'project-company-creator',$2,'OWNER'),
       ($1,'project-company-creator',$3,'TEACHER')`,
    [COMPANY, MEMBER, OWNER],
  )

  await assert.rejects(
    application.removeMember({
      companyId: COMPANY,
      userId: OWNER,
      targetId: MEMBER,
      audit: { ip: null, userAgent: null },
    }),
    (error) => error instanceof CompanyApplicationError
      && error.code === 'conflict'
      && /creator cannot be removed/.test(error.message),
  )
  assert.equal((await pool.query(
    `SELECT 1 FROM company_memberships WHERE company_id=$1 AND user_id=$2`,
    [COMPANY, MEMBER],
  )).rowCount, 1)
})

test('[integration] company member cascade preserves the final Course OWNER', async () => {
  await pool.query(
    `INSERT INTO projects(id,company_id,kind,plan_id,name,status,created_by)
     VALUES ('project-company-owner',$1,'INSTITUTIONAL_COURSE','plan-personal-free','Owner Course','ACTIVE',$2)`,
    [COMPANY, OWNER],
  )
  await pool.query(
    `INSERT INTO courses(id,company_id,project_id,created_by)
     VALUES ('course-company-owner',$1,'project-company-owner',$2)`,
    [COMPANY, OWNER],
  )
  await pool.query(
    `INSERT INTO project_memberships(company_id,project_id,user_id,role) VALUES
       ($1,'project-company-owner',$2,'OWNER'),
       ($1,'project-company-owner',$3,'TEACHER')`,
    [COMPANY, MEMBER, OWNER],
  )

  await assert.rejects(
    application.removeMember({
      companyId: COMPANY,
      userId: OWNER,
      targetId: MEMBER,
      audit: { ip: null, userAgent: null },
    }),
    (error) => error instanceof CompanyApplicationError
      && error.code === 'conflict'
      && /keep at least one owner/.test(error.message),
  )
  assert.equal((await pool.query(
    `SELECT 1 FROM project_memberships
      WHERE company_id=$1 AND project_id='project-company-owner' AND user_id=$2 AND role='OWNER'`,
    [COMPANY, MEMBER],
  )).rowCount, 1)
})

test('[integration] company member cascade never leaves a Course without a manager', async () => {
  await pool.query(
    `INSERT INTO projects(id,company_id,kind,plan_id,name,status,created_by)
     VALUES ('project-company-manager',$1,'INSTITUTIONAL_COURSE','plan-personal-free','Manager Course','ACTIVE',$2)`,
    [COMPANY, OWNER],
  )
  await pool.query(
    `INSERT INTO courses(id,company_id,project_id,created_by)
     VALUES ('course-company-manager',$1,'project-company-manager',$2)`,
    [COMPANY, OWNER],
  )
  await pool.query(
    `INSERT INTO project_memberships(company_id,project_id,user_id,role)
     VALUES ($1,'project-company-manager',$2,'TEACHER')`,
    [COMPANY, MEMBER],
  )

  await assert.rejects(
    application.removeMember({
      companyId: COMPANY,
      userId: OWNER,
      targetId: MEMBER,
      audit: { ip: null, userAgent: null },
    }),
    (error) => error instanceof CompanyApplicationError
      && error.code === 'conflict'
      && /keep at least one teacher/.test(error.message),
  )
  assert.equal((await pool.query(
    `SELECT 1 FROM project_memberships
      WHERE company_id=$1 AND project_id='project-company-manager' AND user_id=$2 AND role='TEACHER'`,
    [COMPANY, MEMBER],
  )).rowCount, 1)
})
after(async () => { await teardownAll() })

test('[integration] company member mutation never crosses tenant ownership', async () => {
  await assert.rejects(
    application.changeMemberRole({
      companyId: COMPANY, userId: OWNER, targetId: FOREIGN_MEMBER, role: 'admin',
      audit: { ip: null, userAgent: null },
    }),
    (error) => error instanceof CompanyApplicationError && error.code === 'not_found',
  )
  const foreign = await pool.query<{ role: string }>(
    `SELECT role FROM company_memberships WHERE company_id=$1 AND user_id=$2`,
    [FOREIGN_COMPANY, FOREIGN_MEMBER],
  )
  assert.equal(foreign.rows[0]?.role, 'OWNER')
})

test('[integration] single-use invitation accepts exactly once under concurrency', async () => {
  const invitation = await application.createInvitation({
    companyId: COMPANY,
    userId: OWNER,
    input: { role: 'member', maxUses: 1 },
    audit: { ip: null, userAgent: null },
  })
  const attempts = await Promise.allSettled([
    application.acceptInvitation(invitation.token, SECOND, { ip: null, userAgent: null }),
    application.acceptInvitation(invitation.token, FOREIGN_MEMBER, { ip: null, userAgent: null }),
  ])
  assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1)
  const rejection = attempts.find((result) => result.status === 'rejected')
  assert.equal(
    rejection?.status === 'rejected' && rejection.reason instanceof CompanyApplicationError
      ? rejection.reason.code
      : null,
    'gone',
  )
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
    input: { role: 'member', maxUses: 2 },
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
    input: { role: 'member', maxUses: 1 },
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
