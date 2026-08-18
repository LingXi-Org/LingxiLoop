/**
 * Generate iOS App Icon + Launch Storyboard assets for Capacitor.
 *
 * Reads build/icon.png (1024×1024, the same source used by Electron)
 * and writes a complete `AppIcon.appiconset` plus a 2732×2732
 * splash image into ios/App/App/Assets.xcassets. Run AFTER
 * `npx cap add ios` has created the Xcode project.
 *
 * Falls back gracefully when `sharp` isn't installed — prints what it
 * would write so a CI maintainer can wire it up later.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname)
// iOS auto-masks app icons with its own rounded-corner shape, so the
// source must be a square, fully-opaque image. Using `build/icon.png`
// (the Electron icon that already has rounded corners baked in) would
// result in visible double-rounded corners on iOS. We composite the
// raw cloud mascot from `public/logo.png` onto a soft solid square
// background so iOS owns the rounding.
const SRC_LOGO = path.join(ROOT, 'public', 'logo.png')
const ICON_BG = '#EAF4FB' // soft sky — matches the welcome-screen wash
const IOS_ASSETS = path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets')
const APPICON = path.join(IOS_ASSETS, 'AppIcon.appiconset')
const SPLASH = path.join(IOS_ASSETS, 'Splash.imageset')

/** Apple's App Icon spec — every size & idiom required for App Store. */
const ICON_SPECS = [
  // iPhone notification, settings, spotlight, app
  { size: 20, scale: 2, idiom: 'iphone' },
  { size: 20, scale: 3, idiom: 'iphone' },
  { size: 29, scale: 2, idiom: 'iphone' },
  { size: 29, scale: 3, idiom: 'iphone' },
  { size: 40, scale: 2, idiom: 'iphone' },
  { size: 40, scale: 3, idiom: 'iphone' },
  { size: 60, scale: 2, idiom: 'iphone' },
  { size: 60, scale: 3, idiom: 'iphone' },
  // iPad
  { size: 20, scale: 1, idiom: 'ipad' },
  { size: 20, scale: 2, idiom: 'ipad' },
  { size: 29, scale: 1, idiom: 'ipad' },
  { size: 29, scale: 2, idiom: 'ipad' },
  { size: 40, scale: 1, idiom: 'ipad' },
  { size: 40, scale: 2, idiom: 'ipad' },
  { size: 76, scale: 2, idiom: 'ipad' },
  { size: 83.5, scale: 2, idiom: 'ipad' },
  // App Store marketing icon — 1024×1024 @1x
  { size: 1024, scale: 1, idiom: 'ios-marketing' },
]

function iconFile(s) {
  const _px = Math.round(s.size * s.scale)
  return `AppIcon-${s.idiom}-${s.size}@${s.scale}x.png`
}

function buildContentsJson() {
  const images = ICON_SPECS.map((s) => ({
    size: `${s.size}x${s.size}`,
    idiom: s.idiom,
    filename: iconFile(s),
    scale: `${s.scale}x`,
  }))
  return JSON.stringify({ images, info: { version: 1, author: 'cumora' } }, null, 2)
}

function buildSplashContentsJson() {
  return JSON.stringify({
    images: [
      { idiom: 'universal', filename: 'splash-2732x2732.png', scale: '1x' },
      { idiom: 'universal', filename: 'splash-2732x2732-1.png', scale: '2x' },
      { idiom: 'universal', filename: 'splash-2732x2732-2.png', scale: '3x' },
    ],
    info: { version: 1, author: 'cumora' },
  }, null, 2)
}

async function renderIconBuffer(sharp, sizePx) {
  // Square solid background + centered cloud mascot at 80% of canvas.
  // iOS will mask the corners — we just need an opaque square.
  const innerPx = Math.round(sizePx * 0.8)
  const mascot = await sharp(SRC_LOGO).resize(innerPx, innerPx, { fit: 'contain' }).png().toBuffer()
  return sharp({
    create: { width: sizePx, height: sizePx, channels: 4, background: ICON_BG },
  })
    .composite([{ input: mascot, gravity: 'center' }])
    .png()
    .toBuffer()
}

async function main() {
  if (!fs.existsSync(SRC_LOGO)) {
    console.error(`Missing source logo: ${SRC_LOGO}`)
    process.exit(1)
  }
  if (!fs.existsSync(path.join(ROOT, 'ios'))) {
    console.warn('ios/ directory missing — run `npx cap add ios` first, then re-run this script.')
    console.warn('Skipping write; printing planned outputs:')
    for (const s of ICON_SPECS) {
      console.warn(`  → ${iconFile(s)} (${Math.round(s.size * s.scale)}px)`)
    }
    return
  }

  let sharp
  try {
    sharp = (await import('sharp')).default
  } catch {
    console.warn('`sharp` not installed — run `npm install --no-save sharp` then re-run.')
    process.exit(2)
  }

  fs.mkdirSync(APPICON, { recursive: true })
  fs.mkdirSync(SPLASH, { recursive: true })
  const LOGO_SET = path.join(IOS_ASSETS, 'LaunchLogo.imageset')
  fs.mkdirSync(LOGO_SET, { recursive: true })

  for (const s of ICON_SPECS) {
    const px = Math.round(s.size * s.scale)
    const out = path.join(APPICON, iconFile(s))
    const buf = await renderIconBuffer(sharp, px)
    fs.writeFileSync(out, buf)
    console.log(`  wrote ${path.relative(ROOT, out)} (${px}px)`)
  }
  fs.writeFileSync(path.join(APPICON, 'Contents.json'), buildContentsJson())

  // Splash — 2732×2732 with the cloud centered at 30% of the canvas.
  const SPLASH_BG = '#FAFCFE'
  const canvasPx = 2732
  const iconPx = Math.round(canvasPx * 0.3)
  const splashBuffer = await sharp({
    create: { width: canvasPx, height: canvasPx, channels: 4, background: SPLASH_BG },
  })
    .composite([{
      input: await sharp(SRC_LOGO).resize(iconPx, iconPx, { fit: 'contain' }).png().toBuffer(),
      gravity: 'center',
    }])
    .png()
    .toBuffer()
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    fs.writeFileSync(path.join(SPLASH, name), splashBuffer)
  }
  fs.writeFileSync(path.join(SPLASH, 'Contents.json'), buildSplashContentsJson())

  // Standalone LaunchLogo — a transparent-background cloud sized to
  // match the AuthScreen's CloudLogo (64pt = 192px @3x). Used by
  // LaunchScreen.storyboard so the launch logo doesn't visibly jump
  // when React mounts and shows its own cloud.
  const launchSizes = [
    { name: 'LaunchLogo@1x.png', px: 64 },
    { name: 'LaunchLogo@2x.png', px: 128 },
    { name: 'LaunchLogo@3x.png', px: 192 },
  ]
  for (const s of launchSizes) {
    await sharp(SRC_LOGO).resize(s.px, s.px, { fit: 'contain' }).png().toFile(path.join(LOGO_SET, s.name))
  }
  fs.writeFileSync(path.join(LOGO_SET, 'Contents.json'), JSON.stringify({
    images: launchSizes.map((s, i) => ({
      idiom: 'universal',
      filename: s.name,
      scale: `${i + 1}x`,
    })),
    info: { version: 1, author: 'cumora' },
    properties: { 'preserves-vector-representation': false, 'template-rendering-intent': 'original' },
  }, null, 2))

  console.log(`\nWrote ${ICON_SPECS.length} icons + splash + launch-logo to ${path.relative(ROOT, IOS_ASSETS)}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
