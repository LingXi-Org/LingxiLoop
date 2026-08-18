import { access, copyFile } from 'node:fs/promises'
import { constants } from 'node:fs'

const src = 'build/icons/icon.icns'
const dest = 'node_modules/electron/dist/Electron.app/Contents/Resources/electron.icns'

try {
  await access(src, constants.R_OK)
  await access(dest, constants.W_OK)
  await copyFile(src, dest)
  console.log(`[dev-icon] synced ${dest}`)
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.log('[dev-icon] Electron.app icon not found; skipping dev icon sync')
  } else {
    throw error
  }
}
