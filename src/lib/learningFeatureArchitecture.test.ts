import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const dashboardUrl = (name: string) => new URL(`../features/learning/dashboard/${name}`, import.meta.url)
const componentUrl = (name: string) => new URL(`../features/learning/components/${name}`, import.meta.url)
const readDashboard = (name: string) => readFileSync(dashboardUrl(name), 'utf8')
const readComponent = (name: string) => readFileSync(componentUrl(name), 'utf8')

test('learning dashboard is composed from bounded role-aware sections', () => {
  const shell = readDashboard('LearningDashboardPanel.tsx')
  const teacherDashboard = readDashboard('TeacherOverviewDashboard.tsx')
  const sections = [
    'DashboardSectionFrame.tsx',
    'LearnerOverviewDashboard.tsx',
    'TeacherDashboardSummary.tsx',
    'TeacherLearnersSection.tsx',
    'TeacherLearningDetailDialog.tsx',
    'TeacherOverviewDashboard.tsx',
    'CourseSettingsSection.tsx',
    'CourseProfileSettings.tsx',
    'CourseContentSettings.tsx',
  ]

  assert.ok(shell.split('\n').length < 250)
  for (const section of sections) {
    const source = readDashboard(section)
    assert.ok(source.split('\n').length < 500, `${section} must keep one bounded section owner`)
  }
  const learnerOverview = readDashboard('LearnerOverviewDashboard.tsx')
  for (const section of ['LearnerDashboardSummary.tsx', 'MissionSection.tsx']) {
    const source = readDashboard(section)
    assert.match(learnerOverview, new RegExp(section.replace('.tsx', '')))
    assert.ok(source.split('\n').length < 500, `${section} must keep one bounded section owner`)
  }
  assert.match(shell, /LearnerOverviewDashboard/)
  assert.match(shell, /TeacherOverviewDashboard/)
  assert.match(teacherDashboard, /TeacherLearnersSection/)
  assert.match(teacherDashboard, /TeacherLearningDetailDialog/)
  assert.match(shell, /space\.perspective/)
  assert.match(readDashboard('navigation.ts'), /PERSONAL_MENU[\s\S]*LEARNER_MENU[\s\S]*TEACHER_MENU/)
})

test('learning dashboard composes the required official data primitives', () => {
  const dashboardSource = [
    'LearningDashboardPanel.tsx',
    'DashboardSectionFrame.tsx',
    'LearnerOverviewDashboard.tsx',
    'LearnerDashboardSummary.tsx',
    'TeacherDashboardSummary.tsx',
    'MissionSection.tsx',
    'TeacherLearnersSection.tsx',
    'TeacherLearningDetailDialog.tsx',
    'TeacherOverviewDashboard.tsx',
    'CourseMembersSection.tsx',
    'CourseSettingsSection.tsx',
    'CourseProfileSettings.tsx',
    'CourseContentSettings.tsx',
  ].map(readDashboard).join('\n')
  const reusableSource = [
    'LearningObjectivesSection.tsx',
    'LearningActivitiesSection.tsx',
    'LearningEvidenceSection.tsx',
    'LearningReviewsSection.tsx',
    'learningDisplay.tsx',
  ].map(readComponent).join('\n')
  const source = `${dashboardSource}\n${reusableSource}`

  assert.equal(existsSync(componentUrl('LearningPrimitives.tsx')), false)
  assert.equal(existsSync(componentUrl('LearningCenter.tsx')), false)
  assert.doesNotMatch(source, /<(?:button|select)\b|<input\b[^>]*type=['"]checkbox['"]/)
  assert.doesNotMatch(source, /\b(?:bg-app|bg-panel|bg-raised|text-ink|border-hairline)\b/)
  for (const primitive of ['card', 'button', 'chart', 'table', 'progress', 'pagination', 'dialog', 'empty', 'input-group']) {
    assert.match(source, new RegExp(`@/components/ui/${primitive}`))
  }
  assert.match(source, /@\/components\/ResourceSkeleton/)
  assert.doesNotMatch(source, /学习空间|教师|String\(reason\)/)
})

test('retired learning center modules are not kept beside the dashboard', () => {
  for (const name of [
    'LearningCenter.tsx',
    'LearningCenterHeader.tsx',
    'LearningSetup.tsx',
    'LearningTodaySection.tsx',
    'LearningNotificationsSection.tsx',
  ]) assert.equal(existsSync(componentUrl(name)), false, `${name} should stay removed`)
  assert.equal(existsSync(new URL('../features/learning/hooks/useLearningCenter.ts', import.meta.url)), false)
  assert.equal(existsSync(new URL('../features/companies/components/CompanyCourseManagement.tsx', import.meta.url)), false)
})
