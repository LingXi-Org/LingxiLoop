import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('shared entry keeps notification, analytics, and app surfaces behind dynamic boundaries', () => {
  const main = readFileSync(new URL('../main.tsx', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const suspended = readFileSync(new URL('../admin/SuspendedScreen.tsx', import.meta.url), 'utf8')
  const waitlist = readFileSync(new URL('../admin/WaitlistConfirmedScreen.tsx', import.meta.url), 'utf8')

  assert.match(main, /import\('\.\/components\/NotificationWindow'\)/)
  assert.match(main, /import\('\.\/observability-entry'\)/)
  assert.match(main, /import\('\.\/App'\)/)
  assert.doesNotMatch(main, /Capacitor|\.\/lib\/native|mobileUploadSmoke/)
  assert.match(app, /lazy\(\(\) => import\('@\/admin\/AdminApp'\)/)
  assert.match(app, /lazy\(\(\) => import\('@\/desktop\/DesktopApp'\)/)
  assert.doesNotMatch(app, /@\/mobile\/|MobileApp/)
  assert.match(suspended, /import '\.\/auth-state\.css'/)
  assert.match(waitlist, /import '\.\/auth-state\.css'/)
})
