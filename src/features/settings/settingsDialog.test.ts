import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('settings restores keyboard focus and interactive surfaces have accessible labels', () => {
  assert.match(read('./SettingsDialog.tsx'), /onCloseAutoFocus=[\s\S]*SETTINGS_DIALOG_TRIGGER_ID[\s\S]*\.focus\(\)/)
  assert.match(read('../../components/nav-user.tsx'), /id=\{SETTINGS_DIALOG_TRIGGER_ID\}/)
  assert.match(read('./SettingsComponents.tsx'), /aria-label="[^"]+"/)
  assert.match(read('./AvatarEditor.tsx'), /aria-label=\{title\}/)
  const sonner = read('../../components/ui/sonner.tsx')
  assert.match(sonner, /customAriaLabel="[^"]+"/)
  assert.match(sonner, /closeButtonAriaLabel: "[^"]+"/)
  assert.match(read('../../components/assistant-ui/elements/attachment-card.tsx'), /aria-label=\{`[^`]*\$\{filename\}/)
  assert.match(read('../email/components/EmailComposer.tsx'), /aria-label=\{`[^`]+\$\{/)
})

test('account exit clears identity and authentication submits the CAPTCHA response', () => {
  assert.match(read('./AccountSettingsPanel.tsx'), /companiesApi\.leaveCompany\(company.id\)/)
  assert.match(read('./AccountSettingsPanel.tsx'), /useAuth.getState\(\)\.clear\(\)/)
  assert.match(read('./DataAccountSettingsPanel.tsx'), /authApi\.signOut\(\)/)
  assert.match(read('../../auth/api.ts'), /signIn:[\s\S]*signUp:[\s\S]*x-captcha-response/)
  const menu = read('../../components/nav-user.tsx')
  assert.match(menu, /isCompanyAdmin && <DropdownMenuItem/)
  assert.match(menu, /target="_blank" rel="noopener noreferrer"/)
})

test('invitation landing remains reachable before authentication and clears on completion', () => {
  const app = read('../../App.tsx')
  const gate = read('../../components/AuthGate.tsx')
  assert.match(app, /useState\(consumeInviteFromUrl\)/)
  assert.match(app, /invitation\?\.clear\(\)\s+setInvitation\(null\)/)
  assert.match(app, /<AuthGate unauthFallback=\{invitationScreen\}>/)
  assert.match(app, /\{invitationScreen \?\? <AuthedApp/)
  assert.match(gate, /authApi\.session\(\)/)
  assert.match(gate, /unauthFallback \?\? <AuthScreen \/>/)
})

test('user-visible errors are mapped before rendering provider details', () => {
  for (const path of [
    '../calendar/components/EventEditor.tsx', '../../components/WorkspaceChrome.tsx',
    '../../components/prompt-kit/tool.tsx', '../chat/components/ConversationThread.tsx',
  ]) assert.match(read(path), /userFacingError\(/)
})
