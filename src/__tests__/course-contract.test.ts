import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeCourseContract } from '../features/learning/courseContract.js'

test('course responses are strict and never receive production mock defaults', () => {
  assert.throws(() => normalizeCourseContract({
    id: 'course-contract', companyId: 'company-contract', projectId: 'project-contract', name: 'Contract course',
  }), /description is required/)

  const course = {
    id: 'course-contract', companyId: 'company-contract', projectId: 'project-contract', name: 'Contract course',
    description: '', color: '#5266d6', status: 'active' as const, createdBy: 'user-1', studyRoomId: null,
    courseRole: 'teacher' as const, memberCount: 8, canManage: true,
  }
  assert.equal(normalizeCourseContract(course), course)
})
