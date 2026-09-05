import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { transitionEducationContract } from '../domain/public.js'
import type { Queryable } from '../db/queryable.js'
import { createEducationCompanyRequestSchema } from '../modules/education/contracts.js'
import { expireNextDueEducationContract } from '../modules/education/repository.js'
import { resolveAccessContext } from '../modules/access/context-resolver.js'
import type { AccessRepository } from '../modules/access/repository.js'

const repositorySource = readFileSync('server/src/modules/education/repository.ts', 'utf8')
const applicationSource = readFileSync('server/src/modules/education/application.ts', 'utf8')
const routerSource = readFileSync('server/src/modules/education/router.ts', 'utf8')
const accessRepositorySource = readFileSync('server/src/modules/access/repository.ts', 'utf8')
const productionWorkerSource = readFileSync('server/src/worker.ts', 'utf8')

const validRequest = {
  name: 'Example School',
  slug: 'example-school',
  planId: 'education-plan',
  contract: {
    startsAt: '2026-08-30T00:00:00.000Z',
    endsAt: '2027-08-30T00:00:00.000Z',
    seatLimit: 10,
    config: {},
  },
  idempotencyKey: 'create-example-school',
}

test('Education Company input requires an ordered contract period and positive seat limit', () => {
  assert.equal(createEducationCompanyRequestSchema.safeParse(validRequest).success, true)
  assert.equal(createEducationCompanyRequestSchema.safeParse({
    ...validRequest,
    contract: { ...validRequest.contract, endsAt: validRequest.contract.startsAt },
  }).success, false)
  assert.equal(createEducationCompanyRequestSchema.safeParse({
    ...validRequest,
    contract: { ...validRequest.contract, seatLimit: 0 },
  }).success, false)
})

test('Education creation reuses an existing User and does not grant a Project role', () => {
  assert.match(repositorySource, /SELECT display_name,avatar_url FROM users/)
  assert.doesNotMatch(repositorySource, /INSERT INTO users/)
  assert.match(repositorySource, /INSERT INTO company_memberships/)
  assert.match(repositorySource, /INSERT INTO organization_seats/)
  assert.doesNotMatch(repositorySource, /INSERT INTO project_memberships/)
})

test('Education creation emits the four canonical facts and exposes only its dedicated endpoint', () => {
  for (const eventType of [
    'EDUCATION_COMPANY.CREATED',
    'SCHOOL_MEMBERSHIP.CREATED',
    'EDUCATION_CONTRACT.CREATED',
    'ORGANIZATION_SEAT.ASSIGNED',
  ]) assert.match(applicationSource, new RegExp(eventType.replace('.', '\\.')))
  assert.match(routerSource, /\.post\('\/education-companies'/)
  assert.doesNotMatch(routerSource, /\.post\('\/companies'/)
})

function educationRepository(seatPlanId: string | null): AccessRepository {
  return {
    actor: async () => ({ id: 'user-1', deletedAt: null, suspendedAt: null }),
    company: async () => ({ id: 'school-1', type: 'EDUCATION', status: 'TRIAL', planId: 'company-plan' }),
    companyMembership: async () => ({ role: 'OWNER', status: 'ACTIVE' }),
    activeOrganizationSeatPlanId: async () => seatPlanId,
    plan: async (id: string) => ({ id, code: 'EDUCATION', status: 'ACTIVE' }),
    entitlements: async () => [],
  } as unknown as AccessRepository
}

test('Education entitlements require an active Seat and use its Contract plan', async () => {
  const request = { actorUserId: 'user-1', companyId: 'school-1', action: 'company:read' } as const
  assert.deepEqual(await resolveAccessContext(educationRepository(null), request), {
    allowed: false,
    reason: 'ORGANIZATION_SEAT_REQUIRED',
  })

  const resolution = await resolveAccessContext(educationRepository('contract-plan'), request)
  assert.equal(resolution.allowed, true)
  if (!resolution.allowed) return
  assert.deepEqual(resolution.context.effectivePlan, { id: 'contract-plan', code: 'EDUCATION' })
})

test('Education Contract expiry is terminal and retry-safe', () => {
  assert.deepEqual(transitionEducationContract('TRIAL', 'EXPIRE'), {
    outcome: 'APPLIED', from: 'TRIAL', to: 'EXPIRED',
  })
  assert.deepEqual(transitionEducationContract('ACTIVE', 'EXPIRE'), {
    outcome: 'APPLIED', from: 'ACTIVE', to: 'EXPIRED',
  })
  assert.deepEqual(transitionEducationContract('EXPIRED', 'EXPIRE'), {
    outcome: 'ALREADY_APPLIED', from: 'EXPIRED', to: 'EXPIRED',
  })
  assert.deepEqual(transitionEducationContract('TERMINATED', 'EXPIRE'), {
    outcome: 'INVALID', from: 'TERMINATED', to: null,
  })
})

test('due Contract expiry scopes every mutation to Education and Institutional Projects', async () => {
  const statements: string[] = []
  const now = new Date('2026-08-30T00:00:00.000Z')
  const db = {
    async query(sql: string) {
      statements.push(sql)
      if (sql.includes('SELECT contract.id')) return {
        rows: [{ id: 'contract-1', company_id: 'school-1', company_status: 'ACTIVE', ends_at: now }],
        rowCount: 1,
      }
      if (sql.includes('SELECT id,kind,status FROM projects')) return {
        rows: [{ id: 'course-1', kind: 'INSTITUTIONAL_COURSE', status: 'ACTIVE' }],
        rowCount: 1,
      }
      return { rows: [], rowCount: 1 }
    },
  } as unknown as Queryable

  assert.deepEqual(await expireNextDueEducationContract(db, now), {
    contractId: 'contract-1',
    companyId: 'school-1',
    previousCompanyStatus: 'ACTIVE',
    projects: [{ id: 'course-1', kind: 'INSTITUTIONAL_COURSE', status: 'ACTIVE' }],
    endsAt: now,
  })
  const sql = statements.join('\n')
  assert.match(sql, /company\.type='EDUCATION'/)
  assert.match(sql, /type='EDUCATION'/)
  assert.match(sql, /kind='INSTITUTIONAL_COURSE' AND status='ACTIVE'/)
  assert.doesNotMatch(sql, /PERSONAL|subscriptions/)
  assert.doesNotMatch(sql, /UPDATE (?:company_memberships|organization_seats)/)
})

test('expiry keeps Seat-backed grace access and publishes durable lifecycle facts', () => {
  assert.match(accessRepositorySource, /contract\.status='EXPIRED'[\s\S]*'GRACE_PERIOD'.*'READ_ONLY'.*'RETENTION'/)
  assert.match(applicationSource, /EDUCATION_CONTRACT\.EXPIRED/)
  assert.match(applicationSource, /EDUCATION_COMPANY\.ENTERED_GRACE_PERIOD/)
  assert.match(applicationSource, /PROJECT\.COURSE_ENDED/)
  assert.match(applicationSource, /education_contract_expired/)
  assert.match(productionWorkerSource, /education-contract-expiry/)
})
