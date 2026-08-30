import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { ProjectKind, WorkspaceSummary } from '@/types'
import { getDashboardScopes, getDefaultDashboardWorkspace } from './dashboardScope'

function workspace(id: string, kind: ProjectKind, isDefault = false): WorkspaceSummary {
  return {
    id,
    companyId: 'company',
    kind,
    planId: null,
    name: id,
    description: '',
    color: null,
    status: 'ACTIVE',
    createdBy: 'user',
    isDefault,
    createdAt: '',
    updatedAt: '',
    archivedAt: null,
    lastVisitedAt: null,
    sourceCount: 0,
    conversationCount: 0,
    documentCount: 0,
    calendarEventCount: 0,
    canvasCount: 0,
    canManage: false,
  }
}

test('dashboard separates the personal learning page from course pages', () => {
  const personal = workspace('personal', 'PERSONAL_LEARNING', true)
  const courseA = workspace('course-a', 'TEACHING')
  const courseB = workspace('course-b', 'INSTITUTIONAL_COURSE')
  const scopes = getDashboardScopes([personal, courseA, courseB])

  assert.equal(scopes.personal, personal)
  assert.deepEqual(scopes.courses, [courseA, courseB])
  assert.equal(getDefaultDashboardWorkspace(scopes.visible, personal.id), courseA)
  assert.equal(getDefaultDashboardWorkspace(scopes.visible, courseB.id), courseB)
  assert.equal(getDefaultDashboardWorkspace([personal], personal.id), personal)
})

test('dashboard scope switching locks learning and resource panels to the selected workspace', () => {
  const dashboard = readFileSync(new URL('./PersonalDashboard.tsx', import.meta.url), 'utf8')
  const learning = readFileSync(new URL('../features/learning/hooks/useLearningCenter.ts', import.meta.url), 'utf8')
  const workspaceStore = readFileSync(new URL('../features/knowledge/workspace.ts', import.meta.url), 'utf8')

  assert.match(dashboard, /切换个人学习区或课程/)
  assert.match(dashboard, /scopes\.personal[\s\S]*?scopes\.courses\.map/)
  assert.match(dashboard, /<LearningCenter workspaceId=\{workspaceId\}/)
  assert.match(dashboard, /key=\{activeWorkspace\.id\}/)
  assert.match(learning, /if \(lockedProjectId\) return lockedProjectId/)
  assert.match(workspaceStore, /useCalendar\.getState\(\)\.reset\(\)/)
  assert.match(workspaceStore, /useDocuments\.getState\(\)\.reset\(\)/)
})

test('dashboard exposes only course capabilities and has no Trust route', () => {
  const dashboard = readFileSync(new URL('./PersonalDashboard.tsx', import.meta.url), 'utf8')
  const courseManagement = readFileSync(new URL('../features/companies/components/CompanyCourseManagement.tsx', import.meta.url), 'utf8')
  const appStore = readFileSync(new URL('../stores/app.ts', import.meta.url), 'utf8')
  const types = readFileSync(new URL('../types.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(dashboard, /Projects|组织|Trust/)
  assert.doesNotMatch(courseManagement, /CourseManagementSection|activeSection|组织资料|组织成员/)
  assert.doesNotMatch(appStore, /openTrust|trustProjectId/)
  assert.doesNotMatch(types, /\| 'trust'/)
})
