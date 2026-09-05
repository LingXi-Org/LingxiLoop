import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const application = read('../modules/enterprise/application.ts')
const contracts = read('../modules/enterprise/contracts.ts')
const repository = read('../modules/enterprise/repository.ts')
const router = read('../modules/enterprise/router.ts')

test('Enterprise governance exposes bounded hierarchy and five versioned Policy kinds', () => {
  assert.match(contracts, /'PROVISIONING'.*'RETENTION'.*'RESIDENCY'.*'REGION'.*'SLA'/s)
  assert.match(contracts, /idempotencyKey:[\s\S]*min\(8\).*max\(200\)/)
  assert.match(contracts, /policyVersion:[\s\S]*expectedRevision:/)
  assert.match(contracts, /16_384/)
  assert.match(router, /get\('\/enterprise\/organization-units'/)
  assert.match(router, /post\('\/enterprise\/organization-units'/)
  assert.match(router, /get\('\/enterprise\/governance-policies'/)
  assert.match(router, /put\('\/enterprise\/governance-policies\/:kind'/)
  assert.doesNotMatch(router, /patch|delete/i)
})

test('Enterprise writes use Access, tenant predicates, optimistic revision, Event and Audit', () => {
  assert.match(application, /action: 'company:read' \| 'company:update'/)
  assert.match(application, /company\.type !== 'EDUCATION'/)
  assert.match(application, /appendDomainEventInTransaction/)
  assert.match(application, /auditInTransaction/)
  assert.match(repository, /parent\.company_id=\$2 AND parent\.id=\$3/)
  assert.match(repository, /FROM organization_units WHERE company_id=\$1/)
  assert.match(repository, /WHERE governance_policies\.revision=\$7/)
  assert.match(repository, /company_id=\$1 AND kind=\$2/)
})
