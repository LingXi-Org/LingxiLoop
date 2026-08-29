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
    '../features/admin/components/UsersPage.tsx',
    '../features/admin/components/WaitlistPage.tsx',
    '../features/admin/components/SettingsPage.tsx',
    '../features/canvas/components/CanvasView.tsx',
    '../features/documents/components/DocumentEditor.tsx',
    '../features/calendar/components/EventEditor.tsx',
    '../features/calendar/components/CalendarEventPeekContent.tsx',
    '../features/companies/components/InvitePeopleModal.tsx',
    '../components/WorkspaceChrome.tsx',
    '../features/boards/components/BoardsView.tsx',
    '../features/boards/components/BoardCardDialog.tsx',
    '../features/calendar/components/CalendarView.tsx',
    '../features/companies/components/CompanyCourseManagement.tsx',
    '../features/conversations/components/ConversationsPane.tsx',
    '../desktop/MeView.tsx',
  ]) assert.match(read(path), /confirmSensitiveAction|promptSensitiveAction/, `${path} bypasses Alert Dialog`)
})

test('approval decisions and user-triggered tasks publish through the global Toast manager', () => {
  const main = read('../main.tsx')
  const provider = read('../components/GlobalInteractionProvider.tsx')
  assert.match(main, /<GlobalInteractionProvider>/)
  assert.match(provider, /<Toaster \/>/)
  assert.match(provider, /<AlertDialog open=\{current !== null\}/)
  assert.match(read('../components/messages/MessageToolParts.tsx'), /toastAction\(Promise\.resolve\(addResult/)
  assert.match(read('../features/calendar/components/EventEditor.tsx'), /toastAction\(runNow/)
  assert.match(read('../features/calendar/components/CalendarEventPeekContent.tsx'), /toastAction\(runEventNow/)
  assert.match(read('../features/email/components/EmailComposer.tsx'), /toastAction\(Promise\.resolve\(sendPromise\)/)
  assert.match(read('../features/eval/components/EvalPage.tsx'), /toastAction\(evalApi\.createRun/)
  assert.match(read('../lib/actionToast.ts'), /toast\.promise\(/)
  assert.match(read('../lib/actionToast.ts'), /\.unwrap\(\)/)
})

test('calendar editing uses the controlled Base UI Dialog without a handwritten modal shell', () => {
  const editor = read('../features/calendar/components/EventEditor.tsx')
  assert.match(editor, /<Dialog open onOpenChange=/)
  assert.match(editor, /<DialogContent[\s\S]*?<DialogTitle[\s\S]*?<DialogDescription/)
  assert.doesNotMatch(editor, /fixed inset-0|addEventListener\(['"]keydown/)
})

test('board card editing composes the official Dialog and keeps deletion behind Alert Dialog', () => {
  const editor = read('../features/boards/components/BoardCardDialog.tsx')
  assert.match(editor, /<Dialog open onOpenChange=/)
  assert.match(editor, /<DialogContent[\s\S]*?<DialogTitle[\s\S]*?<DialogDescription/)
  assert.match(editor, /confirmSensitiveAction\(/)
  assert.match(editor, /toastAction\(deleteCard/)
  assert.doesNotMatch(editor, /fixed inset-0|addEventListener\(['"]keydown|<button\b/)
})

test('repository skill requires Alert Dialog and Toast for future sensitive work', () => {
  const skill = read('../../.agents/skills/lingxiloop-sensitive-interactions/SKILL.md')
  assert.match(skill, /confirmSensitiveAction/)
  assert.match(skill, /promptSensitiveAction/)
  assert.match(skill, /Never use native `confirm\(\)`/)
  assert.match(skill, /Approval cards must Toast both approve and reject paths/)
  assert.match(skill, /user-triggered task dispatch/i)
})
