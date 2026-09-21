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
    '../features/calendar/components/EventEditor.tsx',
    '../features/calendar/components/CalendarEventPeekContent.tsx',
    '../features/companies/components/InvitePeopleModal.tsx',
    '../components/WorkspaceChrome.tsx',
    '../features/knowledge/components/ProjectSourceLibrary.tsx',
    '../features/calendar/components/CalendarView.tsx',
    '../features/conversations/components/ConversationsPane.tsx',
  ]) assert.match(read(path), /confirmSensitiveAction|promptSensitiveAction/, `${path} bypasses Alert Dialog`)
})

test('approval decisions and user-triggered tasks publish through the global Toast manager', () => {
  const main = read('../main.tsx')
  const provider = read('../components/GlobalInteractionProvider.tsx')
  assert.match(main, /<GlobalInteractionProvider>/)
  assert.match(provider, /<Toaster \/>/)
  assert.match(provider, /<AlertDialog open=\{current !== null\}/)
  const approvals = read('../features/chat/runtime/transport.ts')
  assert.match(approvals, /toastAction\(\s*agentsApi\.resolveApproval/)
  assert.match(read('../features/calendar/components/EventEditor.tsx'), /toastAction\(runNow/)
  assert.match(read('../features/calendar/components/CalendarEventPeekContent.tsx'), /toastAction\(runEventNow/)
  assert.match(read('../features/email/components/EmailComposer.tsx'), /toastAction\(Promise\.resolve\(sendPromise\)/)
  assert.match(read('../lib/actionToast.ts'), /toast\.promise\(/)
  assert.match(read('../lib/actionToast.ts'), /\.unwrap\(\)/)
})

test('dashboard role changes and destructive actions confirm before mutation and preserve Toast lifecycle', () => {
  const members = read('../features/learning/dashboard/CourseMembersSection.tsx')
  const settings = read('../features/learning/dashboard/CourseSettingsSection.tsx')
  const reviews = read('../features/learning/components/LearningReviewsSection.tsx')
  const invitations = read('../features/companies/components/InvitePeopleModal.tsx')
  assert.match(members, /space\.perspective === 'teacher' && space\.canManage/)
  assert.match(members, /space\.canInviteMembers/)
  assert.match(members, /space\.canRevokeInvitations/)
  assert.match(members, /space\.canUpdateMembers/)
  assert.match(members, /space\.canRemoveMembers/)
  assert.match(members, /confirmSensitiveAction\([\s\S]*?toastAction\(learningApi\.removeCourseMember/)
  assert.match(members, /confirmSensitiveAction\([\s\S]*?toastAction\(learningApi\.revokeProjectInvitation/)
  assert.match(members, /confirmSensitiveAction\([\s\S]*?toastAction\(learningApi\.updateCourseMember/)
  assert.match(settings, /space\.perspective === 'teacher' && space\.canManage/)
  assert.match(settings, /space\.canUpdateCourse/)
  assert.match(settings, /confirmSensitiveAction\([\s\S]*?toastAction\(lifecycle\.run/)
  assert.match(reviews, /course\.perspective !== 'teacher' \|\| !course\.canManage/)
  assert.match(reviews, /confirmSensitiveAction\([\s\S]*?toastAction\(learningApi\.reviewEvaluation/)
  assert.match(read('../desktop/WorkspaceRail.tsx'), /toastAction\(learningApi\.createCourse/)
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

test('calendar editing uses the controlled Base UI Dialog without a handwritten modal shell', () => {
  const editor = read('../features/calendar/components/EventEditor.tsx')
  assert.match(editor, /<Dialog open onOpenChange=/)
  assert.match(editor, /<DialogContent[\s\S]*?<DialogTitle[\s\S]*?<DialogDescription/)
  assert.doesNotMatch(editor, /fixed inset-0|addEventListener\(['"]keydown/)
})
