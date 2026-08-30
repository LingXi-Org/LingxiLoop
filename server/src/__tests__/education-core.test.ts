import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createEducationCompanyRequestSchema } from '../modules/education/contracts.js'
import { resolveAccessContext } from '../modules/access/context-resolver.js'
import type { AccessRepository } from '../modules/access/repository.js'

const repositorySource = readFileSync('server/src/modules/education/repository.ts', 'utf8')
const applicationSource = readFileSync('server/src/modules/education/application.ts', 'utf8')
const routerSource = readFileSync('server/src/modules/education/router.ts', 'utf8')

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
