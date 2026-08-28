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

test('Alert Dialog remains shaped like the official base-nova Base UI primitive', () => {
  const source = read('../components/ui/alert-dialog.tsx')
  assert.match(source, /@base-ui\/react\/alert-dialog/)
  for (const slot of [
    'alert-dialog', 'alert-dialog-trigger', 'alert-dialog-portal',
    'alert-dialog-overlay', 'alert-dialog-content', 'alert-dialog-header',
    'alert-dialog-footer', 'alert-dialog-media', 'alert-dialog-title',
    'alert-dialog-description', 'alert-dialog-action', 'alert-dialog-cancel',
  ]) assert.ok(source.includes(`data-slot="${slot}"`), `missing ${slot}`)
  assert.match(source, /data-\[size=default\]:sm:max-w-sm/)
  assert.match(source, /AlertDialogPrimitive\.Close[\s\S]*?render=\{<Button variant=\{variant\} size=\{size\} \/>\}/)
})

test('Toast remains shaped like the official base-nova manager and stack', () => {
  const source = read('../components/ui/toast.tsx')
  assert.match(source, /@base-ui\/react\/toast/)
  assert.match(source, /ToastPrimitive\.createToastManager\(\)/)
  assert.match(source, /ToastPrimitive\.useToastManager\(\)/)
  for (const slot of [
    'toast-portal', 'toast-viewport', 'toast', 'toast-content',
    'toast-title', 'toast-description', 'toast-action', 'toast-close', 'toast-icon',
  ]) assert.ok(source.includes(`data-slot="${slot}"`), `missing ${slot}`)
  assert.match(source, /data-expanded:\[transform:translateX/)
  assert.match(source, /<ToastProvider toastManager=\{toastManager\}/)
})

test('production code never uses native alert, confirm, or prompt', () => {
  const nativeDialogUsers = sourceFiles(srcRoot).filter((path) => {
    const source = readFileSync(path, 'utf8')
    return /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(source)
  })
  assert.deepEqual(nativeDialogUsers, [], `native browser dialog found in: ${nativeDialogUsers.join(', ')}`)

  for (const path of [
    '../admin/UsersPage.tsx',
    '../admin/WaitlistPage.tsx',
    '../features/canvas/components/CanvasView.tsx',
    '../features/documents/components/DocumentEditor.tsx',
    '../components/EventEditor.tsx',
    '../features/companies/components/InvitePeopleModal.tsx',
    '../components/WorkspaceChrome.tsx',
    '../features/boards/components/BoardsView.tsx',
    '../desktop/CalendarView.tsx',
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
  assert.match(read('../components/EventEditor.tsx'), /toastAction\(runNow/)
  assert.match(read('../components/EmailComposer.tsx'), /toastAction\(Promise\.resolve\(sendPromise\)/)
  assert.match(read('../lib/actionToast.ts'), /toast\.promise\(/)
})

test('repository skill requires Alert Dialog and Toast for future sensitive work', () => {
  const skill = read('../../.agents/skills/lingxiloop-sensitive-interactions/SKILL.md')
  assert.match(skill, /confirmSensitiveAction/)
  assert.match(skill, /promptSensitiveAction/)
  assert.match(skill, /Never use native `confirm\(\)`/)
  assert.match(skill, /Approval cards must Toast both approve and reject paths/)
  assert.match(skill, /user-triggered task dispatch/i)
})
