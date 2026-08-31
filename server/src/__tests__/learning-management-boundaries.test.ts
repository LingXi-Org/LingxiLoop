import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { changeCourseMember } from '../modules/learning/courses-repository.js'
import { LearningInvitationApplication } from '../modules/learning/invitation-application.js'

function memberChangeDb(input: {
  currentRole: 'OWNER' | 'TEACHER' | 'STUDENT'
  ownerCount?: number
  courseCreator?: string
  projectCreator?: string | null
}) {
  const calls: Array<{ text: string; params?: readonly unknown[] }> = []
  const db = {
    async query<T>(text: string, params?: readonly unknown[]) {
      calls.push({ text, params })
      if (text.includes('FROM courses course JOIN projects project')) {
        return { rows: [{
          project_id: 'project-1',
          course_created_by: input.courseCreator ?? 'creator-1',
          project_created_by: input.projectCreator ?? 'creator-1',
        }] as T[], rowCount: 1 }
      }
      if (text.includes('SELECT role FROM project_memberships')) {
        return { rows: [{ role: input.currentRole }] as T[], rowCount: 1 }
      }
      if (text.includes("role='OWNER'")) {
        return { rows: [{ count: input.ownerCount ?? 1 }] as T[], rowCount: 1 }
      }
      if (text.includes("role IN ('OWNER','TEACHER')")) {
        return { rows: [{ count: 2 }] as T[], rowCount: 1 }
      }
      return { rows: [] as T[], rowCount: 1 }
    },
  } as Queryable
  return { db, calls }
}

test('course membership changes lock the owner facts and preserve the final OWNER', async () => {
  const { db, calls } = memberChangeDb({ currentRole: 'OWNER', ownerCount: 1 })
  const outcome = await changeCourseMember(db, {
    courseId: 'course-1', companyId: 'company-1', userId: 'owner-1', role: 'learner',
  })

  assert.equal(outcome, 'last_owner')
  assert.match(calls[0]?.text ?? '', /FOR UPDATE OF course,project/)
  assert.match(calls[1]?.text ?? '', /FOR UPDATE/)
  assert.equal(calls.some((call) => /UPDATE project_memberships|DELETE FROM project_memberships/.test(call.text)), false)
})

test('course OWNER and creator remain protected even when another manager exists', async () => {
  const owner = memberChangeDb({ currentRole: 'OWNER', ownerCount: 2 })
  assert.equal(await changeCourseMember(owner.db, {
    courseId: 'course-1', companyId: 'company-1', userId: 'owner-1', role: 'teacher',
  }), 'protected_owner')

  const creator = memberChangeDb({
    currentRole: 'TEACHER', ownerCount: 1, courseCreator: 'creator-1', projectCreator: 'creator-1',
  })
  assert.equal(await changeCourseMember(creator.db, {
    courseId: 'course-1', companyId: 'company-1', userId: 'creator-1', role: null,
  }), 'protected_creator')
  assert.equal(creator.calls.some((call) => /DELETE FROM project_memberships/.test(call.text)), false)
})

function invitationDb() {
  const calls: Array<{ text: string; inTransaction: boolean }> = []
  let inTransaction = false
  const db = {
    async query<T>(text: string) {
      calls.push({ text, inTransaction })
      if (text.includes('SELECT id,deleted_at,suspended_at FROM users')) {
        return { rows: [{ id: 'teacher-1', deleted_at: null, suspended_at: null }] as T[], rowCount: 1 }
      }
      if (text.includes('SELECT id,company_id,kind,plan_id,status FROM projects')) {
        return { rows: [{
          id: 'project-1', company_id: 'company-1', kind: 'TEACHING',
          plan_id: 'plan-1', status: 'ACTIVE',
        }] as T[], rowCount: 1 }
      }
      if (text.includes('SELECT id,type,status,plan_id FROM companies')) {
        return { rows: [{
          id: 'company-1', type: 'PERSONAL', status: 'ACTIVE', plan_id: 'plan-1',
        }] as T[], rowCount: 1 }
      }
      if (text.includes('SELECT role,status FROM company_memberships')) {
        return { rows: [{ role: 'MEMBER', status: 'ACTIVE' }] as T[], rowCount: 1 }
      }
      if (text.includes('SELECT role,status FROM project_memberships')) {
        return { rows: [{ role: 'TEACHER', status: 'ACTIVE' }] as T[], rowCount: 1 }
      }
      if (text.includes('SELECT id,code,status FROM plans')) {
        return { rows: [{ id: 'plan-1', code: 'TEACHER_FREE', status: 'ACTIVE' }] as T[], rowCount: 1 }
      }
      if (text.includes('FROM plan_entitlements')) {
        return { rows: [
          { code: 'project.members.manage', value: true },
          { code: 'learning.core', value: true },
        ] as T[], rowCount: 2 }
      }
      if (text.includes("kind='TEACHING'")) return { rows: [{ '?column?': 1 }] as T[], rowCount: 1 }
      return { rows: [] as T[], rowCount: text.startsWith('UPDATE project_invitations') ? 1 : 1 }
    },
  } as Queryable
  const transaction = async <T>(work: (client: Queryable) => Promise<T>) => {
    inTransaction = true
    try { return await work(db) }
    finally { inTransaction = false }
  }
  return { db, calls, transaction }
}

test('project invitation create and revoke revalidate and lock teacher membership inside the transaction', async () => {
  const fixture = invitationDb()
  const application = new LearningInvitationApplication(fixture.db, {
    transaction: fixture.transaction,
    auditInTransaction: async () => {},
    generateInvitationToken: () => 'token-1',
    hashInvitationToken: () => 'hash-1',
    invitationUrl: () => 'https://app.test/invite/token-1',
    avatarForEmail: () => 'https://avatar.test/teacher',
  })
  const scope = { companyId: 'company-1', projectId: 'project-1', userId: 'teacher-1' }

  await application.create(scope, { email: null, note: null, expiresInDays: 7, maxUses: 1 })
  await application.revoke(scope, 'hash-1')

  const membershipLocks = fixture.calls.filter((call) =>
    call.text.includes('SELECT role,status FROM project_memberships'),
  )
  assert.equal(membershipLocks.length, 2)
  assert.ok(membershipLocks.every((call) => call.inTransaction && /FOR UPDATE/.test(call.text)))
  const invitationWrites = fixture.calls.filter((call) =>
    /INSERT INTO project_invitations|UPDATE project_invitations SET revoked_at/.test(call.text),
  )
  assert.ok(invitationWrites.every((call) => call.inTransaction))
})
