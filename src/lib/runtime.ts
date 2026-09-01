import type { SerializableThreadMessageSnapshot } from '@/features/chat/runtime'

/** Runtime detection for the supported Electron and Web surfaces. */

export interface NotificationPushPayload {
  id: string
  message: SerializableThreadMessageSnapshot
  conversationTitle: string
  at: number
  /** Conversation-level unread count snapshot at push time. Shown on
   *  the toast only when > 1 — single new messages don't get decorated
   *  with a redundant "1". */
  unreadCount?: number
}

interface LingxiLoopBridge {
  isElectron: boolean
  platform: string
  versions: { chrome: string; electron: string; node: string }
  /** Main-window focus state, sourced from native OS events. */
  app?: {
    isFocused: () => Promise<boolean>
    onFocusChange: (handler: (focused: boolean) => void) => () => void
  }
  /** Native Dock affordances. Currently only meaningful on macOS. */
  dock?: {
    setUnreadDot: (visible: boolean) => void
  }
  /** Appearance-only bridge for Electron's native title-bar controls. */
  windowChrome?: {
    setTheme: (theme: 'light' | 'dark') => void
  }
  notify?: {
    /** Main → notification window: show this toast. */
    push: (p: NotificationPushPayload) => void
    /** Main / notification → notification window: remove a toast id. */
    dismiss: (id: string) => void
    /** Notification → main: bring main window forward + select convo. */
    focusConvo: (conversationId: string) => void
    /** Notification → main: renderer is mounted; flush queued pushes. */
    ready: () => void
    /** Notification → main: first toast painted, OK to show the window. */
    painted: () => void
    /** Notification → main: resize the panel to fit content height. */
    setHeight: (h: number) => void
    /** Main window subscribes — fires when the notif panel becomes
     *  visible. Lets the always-loaded main window play the chime in
     *  sync with the on-screen appearance instead of pre-loading audio
     *  in the just-spawned notification renderer. */
    onVisible: (handler: () => void) => () => void
    /** Notification → main: toggle click-through. True while a toast is on
     *  screen so it can be clicked; false destroys the window so nothing
     *  sits invisibly on top of the desktop. */
    setInteractive: (interactive: boolean) => void
    /** Notification window subscribes — fires on each push from main. */
    onPush: (handler: (p: NotificationPushPayload) => void) => () => void
    /** Main window subscribes — fires when notif window asks to focus a convo. */
    onFocusConvo: (handler: (conversationId: string) => void) => () => void
  }
  /** OAuth loopback bridge. Main process opens the user's system
   *  browser via openExternal(); after the provider chain, our local
   *  loopback HTTP server (port 47823) catches the redirect, the
   *  served HTML page POSTs the parsed fragment to /auth/token, and
   *  onToken fires here so AuthGate can plant the session. */
  auth?: {
    openExternal: (url: string) => Promise<boolean>
    /** Arm a single-use handoff nonce (anti session-fixation). Returns the
     *  nonce to thread through the OAuth return URL. */
    arm?: () => Promise<string>
    onToken: (handler: (payload: { token: string; companyId: string | null }) => void) => () => void
  }
}

declare global {
  interface Window {
    lingxiloop?: LingxiLoopBridge
  }
}

export const isElectron: boolean = typeof window !== 'undefined' && window.lingxiloop?.isElectron === true

/** True only for an optional handoff-only `app.*` Web client. The primary Web
 *  origin gets the complete product UI. When this is true we surface sign-in,
 *  sign-in and a desktop hand-off. The `?webonly=1` escape lets localhost dev
 *  preview the trimmed shell without /etc/hosts trickery. */
export const isWebAppHost: boolean = (() => {
  if (typeof window === 'undefined') return false
  if (isElectron) return false
  if (/^app\./i.test(window.location.hostname)) return true
  if (window.location.search.includes('webonly=1')) return true
  return false
})()

export const platform: string = (typeof window !== 'undefined' && window.lingxiloop?.platform) || (typeof navigator !== 'undefined' ? navigator.platform.toLowerCase() : 'web')

export const isMac = platform === 'darwin' || platform.includes('mac')
// NB: use startsWith, not includes — `'darwin'.includes('win')` is true.
export const isWindows = platform === 'win32' || platform.startsWith('win')

/** macOS native traffic-light width when titleBarStyle is 'hidden' — leave room for them */
export const trafficLightInset = isElectron && isMac ? 84 : 0

/** True when this renderer is the dedicated notification window
 *  (loaded with the `#notifications` hash). The App component branches
 *  on this to render only the toast stack. */
export const isNotificationWindow: boolean =
  typeof window !== 'undefined' && window.location.hash === '#notifications'
