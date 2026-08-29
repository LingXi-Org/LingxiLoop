/* eslint-env node */
/**
 * LingxiLoop auto-update — ported from alma's auto-updater.ts.
 *
 * Pulls the latest-mac.yml / latest.yml / latest-linux.yml from the
 * single GitHub publish provider configured in package.json. The flow:
 *
 *   1. Boot the main window, schedule an initial check 3s later.
 *   2. Periodic check every 30 minutes.
 *   3. When an update is available, FIRE a `auto-update-status` IPC
 *      event with kind='update-available'. The renderer pops the
 *      UpdaterDialog or a toast.
 *   4. Renderer asks to download → we call `downloadUpdate()`, broadcast
 *      progress events.
 *   5. Renderer asks to install → we call `quitAndInstall()`. App
 *      relaunches at the new version.
 *
 * `autoDownload=false` + `autoInstallOnAppQuit=true` matches alma's
 * choice: never start downloading without the user clicking, but if a
 * download did complete and the user quits without installing, install
 * silently on next launch.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const { existsSync } = require('node:fs')
const path = require('node:path')

const LOG = {
  info: (m) => console.log('[auto-update]', m),
  warn: (m) => console.warn('[auto-update]', m),
  error: (m) => console.error('[auto-update]', m),
}

const SUPPORTED = new Set(['darwin', 'win32', 'linux'])
const UNSUPPORTED_MSG = 'Auto-update is only available in installed builds.'

let _updater = null
let _initialized = false
let _manualInFlight = false
let _lastStatus = null
let _lastInfo = null
let _lastProgressBroadcastAt = 0
let _lastProgressPercent = -1
let _onBeforeInstall = null

const DOWNLOAD_PROGRESS_BROADCAST_MS = 500
const DOWNLOAD_PROGRESS_PERCENT_STEP = 1

/** Resolve electron-updater lazily so dev mode (where it'd ENOENT looking
 *  for app-update.yml) doesn't crash on require. */
function getUpdater() {
  if (_updater) return _updater
  const { autoUpdater } = require('electron-updater')
  _updater = autoUpdater
  _updater.logger = { info: LOG.info, warn: LOG.warn, error: LOG.error, debug: LOG.info }
  return _updater
}

function hasUpdateConfig() {
  if (app.isPackaged) {
    // In a packaged app, electron-builder writes app-update.yml into the
    // app's resources directory at build time. Absence ⇒ this is a
    // packaged build with no update channel (e.g. unsigned mac on first
    // install). Skip silently.
    return existsSync(path.join(process.resourcesPath, 'app-update.yml'))
  }
  // Dev mode: optional dev-app-update.yml at repo root lets you test
  // the autoupdate flow locally against a real feed.
  return existsSync(path.join(app.getAppPath(), 'dev-app-update.yml'))
}

function isSupported() {
  return SUPPORTED.has(process.platform) && hasUpdateConfig()
}

function initialStatus() {
  if (_lastStatus !== null) return _lastStatus
  _lastStatus = isSupported()
    ? { status: 'idle' }
    : { status: 'unsupported', detail: UNSUPPORTED_MSG }
  return _lastStatus
}

function broadcast(payload) {
  _lastStatus = payload
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) {
      try { w.webContents.send('auto-update-status', payload) } catch { /* ignore */ }
    }
  }
}

function resetProgressBroadcast() {
  _lastProgressBroadcastAt = 0
  _lastProgressPercent = -1
}

function broadcastDownloadProgress(p) {
  const percent = Number.isFinite(p.percent) ? p.percent : 0
  const now = Date.now()
  const first = _lastProgressPercent < 0
  const enoughTime = now - _lastProgressBroadcastAt >= DOWNLOAD_PROGRESS_BROADCAST_MS
  const enoughProgress = Math.abs(percent - _lastProgressPercent) >= DOWNLOAD_PROGRESS_PERCENT_STEP
  const complete = percent >= 100
  if (!first && !complete && (!enoughTime || !enoughProgress)) return

  _lastProgressBroadcastAt = now
  _lastProgressPercent = percent
  LOG.info(`Download: ${percent.toFixed(1)}% (${p.transferred}/${p.total})`)
  broadcast({
    status: 'downloading',
    percent,
    transferred: p.transferred,
    total: p.total,
    bytesPerSecond: p.bytesPerSecond,
    triggeredByUser: _manualInFlight,
  })
}

function registerListeners() {
  const u = getUpdater()
  u.on('checking-for-update', () => {
    LOG.info('Checking for updates...')
    resetProgressBroadcast()
    broadcast({ status: 'checking', triggeredByUser: _manualInFlight })
  })
  u.on('update-available', (info) => {
    LOG.info(`Update available: ${info.version}`)
    _lastInfo = info
    resetProgressBroadcast()
    broadcast({ status: 'update-available', version: info.version, triggeredByUser: _manualInFlight })
  })
  u.on('update-not-available', (info) => {
    LOG.info(`No update available (current: ${info?.version ?? '?'})`)
    resetProgressBroadcast()
    broadcast({ status: 'update-not-available', triggeredByUser: _manualInFlight })
  })
  u.on('download-progress', (p) => {
    broadcastDownloadProgress(p)
  })
  u.on('update-downloaded', (info) => {
    LOG.info(`Update downloaded: ${info.version}`)
    _lastInfo = info
    resetProgressBroadcast()
    broadcast({ status: 'update-downloaded', version: info.version, triggeredByUser: _manualInFlight })
  })
  u.on('error', (err) => {
    LOG.error(`Update error: ${err?.message || err}`)
    resetProgressBroadcast()
    broadcast({ status: 'error', detail: err?.message || String(err), triggeredByUser: _manualInFlight })
  })
}

function initialize() {
  if (!isSupported()) {
    LOG.info(UNSUPPORTED_MSG)
    return
  }
  if (_initialized) return
  const u = getUpdater()
  // User clicks "Download" — never silent. Lets you read release notes
  // and decide before a 100MB download saturates a hotspot.
  u.autoDownload = false
  // If user quits without installing a downloaded update, install on
  // next quit. Avoids the "I forgot to update for a month" trap.
  u.autoInstallOnAppQuit = true
  registerListeners()

  // First check 3s after boot so the splash doesn't compete with
  // network traffic. Then every 30 min.
  setTimeout(() => {
    u.checkForUpdates().catch((e) => LOG.error(`Initial check failed: ${e.message}`))
  }, 3_000)
  setInterval(() => {
    u.checkForUpdates().catch((e) => LOG.error(`Periodic check failed: ${e.message}`))
  }, 30 * 60 * 1000)

  _initialized = true
}

async function checkManually() {
  if (!isSupported()) return { status: 'unsupported', message: UNSUPPORTED_MSG }
  if (!_initialized) return { status: 'error', message: 'updater not initialised' }
  if (_manualInFlight) return { status: 'error', message: 'check already in flight' }

  _manualInFlight = true
  const u = getUpdater()
  return new Promise((resolve) => {
    const done = (result) => {
      _manualInFlight = false
      u.removeListener('update-available', onAvail)
      u.removeListener('update-not-available', onNone)
      u.removeListener('update-downloaded', onDone)
      u.removeListener('error', onErr)
      resolve(result)
    }
    const onAvail = (i) => done({ status: 'update-available', version: i.version })
    const onNone = () => done({ status: 'update-not-available' })
    const onDone = (i) => done({ status: 'update-downloaded', version: i.version })
    const onErr = (e) => done({ status: 'error', message: e.message })
    u.once('update-available', onAvail)
    u.once('update-not-available', onNone)
    u.once('update-downloaded', onDone)
    u.once('error', onErr)
    u.checkForUpdates().catch(onErr)
  })
}

async function download() {
  if (!isSupported()) return { ok: false, error: UNSUPPORTED_MSG }
  if (!_initialized) return { ok: false, error: 'updater not initialised' }
  try {
    await getUpdater().downloadUpdate()
    return { ok: true }
  } catch (e) {
    const msg = e?.message || String(e)
    // Self-heal SHA mismatches (same recipe alma uses) by wiping the
    // partial download cache and retrying once. The cache lives in
    // userData/pending and a corrupted .blockmap there will reject every
    // subsequent download with the same checksum error forever.
    if (/sha512|checksum/i.test(msg)) {
      LOG.warn('Checksum mismatch — clearing cache + retrying')
      try {
        const { rmSync } = require('node:fs')
        rmSync(path.join(app.getPath('userData'), 'pending'), { recursive: true, force: true })
        await getUpdater().checkForUpdates()
        await getUpdater().downloadUpdate()
        return { ok: true }
      } catch (retry) {
        return { ok: false, error: `retry failed: ${retry?.message || retry}` }
      }
    }
    return { ok: false, error: msg }
  }
}

function quitAndInstall() {
  // electron-updater on macOS goes through the native autoUpdater, which
  // calls Browser::Shutdown() directly and skips `before-quit`. That
  // means any close-to-hide handler keyed off an "is the app quitting?"
  // flag set in before-quit will intercept the window close, hide the
  // window, and leave the process running — Squirrel waits forever and
  // the user sees "the window vanished but nothing restarted." Give the
  // host a hook to flip its quit flag (and tear down auxiliary windows /
  // servers) before we hand off to the native quit path.
  try { _onBeforeInstall?.() } catch (e) { LOG.error(e?.message) }
  // (isSilent=false, isForceRunAfter=true) — show the installer UX on
  // Windows where applicable; relaunch on macOS / Linux.
  try { getUpdater().quitAndInstall(false, true) } catch (e) { LOG.error(e?.message) }
}

/** Register a callback that fires immediately before the native quit
 *  starts. Use it to flip close-to-hide guards and destroy any window
 *  with `closable: false` that would otherwise keep the process alive. */
function setBeforeInstallHandler(fn) {
  _onBeforeInstall = typeof fn === 'function' ? fn : null
}

function getInfo() {
  if (!_lastInfo) return null
  let notes = null
  if (typeof _lastInfo.releaseNotes === 'string') {
    notes = _lastInfo.releaseNotes
  } else if (Array.isArray(_lastInfo.releaseNotes)) {
    notes = _lastInfo.releaseNotes
      .map((n) => (typeof n === 'string' ? n : n.note))
      .filter(Boolean)
      .join('\n\n')
  }
  return {
    version: _lastInfo.version,
    releaseNotes: notes,
    releaseDate: _lastInfo.releaseDate,
  }
}

function getAppInfo() {
  return {
    name: app.getName(),
    version: app.getVersion(),
    autoUpdateSupported: isSupported(),
    autoUpdateStatus: initialStatus(),
  }
}

/** Wire IPC handlers. Call once after app.whenReady(). */
function registerIpc() {
  ipcMain.handle('update:app-info', () => getAppInfo())
  ipcMain.handle('update:status', () => initialStatus())
  ipcMain.handle('update:info', () => getInfo())
  ipcMain.handle('update:check', () => checkManually())
  ipcMain.handle('update:download', () => download())
  ipcMain.handle('update:install', () => { quitAndInstall(); return { ok: true } })
}

module.exports = {
  initialize,
  registerIpc,
  setBeforeInstallHandler,
  isSupported,
  getAppInfo,
}
