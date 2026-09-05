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
  assert.doesNotMatch(serverImage, /(?:puppeteer|chromium)/i)
})
