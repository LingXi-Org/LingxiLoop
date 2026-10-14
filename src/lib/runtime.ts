/** Runtime detection for the supported Electron and Web surfaces. */

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
