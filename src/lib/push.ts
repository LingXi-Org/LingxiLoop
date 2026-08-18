/**
 * Native push-notification client wiring (Capacitor → APNs on iOS, FCM on
 * Android). The same @capacitor/push-notifications plugin drives both; only
 * the `platform` we report to the server differs.
 *
 * Flow on app boot (after the user is authenticated):
 *  1. requestPermissions() prompts the user the first time (Android 13+ shows
 *     the POST_NOTIFICATIONS dialog; iOS shows its built-in one)
 *  2. register() asks APNs / FCM for a device token
 *  3. on `registration` event → POST /push/register with the token + platform
 *  4. on `pushNotificationActionPerformed` → user tapped a banner;
 *     deep-link them to the conversation
 *  5. on `pushNotificationReceived` (foreground only) → fall through to
 *     whatever in-app surface NotificationToasts handles
 *
 * Soft no-op on browser / Electron — we only run inside a Capacitor native
 * shell (iOS or Android).
 */
import { isCapacitorAndroid, isCapacitorNative } from './runtime'
import { api } from '@/api/client'
import { useApp } from '@/stores/app'
import { usePrefs } from '@/stores/preferences'

interface CapacitorPushNotifications {
  checkPermissions: () => Promise<{ receive: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' }>
  requestPermissions: () => Promise<{ receive: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' }>
  register: () => Promise<void>
  removeAllDeliveredNotifications: () => Promise<void>
  removeAllListeners: () => Promise<void>
  addListener: (
    event: 'registration' | 'registrationError' | 'pushNotificationReceived' | 'pushNotificationActionPerformed',
    handler: (payload: any) => void,
  ) => Promise<{ remove: () => Promise<void> }>
}

interface RegistrationToken { value: string }
interface RegistrationError { error: string }
interface PushNotificationSchema {
  title?: string
  body?: string
  data?: Record<string, unknown>
}
interface ActionPerformed {
  notification: PushNotificationSchema
  actionId: string
}

/** Lazy-imported because the plugin only exists in the native bundle.
 *  Importing at module top-level would crash the web build. */
async function loadPlugin(): Promise<CapacitorPushNotifications | null> {
  if (!isCapacitorNative) return null
  try {
    const mod = await import('@capacitor/push-notifications')
    return mod.PushNotifications as unknown as CapacitorPushNotifications
  } catch (e) {
    console.warn('[push] @capacitor/push-notifications unavailable', e)
    return null
  }
}

/** The most recently registered token. Stashed so we can hand it to
 *  /push/unregister on sign-out without re-asking the plugin. */
let activeToken: string | null = null
let listenersAttached = false

/** Snapshot of the most recent permission-prompt result so the UI
 *  can render an honest status tile without re-asking the OS. */
export interface PushStatus {
  /** True when running inside a Capacitor native shell (iOS via APNs or
   *  Android via FCM) — the platforms that do real push. */
  supported: boolean
  /** False when the user toggled `notify.push` off in Preferences —
   *  init bails before reaching the OS, so the rest of these fields
   *  stay at their defaults. */
  prefEnabled: boolean
  /** Permission grant state from the OS, or 'unknown' before we've
   *  asked / on non-iOS builds. */
  permission: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' | 'unknown'
  /** Last 8 chars of the device token we've registered with the
   *  server, or null when none. Useful for "is the right token live?"
   *  debugging without revealing the whole credential. */
  tokenSuffix: string | null
  /** Last error message from a failed registration attempt, surfaced
   *  to the UI so the user can see WHY push isn't arriving. */
  lastError: string | null
  /** Which step the init flow reached on its last invocation. Helps
   *  diagnose "stuck at unknown permission" by showing whether we
   *  ever reached the plugin / OS / network steps at all. */
  lastStep: PushStep
}
type PushStep = 'idle' | 'load-plugin' | 'request-permission' | 'register' | 'done'
let lastPermission: PushStatus['permission'] = 'unknown'
let lastError: string | null = null
let lastStep: PushStep = 'idle'

export function getPushStatus(): PushStatus {
  return {
    supported: isCapacitorNative,
    prefEnabled: pushPrefEnabled(),
    permission: lastPermission,
    tokenSuffix: activeToken ? activeToken.slice(-8) : null,
    lastError,
    lastStep,
  }
}

/** Apply the deep-link encoded in a push payload's custom data. The
 *  server's notifyMessage(...) writes conversationId here; the App
 *  store knows how to focus that convo. Other surfaces (doc.mention,
 *  calendar.reminder) can branch on `kind`. */
function applyDeepLink(data: Record<string, unknown> | undefined): void {
  if (!data) return
  const kind = typeof data.kind === 'string' ? data.kind : 'message'
  if (kind === 'message') {
    const id = typeof data.conversationId === 'string' ? data.conversationId : null
    if (id) {
      useApp.getState().selectConversation(id)
      // Deep-link to the conversations rail — that's the view that hosts
      // the chat surface on both mobile and desktop. Mobile's pushStack
      // is handled by the existing convoId→pushStack effect in MobileApp.
      useApp.getState().setView('conversations')
    }
  }
}

/** Read the `notify.push` user preference. Default true — preferences
 *  load asynchronously, so before they arrive we honor the system-level
 *  iOS permission instead of preemptively unregistering. */
function pushPrefEnabled(): boolean {
  const v = usePrefs.getState().prefs['notify.push']
  return v === undefined ? true : Boolean(v)
}

/** True once we've wired the `visibilitychange` self-heal listener. The
 *  listener re-runs init when the app returns to foreground, which is
 *  how a "user flipped iOS Settings → Notifications back on" recovers
 *  without a quit-and-relaunch. Module-scope flag because we want it
 *  attached exactly once per process. */
let visibilityHookInstalled = false

/** Hook into Capacitor's push lifecycle. Idempotent — calling twice
 *  attaches listeners exactly once. Safe to invoke from authed-app
 *  mount; the inner gate skips non-iOS contexts. */
export async function initPushNotifications(opts: { force?: boolean } = {}): Promise<void> {
  lastStep = 'load-plugin'
  lastError = null
  // The console.log calls below are deliberately verbose — they show up
  // in `xcrun simctl spawn booted log stream --predicate
  // 'subsystem CONTAINS "Cumora"'` AND in Safari Web Inspector when
  // attached to the device, so when a user reports "no push", we can ask
  // them to attach the Web Inspector and read the trace.
  console.log('[push] init begin force=', opts.force, 'native=', isCapacitorNative)
  const PushNotifications = await loadPlugin()
  if (!PushNotifications) {
    lastError = isCapacitorNative
      ? '@capacitor/push-notifications failed to load — was the plugin bundled into this build?'
      : 'not running inside a Capacitor native shell'
    console.log('[push] init bail: loadPlugin returned null —', lastError)
    return
  }
  // Respect the user-level kill switch UNLESS the caller passed
  // `force: true`. The "Re-register" button in the diagnostic tile
  // sets force so the user can recover from "I toggled off then back
  // on but the OS prompt never came back" without restarting.
  if (!opts.force && !pushPrefEnabled()) {
    lastError = 'in-app preference notify.push is OFF — toggle it on to re-enable.'
    console.log('[push] init bail: prefs notify.push is OFF')
    await teardownPushNotifications()
    return
  }

  // Attach the lifecycle listeners EXACTLY ONCE per process, even if
  // init runs multiple times. The permission+register steps below run
  // EVERY call though — that's what makes the flow self-healing: if
  // a previous registration silently failed (transient APNs hiccup,
  // entitlement was wrong on an old build, etc.), the next app launch
  // tries again.
  if (!listenersAttached) {
    listenersAttached = true
    console.log('[push] attaching lifecycle listeners')
    await PushNotifications.addListener('registration', async (tok: RegistrationToken) => {
      activeToken = tok.value
      lastError = null
      console.log('[push] registration event — token suffix=', tok.value.slice(-8))
      try {
        await api.registerPushDevice({
          platform: isCapacitorAndroid ? 'android' : 'ios',
          token: tok.value,
        })
        console.log('[push] /push/register OK')
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
        console.warn('[push] /push/register failed', e)
      }
    })

    await PushNotifications.addListener('registrationError', (err: RegistrationError) => {
      // Don't be loud — this fires when the user denies the prompt, when
      // APNs is unreachable, or when the entitlement is missing on a dev
      // build. None of those need a stack trace.
      lastError = err?.error ?? 'registration failed'
      console.warn('[push] APNs registration failed', err?.error)
    })

    await PushNotifications.addListener('pushNotificationActionPerformed', (event: ActionPerformed) => {
      applyDeepLink(event.notification.data as Record<string, unknown> | undefined)
    })

    // Foreground delivery — iOS does NOT show a banner by default for
    // these. We let NotificationToasts handle in-app presentation, so
    // there's nothing to do here aside from let it pass.
    await PushNotifications.addListener('pushNotificationReceived', () => {
      // Intentional no-op — the WS path already delivered this message
      // and the toast stack will render it via the standard flow.
    })
  }

  // Permission state. Prefer `checkPermissions` first — it returns the
  // current grant WITHOUT prompting, so when the user already granted
  // (the common path on every launch after the first), we skip straight
  // to register() with no UI side effects. Only call `requestPermissions`
  // when we genuinely haven't been asked yet ('prompt' / 'prompt-with-
  // rationale'). This avoids subtle Capacitor 8 behavior where calling
  // requestPermissions a second time on iOS returns the cached decision
  // — but if the decision was 'denied' it returns immediately without
  // ever giving the user a chance to flip it, and we'd then bail
  // without trying register(). Splitting check / request makes the
  // intent explicit.
  let perm: PushStatus['permission']
  try {
    const cur = await PushNotifications.checkPermissions()
    perm = cur.receive
    lastPermission = perm
    console.log('[push] checkPermissions →', perm)
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e)
    console.warn('[push] checkPermissions threw', e)
    return
  }
  if (perm === 'prompt' || perm === 'prompt-with-rationale') {
    lastStep = 'request-permission'
    try {
      const res = await PushNotifications.requestPermissions()
      lastPermission = res.receive
      perm = res.receive
      console.log('[push] requestPermissions →', perm)
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      console.warn('[push] requestPermissions threw', e)
      return
    }
  }
  if (perm !== 'granted') {
    lastError = `permission state from OS: ${perm}`
    console.log('[push] init bail: permission not granted →', perm)
    // Install the visibility hook anyway so a returning-from-Settings
    // flip from denied → granted gets picked up automatically.
    installVisibilityHook()
    return
  }

  lastStep = 'register'
  try {
    console.log('[push] calling PushNotifications.register()')
    await PushNotifications.register()
    // Note: register() resolves the moment the request is dispatched
    // — the actual device token arrives asynchronously via the
    // `registration` listener (which is what sets activeToken).
    lastStep = 'done'
    console.log('[push] register() resolved — waiting for `registration` event')
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e)
    console.warn('[push] register threw', e)
  }
  installVisibilityHook()
}

/** Re-run init each time the app returns to foreground IF we don't yet
 *  have a token registered. Catches the "user denied initially → flipped
 *  iOS Settings → returned to the app" recovery path without forcing a
 *  quit-and-relaunch, and also retries past transient APNs hiccups. */
function installVisibilityHook(): void {
  if (visibilityHookInstalled) return
  if (typeof document === 'undefined') return
  visibilityHookInstalled = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    // Already registered — nothing to do.
    if (activeToken) return
    console.log('[push] visibilitychange → app foregrounded without token; retrying init')
    void initPushNotifications()
  })
}

/** Tear down for sign-out: stop sending pushes to this device and
 *  drop any delivered banners from the lock screen. Safe to call when
 *  push was never enabled — every step swallows its own errors. */
export async function teardownPushNotifications(): Promise<void> {
  const PushNotifications = await loadPlugin()
  if (!PushNotifications) return
  if (activeToken) {
    try { await api.unregisterPushDevice({ token: activeToken }) }
    catch (e) { console.warn('[push] /push/unregister failed', e) }
    activeToken = null
  }
  try { await PushNotifications.removeAllDeliveredNotifications() }
  catch { /* swallow */ }
}
