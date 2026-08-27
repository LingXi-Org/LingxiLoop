import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const rootFile = (path: string) => new URL(`../../${path}`, import.meta.url)

test('the product ships only Web and Electron Desktop entry points', async () => {
  const [app, main, runtime] = await Promise.all([
    readFile(rootFile('src/App.tsx'), 'utf8'),
    readFile(rootFile('src/main.tsx'), 'utf8'),
    readFile(rootFile('src/lib/runtime.ts'), 'utf8'),
  ])

  assert.match(app, /<DesktopApp \/>/)
  assert.doesNotMatch(app, /MobileApp|useIsMobile/)
  assert.doesNotMatch(main, /@capacitor|native-shell|initNative/)
  assert.doesNotMatch(runtime, /Capacitor|isNativePlatform|isCapacitor/)
})

test('native mobile projects, bridges, and dependencies stay retired', async () => {
  for (const path of [
    'android',
    'ios',
    'src/mobile',
    'capacitor.config.ts',
    'src/lib/native.ts',
    'src/lib/nativeOAuthState.ts',
    'src/lib/push.ts',
  ]) {
    await assert.rejects(access(rootFile(path)), `${path} must remain absent`)
  }

  const [packageJson, packageLock] = await Promise.all([
    readFile(rootFile('package.json'), 'utf8'),
    readFile(rootFile('package-lock.json'), 'utf8'),
  ])
  assert.doesNotMatch(packageJson, /@capacitor|"mobile:[^"]+"/)
  assert.doesNotMatch(packageLock, /node_modules\/@capacitor/)
})

test('the server no longer exposes native push or mobile trial state', async () => {
  const [router, schema, environment, worker, apiClient] = await Promise.all([
    readFile(rootFile('server/src/api/router.ts'), 'utf8'),
    readFile(rootFile('server/src/db/schema.sql'), 'utf8'),
    readFile(rootFile('server/src/env.ts'), 'utf8'),
    readFile(rootFile('server/src/worker.ts'), 'utf8'),
    readFile(rootFile('src/api/client.ts'), 'utf8'),
  ])

  assert.doesNotMatch(router, /pushRouter|modules\/push/)
  assert.doesNotMatch(schema, /push_devices|pro_trial_expires_at/)
  assert.doesNotMatch(environment, /APNS_|FCM_/)
  assert.doesNotMatch(worker, /trial-sweep|startTrialSweepWorker/)
  assert.doesNotMatch(apiClient, /push\/devices|registerPushDevice|unregisterPushDevice/)
})
