import assert from 'node:assert/strict'
import test from 'node:test'
import { getLearningDashboardMenu, isLearningDashboardSectionAvailable, learningSectionForView, viewForLearningSection, viewForWorkspace } from './navigation'

const learner = { perspective: 'learner' as const, canManage: false, courseId: 'course' }
const teacher = { perspective: 'teacher' as const, canManage: true, courseId: 'course' }

test('joined course menus are derived from the server perspective without a role switch', () => {
  assert.deepEqual(
    getLearningDashboardMenu(learner).map((item) => item.label),
    ['学习概览', '日历', '资料'],
  )
  assert.deepEqual(
    getLearningDashboardMenu(teacher).map((item) => item.label),
    ['学习概览', '日历', '资料', '基本资料', '课程内容', '成员与邀请', '课程状态'],
  )
  assert.deepEqual(getLearningDashboardMenu(teacher).filter((item) => !item.management).map((item) => item.label), ['学习概览', '日历', '资料'])
  assert.deepEqual(getLearningDashboardMenu(teacher).filter((item) => item.management).map((item) => item.label), ['基本资料', '课程内容', '成员与邀请', '课程状态'])
  assert.deepEqual(getLearningDashboardMenu(learner).filter((item) => item.management), [])
  assert.equal(isLearningDashboardSectionAvailable('learners', teacher), false)
  for (const section of ['settings', 'content', 'members', 'status'] as const) {
    assert.equal(isLearningDashboardSectionAvailable(section, learner), false)
    assert.equal(isLearningDashboardSectionAvailable(section, teacher), true)
    assert.equal(isLearningDashboardSectionAvailable(section, { ...teacher, canManage: false }), false)
    assert.equal(isLearningDashboardSectionAvailable(section, { ...teacher, courseId: undefined }), false)
  }
})

test('rail, notifications and workspace switches share the same view mapping', () => {
  for (const item of getLearningDashboardMenu(teacher)) {
    const view = viewForLearningSection(item.section)
    assert.equal(learningSectionForView(view), item.section)
    assert.equal(viewForWorkspace(view, teacher), view)
  }
  assert.deepEqual((['conversations', 'agents', 'mail', 'calendar', 'library', 'learning'] as const).map((view) => viewForWorkspace(view, learner)), ['conversations', 'agents', 'mail', 'calendar', 'library', 'learning'])
  assert.equal(viewForWorkspace('course-members', learner), 'learning')
  assert.equal(learningSectionForView('courses'), 'settings')
})
