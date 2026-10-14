/* eslint-env node */
const { contextBridge, ipcRenderer } = require('electron')

/** Renderer-side surface exposed to the React app. */
contextBridge.exposeInMainWorld('lingxiloop', {
  isElectron: true,
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },

  /**
   * Native OS-level focus state of the MAIN window. Reliable substitute
   * for `document.hasFocus()`, which can mis-report on Electron/macOS.
   */
  app: {
    isFocused: () => ipcRenderer.invoke('app:is-focused'),
    onFocusChange: (handler) => {
      const wrapped = (_evt, focused) => handler(!!focused)
      ipcRenderer.on('app:focus-state', wrapped)
      return () => ipcRenderer.removeListener('app:focus-state', wrapped)
    },
  },

  /** Native Dock affordances. macOS-only in main; no-op elsewhere. */
  dock: {
    setUnreadDot: (visible) => ipcRenderer.send('dock:set-unread-dot', !!visible),
  },

  /** Keep native Windows/Linux window controls legible in both themes. */
  windowChrome: {
    setTheme: (theme) => ipcRenderer.send('window-chrome:set-theme', theme),
  },

})
