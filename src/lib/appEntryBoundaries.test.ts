import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('shared entry keeps notification, analytics, and app surfaces behind dynamic boundaries', () => {
  const main = readFileSync(new URL('../main.tsx', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const workspace = readFileSync(new URL('../features/knowledge/workspace.ts', import.meta.url), 'utf8')
  const authStates = readFileSync(new URL('../auth/AuthStateScreens.tsx', import.meta.url), 'utf8')

  assert.match(main, /import\('\.\/components\/NotificationWindow'\)/)
  assert.match(main, /import\('\.\/observability-entry'\)/)
  assert.match(main, /import\('\.\/App'\)/)
  assert.doesNotMatch(main, /Capacitor|\.\/lib\/native|mobileUploadSmoke/)
  assert.match(app, /lazy\(\(\) => import\('@\/desktop\/DesktopApp'\)/)
  assert.doesNotMatch(app, /AdminApp|isAdminContext|features\/admin|features\/eval/)
  assert.doesNotMatch(app, /@\/mobile\/|MobileApp/)
  assert.match(app, /import \{ TooltipProvider \} from '@\/components\/ui\/tooltip'/)
  assert.match(app, /<TooltipProvider delayDuration=\{120\}>[\s\S]*<DesktopApp \/>[\s\S]*<\/TooltipProvider>/)
  assert.match(workspace, /workspace\.isDefault && workspace\.status !== 'DELETED'/)
  assert.match(app, /await useWorkspace\.getState\(\)\.load\(\)[\s\S]*chatTransport\.boot\(\)[\s\S]*bootParticipants\(\)[\s\S]*bootConversations\(\)/)
  assert.match(authStates, /from '@\/components\/ui\/card'/)
  assert.match(authStates, /from '@\/components\/ui\/button'/)
})
