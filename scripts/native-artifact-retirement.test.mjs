import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = fileURLToPath(new URL('../', import.meta.url))
const resources = resolve(root, 'third_party/baoyu-design')
const read = path => readFileSync(resolve(root, path), 'utf8')

test('retained baoyu resources match the manifest and contain no editor implementation', () => {
  const manifest = JSON.parse(read('third_party/baoyu-design/retained-manifest.json'))
  assert.equal(manifest.commit, '016b39d7fdcc30bfacee31ea5541498ac53921c6')
  const actual = readdirSync(resources, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())
    .map(entry => resolve(entry.parentPath, entry.name).slice(resources.length + 1).replaceAll('\\', '/'))
    .filter(path => path !== 'README.md' && path !== 'retained-manifest.json').sort()
  assert.deepEqual(manifest.files.map(file => file.path).sort(), actual)
  for (const file of manifest.files) {
    assert.doesNotMatch(file.path, /(?:^|\/)(?:slides-source|editor|scripts)(?:\/|$)|\.(?:[cm]?js|[jt]sx?|py|sh)$/)
    const bytes = readFileSync(resolve(resources, file.path))
    assert.equal(bytes.byteLength, file.bytes, file.path)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path)
  }
  for (const path of ['host/slides-builtin-style.json', 'host/builtin-themes.json', 'LICENSE',
    'upstream/claude-design/artifact-type/reference/format.md', 'upstream/claude-slides/artifact-type/reference/format.md']) {
    assert.ok(actual.includes(path), `required preserved resource: ${path}`)
  }
})

test('build and release no longer build, preload or retain old editor application assets', () => {
  const scripts = JSON.parse(read('package.json')).scripts
  for (const key of ['build:design-editor', 'build:slides-editor']) assert.equal(scripts[key], undefined)
  assert.doesNotMatch(JSON.stringify(scripts), /build-(?:design|slides)-editor/)
  for (const path of ['server/docker/lingxiloop-server.Dockerfile', 'deploy/cli.mjs', 'deploy/app-a/compose.yml', 'deploy/app-b/compose.yml']) {
    assert.doesNotMatch(read(path), /build-(?:design|slides)-editor|AS (?:design|slides)-build|retain-editor-assets|\/opt\/lingxiloop\/editor-assets/, path)
  }
  for (const slot of ['a', 'b']) assert.match(read(`deploy/app-${slot}/compose.yml`),
    /NATIVE_ARTIFACT_WRITES_ENABLED: \$\{NATIVE_ARTIFACT_WRITES_ENABLED:-false\}/,
    'both Web and Worker inherit the explicit production conversion barrier')
  for (const path of ['scripts/build-design-editor.mjs', 'scripts/build-slides-editor.mjs',
    'third_party/baoyu-design/slides-source', 'third_party/baoyu-design/upstream/claude-design/scripts/editor',
    'third_party/baoyu-design/upstream/claude-slides/scripts/editor']) assert.equal(existsSync(resolve(root, path)), false, path)
})
