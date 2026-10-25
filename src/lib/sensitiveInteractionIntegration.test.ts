import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (path: string) => readFileSync(resolve(here, path), 'utf8')

test('sensitive actions retain confirmation prompts', () => {
  for (const path of [
    '../features/canvas/components/CanvasView.tsx',
    '../features/documents/components/DocumentEditor.tsx',
    '../features/companies/components/InvitePeopleModal.tsx',
    '../components/WorkspaceChrome.tsx',
    '../features/course-materials/CourseMaterialsPage.tsx',
    '../features/conversations/components/ConversationsPane.tsx',
  ]) assert.match(read(path), /confirmSensitiveAction|promptSensitiveAction/, `${path} bypasses Alert Dialog`)
})

test('dashboard invitations and destructive actions confirm before mutation and preserve Toast lifecycle', () => {
  const members = read('../features/learning/dashboard/CourseMembersSection.tsx')
  const settings = read('../features/learning/dashboard/CourseSettingsSection.tsx')
  const invitations = read('../features/companies/components/InvitePeopleModal.tsx')
  assert.match(members, /space\.perspective === 'teacher' && space\.canManage/)
  assert.match(members, /space\.canInviteMembers/)
  assert.match(members, /space\.canRevokeInvitations/)
  assert.match(members, /space\.canRemoveMembers/)
  assert.match(members, /confirmSensitiveAction\([\s\S]*?toastAction\(learningApi\.createProjectInvitation/)
  assert.match(members, /confirmSensitiveAction\([\s\S]*?toastAction\(learningApi\.removeCourseMember/)
  assert.match(members, /confirmSensitiveAction\([\s\S]*?toastAction\(learningApi\.revokeProjectInvitation/)
  assert.match(settings, /space\.perspective === 'teacher' && space\.canManage/)
  assert.match(settings, /space\.canUpdateCourse/)
  assert.match(settings, /confirmSensitiveAction\([\s\S]*?toastAction\(lifecycle\.run/)
  assert.match(invitations, /confirmSensitiveAction\([\s\S]*?toastAction\(companiesApi\.revokeInvitation/)
  assert.match(invitations, /toastAction\(companiesApi\.createInvitation/)

})

test('platform administration routes sensitive commands through the shared dialog and Toast lifecycle', () => {
  const admin = read('../../admin/src/pages.tsx')
  assert.match(admin, /promptSensitiveAction\(/)
  assert.match(admin, /if \(reason === null\) return/)
  assert.match(admin, /disabled=\{pending\}/)
  assert.match(admin, /await toastAction\(adminFetch/)
  assert.doesNotMatch(admin, /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/)
})
