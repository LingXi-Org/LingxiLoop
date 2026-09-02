import assert from 'node:assert/strict'
import test from 'node:test'
import { getLearningDashboardMenu, isLearningDashboardSectionAvailable } from './navigation'

test('personal learning menu contains only the requested destinations in order', () => {
  assert.deepEqual(
    getLearningDashboardMenu({ personal: true, perspective: 'learner' }).map((item) => item.label),
    ['概览', '日历', '资料'],
  )
})

test('joined course menus are derived from the server perspective without a role switch', () => {
  assert.deepEqual(
    getLearningDashboardMenu({ personal: false, perspective: 'learner' }).map((item) => item.label),
    ['概览', '日历', '资料'],
  )
  assert.deepEqual(
    getLearningDashboardMenu({ personal: false, perspective: 'teacher' }).map((item) => item.label),
    ['总览', '日历', '资料', '课程设置'],
  )
  assert.equal(isLearningDashboardSectionAvailable('learners', { personal: false, perspective: 'teacher' }), false)
  assert.equal(isLearningDashboardSectionAvailable('settings', { personal: false, perspective: 'learner' }), false)
  assert.equal(isLearningDashboardSectionAvailable('settings', { personal: false, perspective: 'teacher' }), true)
})
