import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { LearningSpace } from '@/features/learning/contracts'
import { getLearningSpaceScopes } from './dashboardScope'

test('learning spaces keep the default personal area first and preserve course order', () => {
  const course = {
    companyId: 'company', projectId: 'course', projectKind: 'TEACHING', courseId: 'course-id',
    title: '课程', description: '', color: null, status: 'ACTIVE', perspective: 'teacher',
    canManage: true, canEditContent: true, canUpdateCourse: true, canInviteMembers: true,
    canRevokeInvitations: true, canRemoveMembers: true, canSubmit: false, canReview: true,
    lifecycleAction: 'END', studyRoomId: null, isDefault: false, lastVisitedAt: null,
  } satisfies LearningSpace
  const personal = {
    ...course, projectId: 'personal', projectKind: 'PERSONAL_LEARNING', courseId: undefined,
    title: '个人学习区', perspective: 'learner', canManage: false, canEditContent: false,
    canUpdateCourse: false, canInviteMembers: false, canRevokeInvitations: false,
    canRemoveMembers: false, canSubmit: false, canReview: false, lifecycleAction: null, isDefault: true,
  } satisfies LearningSpace

  const scopes = getLearningSpaceScopes([course, personal])
  assert.equal(scopes.personal, personal)
  assert.deepEqual(scopes.courses, [course])
})

test('dashboard scope switching locks learning and resource panels to the selected workspace', () => {
  const dashboard = readFileSync(new URL('./PersonalDashboard.tsx', import.meta.url), 'utf8')
  const panel = readFileSync(new URL('../features/learning/dashboard/LearningDashboardPanel.tsx', import.meta.url), 'utf8')
  const dashboardData = readFileSync(new URL('../features/learning/dashboard/useLearningDashboardData.ts', import.meta.url), 'utf8')
  const workspaceStore = readFileSync(new URL('../features/knowledge/workspace.ts', import.meta.url), 'utf8')

  assert.match(dashboard, /切换个人学习区或课程/)
  assert.match(dashboard, /scopes\.personal[\s\S]*?scopes\.courses\.map/)
  assert.match(dashboard, /MAX_SPACE_PAGES/)
  assert.match(dashboard, /learningApi\.listSpaces\(\{ cursor, limit: 100 \}\)/)
  assert.match(dashboard, /key=\{activeSpace\.projectId\}/)
  assert.match(dashboard, /selectLearningSpace\(\{ companyId: target\.companyId, projectId: target\.projectId \}\)/)
  assert.doesNotMatch(dashboard, /activeSpace[\s\S]{0,160}\?\?\s*scopes\.personal/)
  assert.match(panel, /useLearningDashboardData\(space\.projectId, space\.perspective, space\.canReview\)/)
  assert.match(panel, /section === 'overview' && space\.perspective === 'learner'/)
  assert.match(panel, /space\.studyRoomId[\s\S]*conversations\.find[\s\S]*conversations\[0\]/)
  assert.match(panel, /useApp\.getState\(\)\.selectConversation\(learningConversationId\)/)
  assert.match(panel, /继续学习对话/)
  assert.match(dashboardData, /overviewRequestEpoch[\s\S]*resourcesRequestEpoch/)
  assert.match(dashboardData, /requestEpoch !== overviewRequestEpoch\.current/)
  assert.match(dashboardData, /requestEpoch !== resourcesRequestEpoch\.current/)
  assert.match(workspaceStore, /useCalendar\.getState\(\)\.reset\(\)/)
  assert.match(workspaceStore, /useDocuments\.getState\(\)\.reset\(\)/)
})

test('dashboard exposes one learning-space selector and no mail placeholder or role switch', () => {
  const dashboard = readFileSync(new URL('./PersonalDashboard.tsx', import.meta.url), 'utf8')
  const desktop = readFileSync(new URL('./DesktopApp.tsx', import.meta.url), 'utf8')
  const rail = readFileSync(new URL('./WorkspaceRail.tsx', import.meta.url), 'utf8')
  const appStore = readFileSync(new URL('../stores/app.ts', import.meta.url), 'utf8')
  const types = readFileSync(new URL('../types.ts', import.meta.url), 'utf8')

  assert.equal(dashboard.match(/<Select\b/g)?.length, 1)
  assert.doesNotMatch(dashboard, /MailPage|邮件收件箱|CompanyCourseManagement|LearningCenter/)
  assert.doesNotMatch(dashboard, /<Drawer\b|<Sheet\b/)
  assert.match(rail, /aria-label="打开学习看板"[\s\S]*onOpenDashboard\(\)/)
  assert.match(desktop, /rounded-2xl bg-card[\s\S]*dashboardOpen \? \([\s\S]*<PersonalDashboard/)
  assert.doesNotMatch(dashboard, /Projects|组织|Trust|切换角色/)
  assert.doesNotMatch(appStore, /openTrust|trustProjectId/)
  assert.doesNotMatch(types, /\| 'trust'/)
})
