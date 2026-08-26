import assert from 'node:assert/strict'
import { test } from 'node:test'

test('production and mock courses share one explicit normalized contract', async () => {
  const { normalizeCourseContract } = await import('../api/courseContract.js')
  const normalized = normalizeCourseContract({
    id: 'course-contract', companyId: 'company-contract', projectId: 'project-contract',
    name: 'Contract course', courseRole: 'teacher', canManage: true,
    memberCount: 8, studyRoomId: 'room-contract',
  })
  assert.deepEqual(normalized, {
    id: 'course-contract', companyId: 'company-contract', projectId: 'project-contract',
    name: 'Contract course', description: '', color: '#5266d6', status: 'active',
    createdBy: 'mock-user', studyRoomId: 'room-contract', companyRole: undefined,
    courseRole: 'teacher', memberCount: 8, canManage: true, createdAt: undefined, updatedAt: undefined,
  })
})
