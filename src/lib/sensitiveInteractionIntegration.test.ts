import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const srcRoot = resolve(here, '..')
const read = (path: string) => readFileSync(resolve(here, path), 'utf8')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') ? [path] : []
  })
}

test('Alert Dialog remains shaped like the official Luma Radix primitive', () => {
  const source = read('../components/ui/alert-dialog.tsx')
  assert.match(source, /AlertDialog as AlertDialogPrimitive.*from "radix-ui"/)
  for (const slot of [
    'alert-dialog', 'alert-dialog-trigger', 'alert-dialog-portal',
    'alert-dialog-overlay', 'alert-dialog-content', 'alert-dialog-header',
    'alert-dialog-footer', 'alert-dialog-media', 'alert-dialog-title',
    'alert-dialog-description', 'alert-dialog-action', 'alert-dialog-cancel',
  ]) assert.ok(source.includes(`data-slot="${slot}"`), `missing ${slot}`)
  assert.match(source, /rounded-4xl bg-popover/)
  assert.match(source, /<Button variant=\{variant\} size=\{size\} asChild>/)
})

test('Toast remains the official Luma sonner composition', () => {
  const source = read('../components/ui/sonner.tsx')
  assert.match(source, /from "sonner"/)
  assert.match(source, /@hugeicons\/react/)
  assert.match(source, /--normal-bg.*var\(--popover\)/s)
  assert.match(source, /toast: "cn-toast"/)
})

test('production code never uses native alert, confirm, or prompt', () => {
  const nativeDialogUsers = sourceFiles(srcRoot).filter((path) => {
    const source = readFileSync(path, 'utf8')
    return /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(source)
  })
  assert.deepEqual(nativeDialogUsers, [], `native browser dialog found in: ${nativeDialogUsers.join(', ')}`)

  for (const path of [
    '../features/canvas/components/CanvasView.tsx',
    '../features/documents/components/DocumentEditor.tsx',
    '../features/calendar/components/EventEditor.tsx',
    '../features/calendar/components/CalendarEventPeekContent.tsx',
    '../features/companies/components/InvitePeopleModal.tsx',
    '../components/WorkspaceChrome.tsx',
    '../features/knowledge/components/ProjectSourceLibrary.tsx',
    '../features/knowledge/components/PersonalSourceDrive.tsx',
    '../features/calendar/components/CalendarView.tsx',
    '../features/conversations/components/ConversationsPane.tsx',
    '../features/settings/DataAccountSettingsPanel.tsx',
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
  assert.match(members, /space\.canRemoveMembers/)
  assert.match(members, /confirmSensitiveAction\([\s\S]*?toastAction\(learningApi\.removeCourseMember/)
  assert.match(members, /confirmSensitiveAction\([\s\S]*?toastAction\(learningApi\.revokeProjectInvitation/)
  assert.match(settings, /space\.perspective === 'teacher' && space\.canManage/)
  assert.match(settings, /space\.canUpdateCourse/)
  assert.match(settings, /confirmSensitiveAction\([\s\S]*?toastAction\(lifecycle\.run/)
  assert.match(reviews, /course\.perspective !== 'teacher' \|\| !course\.canManage/)
  assert.match(reviews, /confirmSensitiveAction\([\s\S]*?toastAction\(learningApi\.reviewEvaluation/)
  assert.match(read('../desktop/WorkspaceRail.tsx'), /toastAction\(learningApi\.createCourse/)
  assert.match(invitations, /confirmSensitiveAction\([\s\S]*?toastAction\(companiesApi\.revokeInvitation/)
  assert.match(invitations, /toastAction\(companiesApi\.createInvitation/)
  const drive = read('../features/knowledge/components/PersonalSourceDrive.tsx')
  assert.match(drive, /confirmSensitiveAction\([\s\S]*toastAction\(knowledgeApi\.archiveProject/)
  assert.match(drive, /confirmSensitiveAction\([\s\S]*knowledgeApi\.archiveProject[\s\S]*knowledgeApi\.deleteProject[\s\S]*toastAction\(deletion/)
})

test('settings confirms account deletion before the API call, Toasts the lifecycle, then clears auth', () => {
  const settings = read('../features/settings/DataAccountSettingsPanel.tsx')
  assert.match(
    settings,
    /const confirmation = await promptSensitiveAction\([\s\S]*?if \(confirmation === null\) return[\s\S]*?confirmation !== ACCOUNT_DELETE_CONFIRMATION[\s\S]*?await toastAction\(authApi\.deleteAccount\(\)[\s\S]*?useAuth\.getState\(\)\.clear\(\)/,
  )
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

test('repository skill requires Alert Dialog and Toast for future sensitive work', () => {
  const skill = read('../../.agents/skills/lingxiloop-sensitive-interactions/SKILL.md')
  assert.match(skill, /confirmSensitiveAction/)
  assert.match(skill, /promptSensitiveAction/)
  assert.match(skill, /Never use native `confirm\(\)`/)
  assert.match(skill, /Approval cards must Toast both approve and reject paths/)
  assert.match(skill, /user-triggered task dispatch/i)
})
