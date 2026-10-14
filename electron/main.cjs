/* eslint-env node */
const { app, BrowserWindow, Tray, Menu, nativeImage, shell, nativeTheme, screen, ipcMain, protocol, net } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { registerRendererScheme, rendererFile } = require('./rendererProtocol.cjs')
const { DEFAULT_WINDOW_STATE, createWindowStateStore } = require('./windowState.cjs')

const isDev = !app.isPackaged
const DEV_URL = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5180'

// ============== `app://` scheme — packaged renderer is served from here ==
// Production packaging would otherwise load index.html over `file://`,
// where ANY absolute path (`/logo.png`, `/assets/index-XYZ.js`, the
// favicons in <link>, …) resolves to `file:///foo` — outside the
// asar — and 404s. Vite's `base: './'` trick only fixes the bundled
// imports; hard-coded JSX `src="/logo.png"` stays absolute.
//
// Registering `app://lingxiloop/` as a privileged scheme + serving every
// request out of the packaged `dist/` directory normalises both classes
// of paths: absolute `/foo` and relative `./foo` both end up as
// `app://lingxiloop/<path>` and resolve to `<resources>/dist/<path>`. The
// renderer otherwise can't tell it isn't running over plain http(s).
//
// Why `lingxiloop` as the hostname (not `localhost`): the renderer's Origin
// header gets stamped from this URL on any cross-origin fetch, and the
// API server's LINGXILOOP_CORS_ORIGINS gates the response on that origin.
// Picking a project-specific host keeps the allowlist tight (no
// arbitrary local app gets a CORS pass) and reads more semantically.
//
// `standard: true` makes the scheme behave like http(s) for URL parsing,
// CORS, history.pushState, etc. `secure: true` qualifies it as a secure
// context so the WebCrypto subtle API + service workers (if we ever want
// one) work. `supportFetchAPI: true` enables fetch() against same-scheme
// URLs — the renderer's own JS doesn't need it currently, but leaving it
// on costs nothing and avoids a future foot-gun.
registerRendererScheme(protocol)

/** Resolve the on-disk path for an `app://lingxiloop/<request-path>` URL.
 *  Strips leading slashes from the URL path and joins under the packaged
 *  dist directory. Rejects anything that resolves OUTSIDE dist (path
 *  traversal guard), including requests for any other renderer host. */
/** Persistent main-window geometry. Saved on every resize/move/close and
 *  restored on launch — so users get the size + position they had last,
 *  and first-run gets a sensible non-fullscreen default. */
const windowStateStore = createWindowStateStore({
  fs,
  filePath: () => path.join(app.getPath('userData'), 'window-state.json'),
  displays: () => screen.getAllDisplays(),
})

const gotSingleInstance = app.requestSingleInstanceLock()
if (!gotSingleInstance) {
  app.quit()
}

// Track whether we already pinned the app to `regular`. The previous
// implementation re-applied `setActivationPolicy('regular')` on every
// window show/hide/closed event — 5 staggered times per call — which
// caused AppKit to re-render NSWindow shadows each invocation, producing
// the visible "main window shadow flickers many times on open" bug
// (~15 calls inside the first 3s of boot). We now mark the policy known-
// regular and skip the AppKit call entirely until something explicitly
// invalidates it during startup repair.
let activationPolicyKnownRegular = false

function ensureRegularDock() {
  if (process.platform !== 'darwin') return
  if (activationPolicyKnownRegular) return
  try {
    app.setActivationPolicy('regular')
    activationPolicyKnownRegular = true
  } catch { /* swallow */ }
  try {
    if (app.dock) void app.dock.show().catch(() => {})
  } catch { /* swallow */ }
}

/** Allow a startup repair to re-apply the activation policy. */
function invalidateActivationPolicyCache() {
  activationPolicyKnownRegular = false
}

function scheduleRegularDockRepair() {
  // Only do work when the cache wasn't already regular at entry — that's
  // the only case where we need to defend against AppKit demoting us
  // asynchronously during startup. When we
  // were already known-regular, this call is a no-op and we skip the
  // staggered timers entirely; that's what fixes the on-open shadow
  // flicker (previously: 5 staggered setActivationPolicy calls per
  // window event, AppKit re-rendered NSWindow shadows each time).
  const needsApply = !activationPolicyKnownRegular
  ensureRegularDock()
  if (!needsApply) return
  // Defense against silent demotion: AppKit may recompute activation
  // policy a few hundred ms after startup. Re-invalidate the cache
  // inside each timer so the repair actually re-applies (idempotent at
  // worst, repaired-in-time at best).
  for (const delay of [50, 250, 1000, 3000]) {
    const timer = setTimeout(() => {
      invalidateActivationPolicyCache()
      ensureRegularDock()
    }, delay)
    if (typeof timer.unref === 'function') timer.unref()
  }
}

// Pin the activation policy to `regular` at the earliest possible moment
// — BEFORE any BrowserWindow is constructed. On macOS, Electron's default
// is already `regular`, but pinning it explicitly here is the cheapest
// guard against later window setup causing AppKit to recompute and
// demote the app to `accessory`. Calling this before `whenReady()` is
// supported and lands during the NSApp setup, well before any window
// exists to influence the decision.
if (process.platform === 'darwin') {
  ensureRegularDock()
}

// Resolve once — used for `BrowserWindow.icon` (Win/Linux taskbar) and for
// `app.dock.setIcon` on macOS so the dock / cmd-tab in dev mode show the
// LingxiLoop avatar instead of Electron's default.
const ICON_PATH = path.join(app.getAppPath(), 'build', 'icon.png')
const DOCK_ICON_SIZE = 1024
const DOCK_UNREAD_DOT = {
  cx: 770,
  cy: 232,
  r: 48,
  stroke: 18,
}

/** True once an actual quit is in flight (Cmd-Q, tray menu Quit,
 *  window-all-closed on Win/Linux — anything that flows through
 *  `before-quit`). The main window's `close` handler checks this flag
 *  and falls through to a real close; otherwise it hides to tray. */
let appIsQuitting = false

/** The "real" app window. */
let mainWindow = null
let dockUnreadDotVisible = false
let dockCleanIcon = null
let dockUnreadIcon = null

function getDockCleanIcon() {
  if (!dockCleanIcon) dockCleanIcon = nativeImage.createFromPath(ICON_PATH)
  return dockCleanIcon
}

function getDockUnreadIcon() {
  if (dockUnreadIcon) return dockUnreadIcon
  const base64 = fs.readFileSync(ICON_PATH).toString('base64')
  const dot = DOCK_UNREAD_DOT
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${DOCK_ICON_SIZE}" height="${DOCK_ICON_SIZE}" viewBox="0 0 ${DOCK_ICON_SIZE} ${DOCK_ICON_SIZE}">
      <image href="data:image/png;base64,${base64}" width="${DOCK_ICON_SIZE}" height="${DOCK_ICON_SIZE}"/>
      <circle cx="${dot.cx}" cy="${dot.cy}" r="${dot.r + dot.stroke / 2}" fill="#ffffff" opacity="0.96"/>
      <circle cx="${dot.cx}" cy="${dot.cy}" r="${dot.r}" fill="#ff3b30"/>
    </svg>`
  dockUnreadIcon = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
  return dockUnreadIcon
}

function setDockUnreadDot(visible) {
  dockUnreadDotVisible = !!visible
  if (process.platform !== 'darwin' || !app.dock) return
  try {
    app.dock.setBadge('')
    const img = dockUnreadDotVisible ? getDockUnreadIcon() : getDockCleanIcon()
    if (!img.isEmpty()) app.dock.setIcon(img)
  } catch { /* swallow — Dock is macOS-only and not critical path */ }
  scheduleRegularDockRepair()
  // Mirror to the system tray so menu bar / system tray surfaces stay
  // in sync with the dock. Cheap to call when there's no tray (no-op).
  setTrayUnreadDot(dockUnreadDotVisible)
}

/* ============================ System tray ============================
 * Menu bar item on macOS, system tray on Win/Linux. Same unread-dot
 * indicator the dock uses (we reuse `dockUnreadDotVisible` as the
 * authoritative state). Click toggles the main window; right-click
 * shows a context menu with Open / Hide / Quit. Closing the X on the
 * main window hides instead of quitting (true quit is via tray menu
 * Quit or Cmd-Q / window-all-closed on Win+Linux). */
let tray = null
let trayCleanIcon = null
let trayUnreadIcon = null

/** Load a pre-rendered tray template PNG. The canonical avatar artwork and
 *  unread-badge variant are baked by `scripts-gen-tray-icons.py` and
 *  committed under `build/`:
 *
 *    build/tray-template.png         (22×22 — 1×)
 *    build/tray-template@2x.png      (44×44 — Retina)
 *    build/tray-template@3x.png      (66×66 — XDR)
 *    build/tray-template-unread.png  (+ @2x / @3x variants)
 *
 *  Re-run that script after regenerating `build/icon.png` and the menu
 *  bar icon tracks. Why baked-on-disk rather than runtime composition:
 *    • `nativeImage.createFromDataURL('data:image/svg+xml,…')` returns
 *      an empty image — Electron decodes only PNG/JPEG/WebP/GIF from
 *      data URLs, so SVG silently fails (which is why the tray icon
 *      disappeared in earlier attempts).
 *    • Electron auto-picks the right `@2x`/`@3x` sibling for the
 *      screen's scale factor when you call createFromPath on the 1×
 *      base, so we get pixel-perfect rendering on every display with
 *      zero runtime cost. */
function loadTrayTemplate(suffix) {
  const p = path.join(app.getAppPath(), 'build', `tray-template${suffix}.png`)
  const img = nativeImage.createFromPath(p)
  if (img.isEmpty()) return null
  if (process.platform === 'darwin') {
    // AppKit handles light/dark menu-bar inversion + click-highlight
    // tinting automatically once we mark this as a template. Off-darwin
    // it's a no-op; the black silhouette renders as-is, which is the
    // standard look on Win/Linux system trays too.
    try { img.setTemplateImage(true) } catch { /* swallow */ }
  }
  return img
}

function loadAppIconTrayFallback() {
  const image = nativeImage.createFromPath(ICON_PATH)
  return image.isEmpty() ? image : image.resize({ width: 22, height: 22, quality: 'best' })
}

function getTrayCleanIcon() {
  if (trayCleanIcon) return trayCleanIcon
  trayCleanIcon = loadTrayTemplate('') ?? loadAppIconTrayFallback()
  return trayCleanIcon
}

function getTrayUnreadIcon() {
  if (trayUnreadIcon) return trayUnreadIcon
  trayUnreadIcon = loadTrayTemplate('-unread') ?? loadAppIconTrayFallback()
  return trayUnreadIcon
}

function setTrayUnreadDot(visible) {
  if (!tray || tray.isDestroyed?.()) return
  try {
    const img = visible ? getTrayUnreadIcon() : getTrayCleanIcon()
    if (!img.isEmpty()) tray.setImage(img)
  } catch { /* swallow — tray isn't critical path */ }
}

function toggleMainWindowVisibility() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: `LingxiLoop v${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: 'Open LingxiLoop', click: () => {
      if (!mainWindow || mainWindow.isDestroyed()) { createWindow(); return }
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    } },
    { label: 'Hide Window', click: () => {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) mainWindow.hide()
    } },
    { type: 'separator' },
    { label: 'Quit LingxiLoop', click: () => {
      // before-quit will set appIsQuitting=true and tear down the
      // auth loopback server; this is the only
      // legitimate exit path that bypasses the close-to-hide trap.
      app.quit()
    } },
  ])
}

function createTray() {
  if (tray) return
  const img = getTrayCleanIcon()
  if (img.isEmpty()) {
    console.warn('[tray] no icon — skipping tray creation')
    return
  }
  tray = new Tray(img)
  tray.setToolTip('LingxiLoop')
  // macOS: don't `setContextMenu` — Electron's docs are explicit that
  // doing so swallows the `click` event entirely, making left-click
  // toggle-window impossible. Instead handle `click` ourselves and
  // pop the menu manually on `right-click`.
  tray.on('click', toggleMainWindowVisibility)
  tray.on('right-click', () => {
    try { tray.popUpContextMenu(buildTrayMenu()) } catch { /* swallow */ }
  })
  if (process.platform !== 'darwin') {
    // Win/Linux: setContextMenu drives the right-click menu reliably
    // across DEs; left-click still hits our `click` handler above.
    tray.setContextMenu(buildTrayMenu())
  }
  // Restore unread state in case set-unread-dot was called before tray
  // existed (dock was, but tray wasn't — keep the two in lockstep).
  setTrayUnreadDot(dockUnreadDotVisible)
}

function createWindow() {
  const saved = windowStateStore.read() ?? DEFAULT_WINDOW_STATE
  const rect = windowStateStore.visibleRect(saved)
  // Cap initial size to fit comfortably inside the primary display's
  // work area — 90% of work area, with the configured default as the
  // upper ceiling. Without this, the 1480×920 default would exceed
  // smaller laptop displays and macOS would clamp on launch, making
  // every first-run feel "fullscreen".
  const wa = screen.getPrimaryDisplay().workArea
  const initW = Math.min(saved.width ?? DEFAULT_WINDOW_STATE.width, Math.round(wa.width * 0.9))
  const initH = Math.min(saved.height ?? DEFAULT_WINDOW_STATE.height, Math.round(wa.height * 0.9))
  mainWindow = new BrowserWindow({
    width: initW,
    height: initH,
    // Only restore position if the rect is still inside a connected
    // display. Otherwise let the OS center the window — avoids opening
    // off-screen when the user disconnects a monitor.
    ...(rect ? { x: rect.x, y: rect.y } : {}),
    // Constructor flag — overrides macOS NSWindow state restoration's
    // "open fullscreen because it was fullscreen last quit" behaviour.
    // We apply our own fullscreen/maximize state right after `show`.
    fullscreen: false,
    // In dev, relax the floor so the window can shrink past the 768px
    // mobile breakpoint (defined in src/lib/utils.ts) — lets us debug the
    // mobile layout without spinning up a separate device emulator.
    // Production keeps the comfortable desktop floor.
    minWidth: isDev ? 320 : 900,
    minHeight: isDev ? 480 : 600,
    show: false,
    backgroundColor: '#070707',
    icon: ICON_PATH,
    titleBarStyle: 'hidden',
    ...(process.platform !== 'darwin'
      ? {
          titleBarOverlay: {
            color: '#070707',
            symbolColor: '#FCFCFC',
            height: 36,
          },
        }
      : {}),
    trafficLightPosition: { x: 16, y: 15 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Chromium throttles timers + some idle work when the window is
      // hidden. Keep incoming messages and unread state current.
      backgroundThrottling: false,
    },
  })

  // Forward native OS-level focus state to the renderer. We can't rely on
  // `document.hasFocus()` from inside the renderer — in Electron on macOS
  // it returns stale `true` values when the window is unfocused.
  //
  // We also can't rely on `BrowserWindow.on('blur'/'focus')` alone — on
  // some macOS versions with `titleBarStyle: 'hidden'` those events skip
  // transitions when focus passes through the menu bar or Mission
  // Control. Use both: events fire fast on direct focus changes, and a
  // 500ms heartbeat catches everything the events miss.
  let lastEmittedFocus = null
  const sendFocusState = (focused, _reason) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (focused === lastEmittedFocus) return
    lastEmittedFocus = focused
    mainWindow.webContents.send('app:focus-state', focused)
  }
  const pollFocus = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    sendFocusState(mainWindow.isFocused(), 'poll')
  }
  mainWindow.on('focus', () => sendFocusState(true, 'focus'))
  mainWindow.on('blur', () => sendFocusState(false, 'blur'))
  mainWindow.on('show', () => sendFocusState(mainWindow.isFocused(), 'show'))
  mainWindow.on('hide', () => sendFocusState(false, 'hide'))
  const focusPollTimer = setInterval(pollFocus, 500)

  // Debounced state persistence. We don't write on every pixel of a
  // drag/resize — wait 300ms of quiet then snapshot getNormalBounds (the
  // pre-maximize/fullscreen size, so we restore the user's actual chosen
  // size rather than the maximized rect).
  let saveTimer = null
  const persistState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const bounds = mainWindow.getNormalBounds()
    windowStateStore.write({
      x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
      fullscreen: mainWindow.isFullScreen(),
      maximized: mainWindow.isMaximized(),
    })
  }
  const queueSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(persistState, 300)
  }
  mainWindow.on('resize', queueSave)
  mainWindow.on('move', queueSave)
  mainWindow.on('maximize', queueSave)
  mainWindow.on('unmaximize', queueSave)
  mainWindow.on('enter-full-screen', queueSave)
  mainWindow.on('leave-full-screen', queueSave)
  mainWindow.on('close', (event) => {
    // Close-to-hide: clicking the window's X (or otherwise asking it to
    // close) just hides it to the tray, keeping the WS connection alive
    // so incoming messages remain current. True quit only happens when
    // `appIsQuitting` is set — which the tray menu's Quit, Cmd-Q, and
    // window-all-closed (Win/Linux) all flow through via `before-quit`.
    // Persist state first either way so the geometry is fresh on next
    // open / launch.
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
    persistState()
    // In dev we DON'T close-to-hide: the existing `closed` handler runs
    // `app.quit()` so `concurrently -k` propagates SIGTERM to vite + the
    // API server. Intercepting here would strand those children and the
    // next launch hits "port 5180 already in use".
    if (!isDev && !appIsQuitting && tray && !tray.isDestroyed?.()) {
      event.preventDefault()
      try { mainWindow.hide() } catch { /* swallow */ }
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    // Apply saved fullscreen / maximize state AFTER show so the OS
    // accepts the transition. Doing it via constructor options is
    // unreliable on macOS state-restoration paths.
    if (saved.fullscreen) mainWindow.setFullScreen(true)
    else if (saved.maximized) mainWindow.maximize()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (isDev) {
    void mainWindow.loadURL(DEV_URL)
    if (process.env.OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    // Serve over the app:// scheme registered above. `/` paths
    // (whether emitted by Vite or hard-coded in JSX) all flow through
    // the protocol handler in app.whenReady() and resolve from
    // <resources>/dist. No more file:// 404s.
    //
    // Host name matters: it becomes the renderer's `Origin` header on
    // any cross-origin fetch. The lingxiloop API server's
    // LINGXILOOP_CORS_ORIGINS allows `app://lingxiloop` — keep that in sync, or
    // /auth/me + every other /api call gets CORS-blocked and the user
    // sits forever on the sign-in screen with a valid token in store.
    void mainWindow.loadURL('app://lingxiloop/index.html')
  }

  mainWindow.on('closed', () => {
    clearInterval(focusPollTimer)
    mainWindow = null
    if (isDev) app.quit()
  })
}

ipcMain.on('dock:set-unread-dot', (_event, visible) => {
  setDockUnreadDot(!!visible)
})

ipcMain.on('window-chrome:set-theme', (_event, theme) => {
  if (!mainWindow || mainWindow.isDestroyed() || process.platform === 'darwin') return
  const dark = theme !== 'light'
  mainWindow.setTitleBarOverlay({
    color: dark ? '#070707' : '#F4F5F7',
    symbolColor: dark ? '#FCFCFC' : '#111318',
    height: 36,
  })
})

// Renderer asks for the main window's current focus state synchronously
// (e.g. at boot, before the first focus/blur event has fired).
ipcMain.handle('app:is-focused', () => {
  return !!(mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused())
})

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    nativeTheme.themeSource = 'light'
  }

  // Wire the app:// protocol handler. protocol.handle is the modern
  // API (Electron 25+) — gives us a streaming Response back so the
  // renderer never blocks on whole-bundle buffering. Anything we
  // can't resolve gets a 404. The handler ONLY serves packaged dist
  // content; rendererFile() rejects path-traversal attempts.
  protocol.handle('app', async (request) => {
    const file = rendererFile(request.url, path.join(__dirname, '..', 'dist'))
    if (!file) return new Response('not found', { status: 404 })
    try {
      return await net.fetch(pathToFileURL(file).toString())
    } catch (e) {
      console.warn('[app://]', request.url, '→', e?.message || e)
      return new Response('not found', { status: 404 })
    }
  })

  createWindow()
  // System tray (menu bar item on macOS, system tray on Win/Linux).
  // Created after the main window so the `close → hide` interception
  // in createWindow already has its `tray` guard satisfied — no chance
  // of hiding to a non-existent tray.
  createTray()
  if (process.platform === 'darwin') {
    // Keep the local development app available from the Dock.
    scheduleRegularDockRepair()
    try {
      const img = nativeImage.createFromPath(ICON_PATH)
      if (!img.isEmpty()) app.dock.setIcon(img)
    } catch (_) { /* swallow — dev convenience only */ }
    setDockUnreadDot(dockUnreadDotVisible)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
    }
  })

})

// macOS: Dock-icon click (and Cmd-Tab to a hidden app) fires `activate`.
// Without this handler the app sits in the Dock with no way back —
// `window-all-closed` keeps the process alive but never re-shows or
// re-creates the window.
app.on('activate', () => {
  scheduleRegularDockRepair()
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Release the tray when the app quits.
app.on('before-quit', () => {
  // Flip the close-to-hide guard so the main window's `close` handler
  // lets the close actually happen during real quit (Cmd-Q, tray menu
  // Quit, window-all-closed on Win/Linux). Without this, every quit
  // path would just hide the window forever.
  appIsQuitting = true
  if (tray && !tray.isDestroyed?.()) {
    try { tray.destroy() } catch { /* swallow */ }
    tray = null
  }
})

// Graceful shutdown on signals — primarily for dev where Ctrl-C in the
// terminal that ran `pnpm electron:dev` propagates SIGINT to children.
// Without this Electron ignores the signal and concurrently can't tear
// down vite + server.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { try { app.quit() } catch { /* swallow */ } })
}
