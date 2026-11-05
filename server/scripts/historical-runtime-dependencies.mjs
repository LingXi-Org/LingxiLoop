// Install only the immutable, published historical SDK dependency closure.
// Current SDK4 host dependencies are intentionally not a substitute for it.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
const execute = promisify(execFile)
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export function assertHistoricalDependencies(dependencies, lock) {
  for (const [name, version] of Object.entries(dependencies)) {
    const installed = lock.packages?.[`node_modules/${name}`]
    if (!installed) throw Object.assign(new Error('Historical SDK dependency is absent from its isolated closure'), { code: 'HISTORICAL_DEPENDENCIES_MISSING', dependency: name })
    if (installed.version !== version) throw Object.assign(new Error('Historical SDK dependency differs from its immutable source lock'), { code: 'HISTORICAL_DEPENDENCY_MISMATCH', dependency: name })
  }
}

export async function historicalDependencySource(root) {
  const directory = join(root, 'server/fixtures/historical-runtime-dependencies')
  const [manifestBytes, lockBytes, provenanceBytes] = await Promise.all(['package.json', 'package-lock.json', 'source.json'].map(file => readFile(join(directory, file))))
  const provenance = JSON.parse(provenanceBytes), manifest = JSON.parse(manifestBytes), lock = JSON.parse(lockBytes)
  assert.equal(sha256(manifestBytes), provenance.manifestSha256, 'Historical dependency manifest integrity changed')
  assert.equal(sha256(lockBytes), provenance.lockSha256, 'Historical dependency lock integrity changed')
  assert.deepEqual(lock.packages[''], manifest)
  assertHistoricalDependencies(manifest.dependencies, lock)
  for (const [path, entry] of Object.entries(lock.packages)) if (path) {
    const archive = new URL(entry.resolved)
    assert.ok(archive.protocol === 'https:' && ['registry.npmjs.org', 'registry.npmmirror.com'].includes(archive.hostname)
      && !archive.username && !archive.password && !archive.search && !archive.hash, 'Historical dependencies must use their immutable public registry records')
    assert.match(entry.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/)
  }
  return { manifest, lock, manifestBytes, lockBytes }
}

export async function provisionHistoricalDependencies(root, fixture, sdk, env) {
  const source = await historicalDependencySource(root)
  const sdkPackage = JSON.parse(await readFile(join(sdk, 'package.json'), 'utf8'))
  const dependencies = sdkPackage.dependencies ?? {}
  // This check precedes any SDK import. Unknown historical declarations require
  // their own reviewed source lock rather than a version-range install.
  assertHistoricalDependencies(dependencies, source.lock)
  let directory = env.LINGXILOOP_HISTORICAL_DEPENDENCIES_DIR
  if (directory) {
    assert.ok(isAbsolute(directory), 'Historical dependency cache must be absolute')
    assert.deepEqual(await readFile(join(directory, 'package.json')), source.manifestBytes)
    assert.deepEqual(await readFile(join(directory, 'package-lock.json')), source.lockBytes)
  } else {
    directory = join(fixture, 'historical-runtime-dependencies')
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'package.json'), source.manifestBytes)
    await writeFile(join(directory, 'package-lock.json'), source.lockBytes)
    await execute('npm', ['ci', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund', '--loglevel', 'error',
      '--userconfig', env.LINGXILOOP_TEST_PACKAGE_USERCONFIG ?? join(root, '.npmrc'), '--fetch-retries=0', '--fetch-timeout=60000'],
    { cwd: directory, env, timeout: 180000, maxBuffer: 2 * 1024 * 1024 })
  }
  for (const [name, version] of Object.entries(dependencies)) {
    const installed = join(directory, 'node_modules', name)
    const actual = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'))
    assert.equal(actual.version, version, 'Historical installed dependency version changed')
    const link = join(sdk, 'node_modules', name)
    await mkdir(dirname(link), { recursive: true })
    await symlink(installed, link, 'junction')
  }
  return directory
}
