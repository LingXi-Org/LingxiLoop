import assert from 'node:assert/strict'
import test from 'node:test'
import { getLearningDashboardMenu, learningSectionForView, viewForLearningSection, viewForWorkspace } from './navigation'

test('course materials has one course-scoped entry for students and teachers', () => {
  for (const perspective of ['learner', 'teacher'] as const) {
    const space = { courseId: 'course-a', perspective, canManage: perspective === 'teacher' }
    const entries = getLearningDashboardMenu(space).filter(item => item.section === 'materials')
    assert.equal(entries.length, 1)
    assert.equal(entries[0].label, '课程资料')
    assert.equal(viewForLearningSection(entries[0].section), 'course-materials')
    assert.equal(learningSectionForView('course-materials'), 'materials')
    assert.equal(viewForWorkspace('course-materials', space), 'course-materials')
    assert.equal(viewForWorkspace('forum', space), 'forum')
  }
})

test('switching away from a course cannot keep the course materials page', () => {
  const space = { courseId: undefined, perspective: 'learner' as const, canManage: false }
  assert.equal(getLearningDashboardMenu(space).some(item => item.section === 'materials'), false)
  assert.equal(viewForWorkspace('course-materials', space), 'learning')
})
