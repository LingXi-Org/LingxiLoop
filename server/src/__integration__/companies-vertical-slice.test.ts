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
  installCompany: async () => false,
  finalizeCompany: async () => undefined,
  seedMemberDms: async () => undefined,
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
    `INSERT INTO companies (id,name,slug,owner_user_id) VALUES
       ($1,'Company Slice','company-slice',$3),
       ($2,'Foreign Company','foreign-company',$4)`,
    [COMPANY, FOREIGN_COMPANY, OWNER, FOREIGN_MEMBER],
  )
  await pool.query(
    `INSERT INTO company_members (company_id,user_id,role) VALUES
       ($1,$3,'owner'),($1,$4,'member'),($2,$5,'owner')`,
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
    `SELECT 1 FROM company_members WHERE company_id=$1 AND user_id=$2`, [COMPANY, MEMBER],
  )).rowCount, 0)

  assert.deepEqual(await application.removeMember(input), { ok: true })
  assert.equal(disconnected.length, 2)
  assert.equal(audits.filter((entry) => entry.kind === 'company_member_remove').length, 1)
})
after(async () => { await teardownAll() })

test('[integration] company creation commits one tenant root and required General workspace', async () => {
  const created = await application.createCompany(SECOND, { name: 'Strict Workspace' }, { ip: null, userAgent: null })
  const root = await pool.query<{ owner_user_id: string; project_count: number; participant_count: number }>(
    `SELECT company.owner_user_id,
            (SELECT COUNT(*)::int FROM projects WHERE company_id=company.id AND is_general=TRUE) AS project_count,
            (SELECT COUNT(*)::int FROM participants WHERE company_id=company.id AND id=$2) AS participant_count
       FROM companies company WHERE company.id=$1`,
    [created.id, SECOND],
  )
  assert.equal(root.rows[0]?.owner_user_id, SECOND)
  assert.equal(root.rows[0]?.project_count, 1)
  assert.equal(root.rows[0]?.participant_count, 1)
  assert.equal(audits.some((entry) => entry.kind === 'company_create' && entry.companyId === created.id), true)
})

test('[integration] company member mutation never crosses tenant ownership', async () => {
  await assert.rejects(
    application.changeMemberRole({
      companyId: COMPANY, userId: OWNER, targetId: FOREIGN_MEMBER, role: 'admin',
      audit: { ip: null, userAgent: null },
    }),
    (error) => error instanceof CompanyApplicationError && error.code === 'not_found',
  )
  const foreign = await pool.query<{ role: string }>(
    `SELECT role FROM company_members WHERE company_id=$1 AND user_id=$2`,
    [FOREIGN_COMPANY, FOREIGN_MEMBER],
  )
  assert.equal(foreign.rows[0]?.role, 'owner')
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
    `SELECT user_id FROM company_members WHERE company_id=$1 AND user_id=ANY($2::text[])`,
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
