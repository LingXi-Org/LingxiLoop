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
  // Both product utilities stay browser-free; cover source runs in the pinned
  // QuickJS/WASM guest, with a disposable Worker owning resource termination.
  assert.doesNotMatch(serverImage, /puppeteer|chromium/i)
  assert.equal(productionDependencies['quickjs-emscripten-core'], '0.32.0')
  assert.equal(productionDependencies['@jitl/quickjs-wasmfile-release-sync'], '0.32.0')
  const coverRenderer = readFileSync(path.join(repositoryRoot, 'server/src/modules/case-covers/cover-renderer.ts'), 'utf8')
  const coverWorker = readFileSync(path.join(repositoryRoot, 'server/src/modules/case-covers/cover-vm-worker.ts'), 'utf8')
  const coverVm = readFileSync(path.join(repositoryRoot, 'src/features/cases/cover-vm/runtime.ts'), 'utf8')
  assert.match(coverRenderer, /new Worker\(new URL\('\.\/cover-vm-worker\.mjs'/)
  assert.match(coverRenderer, /env:\s*\{\},\s*execArgv:\s*\[\],\s*resourceLimits:\s*COVER_WORKER_LIMITS/)
  assert.match(coverRenderer, /parseCoverProgram\(program\)/)
  assert.match(coverRenderer, /worker\.terminate\(\)/)
  assert.match(coverVm, /runtime\.setMemoryLimit\(VM_BUDGET\.heap\)/)
  assert.match(coverVm, /runtime\.setMaxStackSize\(VM_BUDGET\.stack\)/)
  assert.match(coverVm, /runtime\.setInterruptHandler\(/)
  assert.match(coverVm, /runtime\.removeModuleLoader\(\)/)
  assert.match(coverVm, /context\.evalCode\(/)
  assert.doesNotMatch(coverVm, /\b(?:newFunction|setModuleLoader)\s*\(/)
  assert.doesNotMatch(coverRenderer + coverWorker, /\beval\s*\(|\bnew\s+Function\s*\(/)
  assert.match(coverWorker, /postMessage\(\{ type: 'frame', frame \}\)/)
  assert.match(coverRenderer, /coverFrameSvg\(/)
  assert.doesNotMatch(coverRenderer, /--no-sandbox|--disable-setuid-sandbox/)
})
