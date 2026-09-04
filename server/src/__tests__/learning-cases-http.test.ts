import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  applyLearningCaseActionRequestSchema,
  createLearningCaseRequestSchema,
  learningCaseParamsSchema,
  listLearningCasesQuerySchema,
} from '../modules/learning/cases-contracts.js'

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

test('Case HTTP schemas keep uppercase enums, bounded IDs and strict bounded payloads', () => {
  assert.equal(listLearningCasesQuerySchema.safeParse({ status: 'detected' }).success, false)
  assert.equal(listLearningCasesQuerySchema.safeParse({ status: 'DETECTED', limit: '100' }).success, true)
  assert.equal(listLearningCasesQuerySchema.safeParse({ limit: '101' }).success, false)
  assert.equal(learningCaseParamsSchema.safeParse({ projectId: 'p'.repeat(201), caseId: 'case-1' }).success, false)

  assert.equal(createLearningCaseRequestSchema.safeParse({
    userId: 'learner-1', knowledgeUnitId: 'unit-1', reason: 'x'.repeat(2_001),
  }).success, false)
  assert.equal(createLearningCaseRequestSchema.safeParse({
    userId: 'learner-1', knowledgeUnitId: 'unit-1', reason: 'gap', extra: true,
  }).success, false)

  assert.equal(applyLearningCaseActionRequestSchema.safeParse({
    kind: 'diagnose', expectedVersion: 1, idempotencyKey: 'request-1',
  }).success, false)
  assert.equal(applyLearningCaseActionRequestSchema.safeParse({
    kind: 'DIAGNOSE', expectedVersion: 1, idempotencyKey: 'request-1',
  }).success, true)
  assert.equal(applyLearningCaseActionRequestSchema.safeParse({
    kind: 'DIAGNOSE', expectedVersion: 1, idempotencyKey: 'x'.repeat(201),
  }).success, false)
})

test('Case routes expose the canonical Project surface once with create status semantics', () => {
  const router = source('../modules/learning/cases-router.ts')
  const learningRouter = source('../modules/learning/router.ts')
  const facade = source('../modules/learning/facade.ts')

  assert.match(router, /\.get\('\/projects\/:projectId\/learning\/cases'/)
  assert.match(router, /\.post\('\/projects\/:projectId\/learning\/cases'/)
  assert.match(router, /\.get\('\/projects\/:projectId\/learning\/cases\/:caseId'/)
  assert.match(router, /\.post\('\/projects\/:projectId\/learning\/cases\/:caseId\/actions'/)
  assert.match(router, /requireAuth\(req\)/)
  assert.match(router, /requestedCompanyId\(req\)/)
  assert.match(router, /parseLearningRequest as parse/)
  assert.match(router, /respondWithLearning as respond/)
  assert.match(router, /res\.status\(result\.created \? 201 : 200\)\.json\(result\)/)
  assert.doesNotMatch(router, /permissionService|requireCompany|courseId|\/courses/)

  assert.equal((learningRouter.match(/learningRouter\.use\(learningCasesRouter\)/g) ?? []).length, 1)
  assert.match(facade, /new LearningCasesApplication\(pool/)
  assert.match(facade, /transaction: \(work\) => withTransaction\(pool, work\)/)
  assert.match(facade, /auditInTransaction: async \(db, event\)/)
})
