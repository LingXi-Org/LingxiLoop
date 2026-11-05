import test from 'node:test'
import assert from 'node:assert/strict'
import { lockedClosure, generateProfiles } from './scoped-dependencies.mjs'

test('closure resolves nested dependencies, peers and platform optionals without unrelated packages', () => {
  const packages = {
    '': {},
    'node_modules/app': { dependencies: { shared: '*' }, peerDependencies: { peer: '*', absent: '*' }, peerDependenciesMeta: { absent: { optional: true } }, optionalDependencies: { platform: '*' } },
    'node_modules/shared': { version: '1' },
    'node_modules/app/node_modules/shared': { version: '2', integrity: 'locked' },
    'node_modules/peer': { version: '3' },
    'node_modules/platform': { os: ['darwin'], optional: true },
    'node_modules/electron': { version: '99' },
  }
  const manifest = { name: 'fixture', version: '1', dependencies: { app: '*' } }
  const result = lockedClosure({ packages }, manifest).packages
  assert.deepEqual(Object.keys(result).sort(), ['', 'node_modules/app', 'node_modules/app/node_modules/shared', 'node_modules/peer', 'node_modules/platform'])
  assert.deepEqual(result['node_modules/app/node_modules/shared'], packages['node_modules/app/node_modules/shared'])
  delete packages['node_modules/peer']
  assert.throws(() => lockedClosure({ packages }, manifest), /Missing locked dependency peer/)
})

test('Web profile cannot gain unrelated tool families through a transitive graph', () => {
  const files = new Map(generateProfiles())
  const packages = JSON.parse(files.get('server/build/web/package-lock.json')).packages
  for (const name of ['electron', 'e2e', '@e2e-dev/web', 'shadcn', 'wrangler', 'workerd', '@cloudflare/vitest-pool-workers']) {
    assert.ok(!Object.keys(packages).some(key => key.endsWith(`node_modules/${name}`)), `${name} entered Web graph`)
  }
})

test('integration artifact builds retain the locked KaTeX renderer and stylesheet package', () => {
  const files = new Map(generateProfiles())
  const manifest = JSON.parse(files.get('server/build/integration/package.json'))
  const lock = JSON.parse(files.get('server/build/integration/package-lock.json'))
  assert.equal(manifest.dependencies.katex, '0.16.47')
  assert.equal(lock.packages['node_modules/katex'].version, manifest.dependencies.katex)
})

test('authenticated integration checks retain the actual control Worker login runtime', () => {
  const files = new Map(generateProfiles())
  const manifest = JSON.parse(files.get('server/build/integration/package.json'))
  const lock = JSON.parse(files.get('server/build/integration/package-lock.json'))
  for (const name of ['miniflare', 'better-auth', 'drizzle-orm', 'hono', 'zod']) {
    assert.ok(manifest.dependencies[name], `${name} is required by the real sign-in fixture`)
    assert.ok(lock.packages[`node_modules/${name}`])
  }
})
