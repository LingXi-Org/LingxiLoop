import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('teacher overview keeps learner and evidence detail behind the controlled dialog', () => {
  const dashboard = read('./dashboard/TeacherOverviewDashboard.tsx')
  const roster = read('./dashboard/TeacherLearnersSection.tsx')
  const detail = read('./dashboard/TeacherLearningDetailDialog.tsx')

  assert.match(dashboard, /useState<TeacherDetailView \| null>/)
  assert.match(dashboard, /space\.canReview \? \(/)
  assert.doesNotMatch(roster, /getLearner|getAttempt|listEvidence|listMissions/)
  assert.match(detail, /learningApi\.getLearner\(projectId, learnerId\)/)
  assert.match(detail, /learningApi\.getAttempt\(projectId, attemptId\)/)
  assert.match(detail, /detail\.evidence\.data/)
  assert.match(detail, /evaluation\.rubricResults/)
  assert.match(detail, /reason\.trim\(\)/)
  assert.match(detail, /confirmSensitiveAction/)
  assert.match(detail, /toastAction/)
})

test('teacher dashboard writes require teacher management plus the matching capability', () => {
  const members = read('./dashboard/CourseMembersSection.tsx')
  const settings = read('./dashboard/CourseSettingsSection.tsx')
  const activities = read('./components/LearningActivitiesSection.tsx')
  const objectives = read('./components/LearningObjectivesSection.tsx')
  const reviews = read('./components/LearningReviewsSection.tsx')

  assert.match(members, /space\.perspective === 'teacher' && space\.canManage/)
  assert.match(members, /space\.canInviteMembers/)
  assert.match(members, /space\.canRevokeInvitations/)
  assert.match(members, /space\.canUpdateMembers/)
  assert.match(members, /space\.canRemoveMembers/)
  assert.match(members, /if \(busy \|\| !canInvite\) return/)
  assert.match(members, /if \(!space\.courseId \|\| busy \|\| !canRemove\) return/)
  assert.match(members, /if \(busy \|\| !canRevoke\) return/)
  assert.match(members, /if \(!space\.courseId \|\| busy \|\| !canUpdate \|\| role === member\.role\) return/)
  assert.match(members, /learningApi\.updateCourseMember\(space\.courseId, member\.id, role\)/)
  assert.match(settings, /space\.perspective === 'teacher' && space\.canManage/)
  assert.match(settings, /const canEdit = canView && space\.canUpdateCourse/)
  assert.match(settings, /space\.lifecycleAction/)
  assert.match(settings, /ENTER_RETENTION/)
  assert.match(activities, /perspective !== 'teacher'\s*\|\|\s*!course\.canManage\s*\|\|\s*!course\.canEditContent/)
  assert.match(activities, /perspective !== 'learner' \|\| !course\.canSubmit/)
  assert.match(objectives, /perspective !== 'teacher'\s*\|\|\s*!course\.canManage\s*\|\|\s*!course\.canEditContent/)
  assert.match(reviews, /course\.perspective !== 'teacher' \|\| !course\.canManage \|\| !course\.canReview/)
})
