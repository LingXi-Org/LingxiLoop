import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import {
  insertAcceptedStudentMembership,
  insertProjectInvitation,
} from '../modules/learning/invitations-repository.js'

test('ProjectInvite targets only a planned Teaching Project and grants Student membership', async () => {
  const statements: string[] = []
  const db: Queryable = {
    query: async <_T>(text: string): Promise<any> => {
      statements.push(text)
      return { rows: text.includes("kind='TEACHING'") ? [{ '?column?': 1 }] : [], rowCount: 1 }
    },
  }
  const created = await insertProjectInvitation(db, {
    tokenHash: 'token', projectId: 'project-1', companyId: 'company-1', userId: 'teacher-1',
    email: null, note: null, maxUses: 1, expiresAt: new Date('2026-09-01T00:00:00Z'),
  })
  await insertAcceptedStudentMembership(db, {
    invitation: { project_id: 'project-1', company_id: 'company-1' } as never,
    userId: 'student-1',
  })

  assert.equal(created, true)
  assert.match(statements[0] ?? '', /kind='TEACHING'.*plan_id IS NOT NULL/s)
  assert.match(statements.at(-1) ?? '', /VALUES \(\$1,\$2,\$3,'STUDENT'\)/)
})

test('ProjectInvite creation stops before mutation for a non-Teaching Project', async () => {
  const statements: string[] = []
  const db: Queryable = {
    query: async <_T>(text: string): Promise<any> => {
      statements.push(text)
      return { rows: [], rowCount: 0 }
    },
  }
  const created = await insertProjectInvitation(db, {
    tokenHash: 'token', projectId: 'project-1', companyId: 'company-1', userId: 'teacher-1',
    email: null, note: null, maxUses: 1, expiresAt: new Date('2026-09-01T00:00:00Z'),
  })

  assert.equal(created, false)
  assert.equal(statements.length, 1)
})
