import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const retired = ['cu', 'mora'].join('')
const canonicalLogo = 'assets/lingxiloop-logo.svg'
const avatarDefinition = 'src/assets/lingxiloop.avatar.json'
const logoMirrors = [
  'public/logo.svg',
  'public/favicon.svg',
  'website/assets/logo.svg',
  'website/assets/favicon.svg',
]
const requiredBrandAssets = [
  canonicalLogo,
  avatarDefinition,
  ...logoMirrors,
  'public/favicon.ico',
  'public/favicon-32.png',
  'public/icon-192.png',
  'public/icon.png',
  'public/logo.png',
  'build/icon.png',
  'build/icons/icon.ico',
  'build/icons/icon.icns',
  'build/tray-template.png',
  'website/assets/favicon.ico',
  'website/assets/favicon-32.png',
  'website/assets/icon-192.png',
  'website/assets/logo.png',
]
const expectedPngDimensions = new Map([
  ['public/favicon-32.png', [32, 32]],
  ['public/icon-192.png', [192, 192]],
  ['public/icon.png', [512, 512]],
  ['public/logo.png', [512, 512]],
  ['build/icon.png', [1024, 1024]],
  ['build/icons/16x16.png', [16, 16]],
  ['build/icons/32x32.png', [32, 32]],
  ['build/icons/256x256.png', [256, 256]],
  ['build/icons/1024x1024.png', [1024, 1024]],
  ['build/tray-template.png', [22, 22]],
  ['build/tray-template@2x.png', [44, 44]],
  ['build/tray-template@3x.png', [66, 66]],
  ['build/tray-template-unread.png', [22, 22]],
  ['build/tray-template-unread@2x.png', [44, 44]],
  ['build/tray-template-unread@3x.png', [66, 66]],
  ['website/assets/favicon-32.png', [32, 32]],
  ['website/assets/icon-192.png', [192, 192]],
  ['website/assets/logo.png', [512, 512]],
])
const obsoleteBrandAssets = [
  'assets/icon-background.png',
  'assets/icon-foreground.png',
  'assets/icon-only.png',
  'build/icon.src.png',
  'public/cloud.png',
  'public/cloud-blink.png',
]
const listed = spawnSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)

if (listed.status !== 0) {
  process.stderr.write(listed.stderr || 'Unable to enumerate repository files.\n')
  process.exit(1)
}

const failures = []
for (const file of requiredBrandAssets) {
  if (!existsSync(file)) failures.push(`${file}: required brand asset is missing`)
}
for (const file of obsoleteBrandAssets) {
  if (existsSync(file)) failures.push(`${file}: obsolete brand source must be removed`)
}

for (const [file, [expectedWidth, expectedHeight]] of expectedPngDimensions) {
  if (!existsSync(file)) {
    failures.push(`${file}: required PNG derivative is missing`)
    continue
  }
  const body = readFileSync(file)
  const pngSignature = body.subarray(0, 8).toString('hex')
  const width = body.readUInt32BE(16)
  const height = body.readUInt32BE(20)
  if (pngSignature !== '89504e470d0a1a0a' || width !== expectedWidth || height !== expectedHeight) {
    failures.push(`${file}: expected ${expectedWidth}x${expectedHeight} PNG, found ${width}x${height}`)
  }
}

for (const file of ['public/favicon.ico', 'website/assets/favicon.ico', 'build/icons/icon.ico']) {
  if (existsSync(file) && readFileSync(file).subarray(0, 4).toString('hex') !== '00000100') {
    failures.push(`${file}: invalid ICO header`)
  }
}
if (existsSync('build/icons/icon.icns') && readFileSync('build/icons/icon.icns').subarray(0, 4).toString() !== 'icns') {
  failures.push('build/icons/icon.icns: invalid ICNS header')
}

if (existsSync(canonicalLogo)) {
  const canonicalBody = readFileSync(canonicalLogo)
  for (const file of logoMirrors) {
    if (existsSync(file) && !canonicalBody.equals(readFileSync(file))) {
      failures.push(`${file}: SVG must be byte-identical to ${canonicalLogo}`)
    }
  }
}

if (existsSync(avatarDefinition)) {
  const definition = JSON.parse(readFileSync(avatarDefinition, 'utf8'))
  for (const expression of ['upward-side-glance', 'sleepy-squint', 'angry-brows']) {
    if (!definition.expressions?.[expression]) {
      failures.push(`${avatarDefinition}: missing required expression ${expression}`)
    }
  }
  if (definition.expressions?.['angry-brows']?.motion?.body !== 'shake') {
    failures.push(`${avatarDefinition}: angry-brows must retain its source body shake motion`)
  }
  const angryAnimation = definition.animations?.['brand-angry-shake']
  if (
    angryAnimation?.playbackMode !== 'loop'
    || angryAnimation.steps?.length !== 1
    || angryAnimation.steps[0]?.expression !== 'angry-brows'
  ) {
    failures.push(`${avatarDefinition}: brand-angry-shake must loop the angry-brows expression`)
  }
  const idleAnimation = definition.animations?.['brand-idle']
  if (
    idleAnimation?.playbackMode !== 'loop'
    || idleAnimation.steps?.length !== 1
    || idleAnimation.steps[0]?.expression !== 'upward-side-glance'
    || idleAnimation.steps[0]?.transition !== 'smooth'
    || idleAnimation.steps[0]?.transitionMs !== 420
    || idleAnimation.blink?.minIntervalMs !== 3400
    || idleAnimation.blink?.maxIntervalMs !== 6200
  ) {
    failures.push(`${avatarDefinition}: brand-idle must own the smooth upward-glance blink timeline`)
  }
  if (angryAnimation?.steps?.[0]?.transition !== 'smooth' || angryAnimation.steps[0]?.transitionMs !== 420) {
    failures.push(`${avatarDefinition}: brand-angry-shake must enter with a 420ms smooth transition`)
  }
}

if (existsSync('package.json')) {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
  if (packageJson.dependencies?.['@bible-strong/avatar-react'] !== '0.1.0') {
    failures.push('package.json: @bible-strong/avatar-react must stay pinned to 0.1.0')
  }
}

if (existsSync('src/desktop/WorkspaceRail.tsx')) {
  const workspaceRail = readFileSync('src/desktop/WorkspaceRail.tsx', 'utf8')
  if (!workspaceRail.includes('<BrandAvatar')) {
    failures.push('src/desktop/WorkspaceRail.tsx: product mark must use BrandAvatar')
  }
  if (/^\s*L\s*$/m.test(workspaceRail)) {
    failures.push('src/desktop/WorkspaceRail.tsx: static L product mark must not return')
  }
}

if (existsSync('src/components/BrandAvatar.tsx')) {
  const brandAvatar = readFileSync('src/components/BrandAvatar.tsx', 'utf8')
  if (!brandAvatar.includes('linear-gradient(135deg, #e0ffe2 0%, #ebffc7 100%)')) {
    failures.push('src/components/BrandAvatar.tsx: frame must retain the canonical SVG gradient')
  }
  if (!brandAvatar.includes("borderRadius: '18%'")) {
    failures.push('src/components/BrandAvatar.tsx: frame must retain the canonical SVG corner radius')
  }
}

for (const file of listed.stdout.split('\0').filter(Boolean)) {
  if (!existsSync(file)) continue
  if (file.toLowerCase().includes(retired)) failures.push(`${file}: retired brand in path`)

  const body = readFileSync(file)
  if (body.includes(0)) continue
  const text = body.toString('utf8').toLowerCase()
  if (text.includes(retired)) failures.push(`${file}: retired brand in content`)
}

if (failures.length > 0) {
  process.stderr.write(`Brand guard failed:\n${failures.join('\n')}\n`)
  process.exit(1)
}

console.log('Brand guard passed: LingxiLoop uses the canonical logo and dynamic avatar contract.')
