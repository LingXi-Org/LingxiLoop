import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor configuration for the LingxiLoop mobile app.
 *
 * Bundle id `cn.lingxilearn.loop` matches the Electron build's appId so the
 * Apple/Google portals stay aligned. `webDir` points at Vite's standard
 * build output (`dist/`) — run `npm run build` before `npx cap sync ios`.
 *
 * `server.url` is intentionally NOT set in this checked-in config —
 * shipping with a hardcoded staging URL would lock TestFlight builds to
 * dev infra. The runtime resolveServerOrigin() in src/api/client.ts
 * picks the API origin from VITE_LINGXILOOP_API_BASE at build time, which
 * is the right knob for an App Store submission build.
 */
const config: CapacitorConfig = {
  appId: 'cn.lingxilearn.loop',
  appName: 'LingxiLoop',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#FAFCFE',
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
    // Leave `handleApplicationNotifications` at its default (TRUE) so
    // Capacitor installs itself as the UNUserNotificationCenter delegate.
    // This was previously set to false — which is the documented switch
    // for "I'll own the delegate myself in AppDelegate" — but our
    // AppDelegate does NOT implement userNotificationCenter(_:willPresent:)
    // / didReceive:response: handlers. Result: foreground pushes never
    // surface a banner, and the `pushNotificationActionPerformed` chain
    // dies on the floor. Letting Capacitor own the delegate restores
    // both. The Apple-side registration callbacks
    // (didRegisterForRemoteNotificationsWithDeviceToken) are STILL
    // forwarded by our AppDelegate via NotificationCenter — those are a
    // separate UIApplicationDelegate hook unaffected by this flag.
  },
  android: {
    backgroundColor: '#FAFCFE',
    allowMixedContent: false,
  },
  plugins: {
    // Do not patch window.fetch globally. LingxiLoop JSON requests explicitly
    // use CapacitorHttp (src/api/transport.ts), while presigned File/Blob PUTs
    // stay in the WebView fetch implementation and never cross the JS/native
    // bridge as a duplicated binary payload.
    CapacitorHttp: {
      enabled: false,
    },
    SplashScreen: {
      // Hide as soon as the WebView is ready — the launch storyboard
      // already shows the cloud at AuthScreen's position, so there's
      // no value in re-presenting another splash image. Keeping a tiny
      // (200ms) window prevents a flash of white between storyboard
      // and React mount.
      launchAutoHide: true,
      launchShowDuration: 200,
      launchFadeOutDuration: 100,
      backgroundColor: '#FAFCFE',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#FAFCFE',
      overlaysWebView: false,
    },
    Keyboard: {
      // 'none' = the WebView is NOT resized by the OS when the keyboard shows
      // (which on iOS lands late/un-animated and makes the composer snap up
      // after the keyboard is already in place). Instead we lift the composer
      // ourselves via `--kb-height` + a transition matched to the keyboard
      // curve (see `.kb-aware` in globals.css), driven by `keyboardWillShow`
      // which fires as the keyboard animation begins — so they ride up in sync.
      resize: 'none',
    },
  },
}

export default config
