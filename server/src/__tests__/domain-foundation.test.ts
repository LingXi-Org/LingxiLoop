import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  companyRoleFromWire,
  companyRoleToWire,
  projectRoleFromLearningWire,
  projectRoleToLearningWire,
} from '../domain/access/public.js'

const domainRoot = new URL('../domain/', import.meta.url)

async function sourceFiles(root: URL): Promise<URL[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), root)
    if (entry.isDirectory()) return sourceFiles(url)
    return entry.name.endsWith('.ts') ? [url] : []
  }))
  return nested.flat()
}

test('Permission has one canonical context-aware contract and no persistence model', async () => {
  const files = await sourceFiles(domainRoot)
  const definitions: string[] = []
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    if (/export type PermissionAction\b|export interface PermissionService\b/.test(source)) {
      definitions.push(file.pathname.replaceAll('\\', '/'))
    }
  }
  assert.equal(definitions.length, 1)
  assert.match(definitions[0]!, /\/access\/permission\.ts$/)
  const permission = await readFile(new URL('../domain/access/permission.ts', import.meta.url), 'utf8')
  assert.match(permission, /actorUserId: string[\s\S]*action: PermissionAction[\s\S]*companyId\?: string[\s\S]*projectId\?: string/)
  assert.match(permission, /can\(request: PermissionRequest\): Promise<PermissionDecision>/)
  assert.match(permission, /assertCan\(request: PermissionRequest\): Promise<ResolvedAccessContext>/)
  assert.match(permission, /context: ResolvedAccessContext \| null/)
  const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')
  assert.doesNotMatch(schema, /CREATE TABLE public\.permissions\b/)
})

test('User remains identity-only while contextual roles retain lowercase wire compatibility', async () => {
  const user = await readFile(new URL('../domain/identity/user.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(user, /\b(?:role|plan|isTeacher|isPro|isPaid|accountType|enterprise)\b/i)
  assert.equal(companyRoleFromWire('owner'), 'OWNER')
  assert.equal(companyRoleToWire('ADMIN'), 'admin')
  assert.equal(projectRoleFromLearningWire('learner'), 'STUDENT')
  assert.equal(projectRoleToLearningWire('OWNER'), 'teacher')
  assert.equal(projectRoleToLearningWire('OBSERVER'), 'learner')
})

test('Membership and Entitlement domain values remain separate concepts', async () => {
  const companyMembership = await readFile(new URL('../domain/tenancy/company-membership.ts', import.meta.url), 'utf8')
  const projectMembership = await readFile(new URL('../domain/project/project-membership.ts', import.meta.url), 'utf8')
  const planEntitlement = await readFile(new URL('../domain/entitlement/plan-entitlement.ts', import.meta.url), 'utf8')
  for (const field of ['id', 'companyId', 'userId']) assert.match(companyMembership, new RegExp(`${field}: string`))
  assert.match(companyMembership, /role: CompanyRole[\s\S]*status: MembershipStatus/)
  for (const field of ['id', 'companyId', 'projectId', 'userId']) assert.match(projectMembership, new RegExp(`${field}: string`))
  assert.match(projectMembership, /role: ProjectRole[\s\S]*status: MembershipStatus/)
  assert.match(planEntitlement, /boolean \| number \| string/)
  assert.doesNotMatch(planEntitlement, /Subscription|expiresAt|validUntil/)
})
