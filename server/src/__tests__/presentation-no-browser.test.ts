import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const presentationsRoot = path.join(repositoryRoot, 'server/src/modules/presentations')

test('presentation generation and validation never launch a real browser', () => {
  const moduleSource = readdirSync(presentationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => readFileSync(path.join(presentationsRoot, entry.name), 'utf8'))
    .join('\n')
  const productionDependencies = JSON.parse(
    readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'),
  ).dependencies as Record<string, string>
  const serverImage = readFileSync(
    path.join(repositoryRoot, 'server/docker/lingxiloop-server.Dockerfile'),
    'utf8',
  )

  assert.doesNotMatch(moduleSource, /(?:puppeteer|chromium|launchPersistentContext)/i)
  assert.equal(productionDependencies.puppeteer, undefined)
  // Presentation generation stays browser-free. Hairline covers now need a
  // separately isolated first-frame renderer in this shared Worker image.
  assert.doesNotMatch(serverImage, /puppeteer/i)
  assert.match(serverImage, /ARG CASE_COVER_CHROMIUM_VERSION=156\.0\.8078\.47-1~deb12u1/)
  assert.match(serverImage, /chromium=\$\{CASE_COVER_CHROMIUM_VERSION\}/)
  const coverRenderer = readFileSync(path.join(repositoryRoot, 'server/src/modules/case-covers/cover-renderer.ts'), 'utf8')
  assert.match(coverRenderer, /--unshare-all/)
  assert.match(coverRenderer, /--clearenv/)
  assert.doesNotMatch(coverRenderer, /--no-sandbox|--disable-setuid-sandbox/)
})
