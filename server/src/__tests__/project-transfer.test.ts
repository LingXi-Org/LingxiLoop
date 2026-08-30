import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  confirmProjectTransferSchema,
  requestProjectTransferSchema,
  resolveProjectTransferSchema,
} from '../modules/transfers/contracts.js'
import { PROJECT_TRANSFER_MUTABLE_TABLES } from '../modules/transfers/repository.js'

const schema = readFileSync('server/src/db/schema.sql', 'utf8')
const repository = readFileSync('server/src/modules/transfers/repository.ts', 'utf8')
const application = readFileSync('server/src/modules/transfers/application.ts', 'utf8')
const router = readFileSync('server/src/modules/transfers/router.ts', 'utf8')
const projectsRouter = readFileSync('server/src/modules/projects/router.ts', 'utf8')
const policy = readFileSync('server/src/modules/access/policy.ts', 'utf8')

test('Project Transfer commands require bounded idempotency and explicit resolution reasons', () => {
  assert.equal(requestProjectTransferSchema.safeParse({
    targetCompanyId: 'education-1', idempotencyKey: 'request-1',
  }).success, true)
  assert.equal(requestProjectTransferSchema.safeParse({
    targetCompanyId: 'education-1', idempotencyKey: 'request-1', kind: 'INSTITUTIONAL_COURSE',
  }).success, false)
  assert.equal(confirmProjectTransferSchema.safeParse({ idempotencyKey: '' }).success, false)
  assert.equal(resolveProjectTransferSchema.safeParse({
    reason: '', idempotencyKey: 'reject-1',
  }).success, false)
})

test('Transfer owns the six command endpoints and generic lifecycle routes do not bypass it', () => {
  for (const endpoint of [
    'request-transfer',
    'confirm-transfer-owner',
    'confirm-transfer-education',
    'cancel-transfer',
    'reject-transfer',
    'complete-transfer',
  ]) assert.match(router, new RegExp(`/projects/:id/${endpoint}`))
  assert.doesNotMatch(projectsRouter, /request-transfer|cancel-transfer/)
})

test('only a Project OWNER and a target Education manager can provide the two confirmations', () => {
  assert.match(policy, /'project:request_transfer':[\s\S]{0,180}projectRoles: PROJECT_OWNERS/)
  assert.match(policy, /'project:cancel_transfer':[\s\S]{0,180}projectRoles: PROJECT_OWNERS/)
  assert.match(application, /confirmation === 'teacher'[\s\S]{0,500}action: 'project:request_transfer'/)
  assert.match(application, /action: 'company:update',[\s\S]{0,100}targetCompanyId/)
})

test('readiness is fail-closed on live Contract policy, version, legal basis, Membership and Seat', () => {
  assert.match(repository, /target\.type='EDUCATION' AND target\.status IN \('TRIAL','ACTIVE'\)/)
  assert.match(repository, /contract\.status IN \('TRIAL','ACTIVE'\)/)
  assert.match(repository, /transfer,enabled/)
  assert.match(repository, /transfer,policyVersion/)
  assert.match(repository, /transfer,legalBasis/)
  assert.match(repository, /LEFT JOIN company_memberships target_member/)
  assert.match(repository, /LEFT JOIN organization_seats seat/)
  assert.match(application, /projectTransferReadiness\(db, transfer\)[\s\S]{0,500}conditions_not_ready/)
})

test('completion covers every mutable direct Project tenant table and preserves historical ledgers', () => {
  const projectOwned = [...schema.matchAll(/CREATE TABLE public\.([a-z0-9_]+) \(([\s\S]*?)\n\);/g)]
    .filter(([, name, body]) => name !== 'projects' && name !== 'domain_events'
      && /\bcompany_id\b/.test(body ?? '') && /\bproject_id\b/.test(body ?? ''))
    .map(([, name]) => name)
    .sort()
  assert.deepEqual([...PROJECT_TRANSFER_MUTABLE_TABLES].sort(), projectOwned)
  assert.match(repository, /UPDATE projects SET company_id=\$3,kind='INSTITUTIONAL_COURSE',plan_id=NULL,[\s\S]{0,120}status='ACTIVE'/)
  assert.doesNotMatch(repository, /UPDATE (?:domain_events|audit_events|agent_runs|llm_calls|users|subscriptions)/)
  assert.doesNotMatch(repository, /INSERT INTO (?:projects|users)/)
  assert.match(schema, /domain_events_project_company_fkey\s+FOREIGN KEY \(project_id\) REFERENCES public\.projects\(id\)/)
  assert.match(schema, /attention_items_source_event_fkey\s+FOREIGN KEY \(source_event_sequence\)/)
  assert.match(schema, /attention_projection_events_source_fkey\s+FOREIGN KEY \(source_event_sequence\)/)
})

test('every explicit indirect ownership update targets a real tenant column', () => {
  const tableBodies = new Map(
    [...schema.matchAll(/CREATE TABLE public\.([a-z0-9_]+) \(([\s\S]*?)\n\);/g)]
      .map(([, name, body]) => [name!, body!] as const),
  )
  for (const update of repository.matchAll(/UPDATE\s+([a-z_]+)\s+SET\s+company_id=/g)) {
    const table = update[1]!
    assert.match(tableBodies.get(table) ?? '', /\bcompany_id\b/, table)
  }
})

test('completion preserves thread, case and Evidence identity while changing only tenant ownership', () => {
  const mutableTables = new Set<string>(PROJECT_TRANSFER_MUTABLE_TABLES)
  for (const table of ['context_threads', 'learning_cases', 'evidence_records']) {
    assert.ok(mutableTables.has(table), table)
  }
  for (const update of repository.matchAll(/UPDATE\s+[a-z_]+\s+SET\s+([\s\S]*?)\s+WHERE/gi)) {
    assert.doesNotMatch(update[1] ?? '', /(?:^|,)\s*(?:id|project_id)\s*=/)
  }
  assert.match(repository, /participant_copy[\s\S]*ON CONFLICT \(id,company_id\) DO NOTHING/)
})

test('Evidence reviewer ownership is constrained by Project Membership in the reset schema', () => {
  assert.match(schema, /evidence_claims_reviewer_project_fkey[\s\S]*FOREIGN KEY \(company_id, project_id, reviewed_by\)[\s\S]*REFERENCES public\.project_memberships/)
  assert.doesNotMatch(schema, /REFERENCES public\.users\(id, company_id\)/)
})
