import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import test from 'node:test'
import { retainEditorAssets, EDITOR_ASSET_RETENTION_MS, editorAssetPreparation } from './retain-editor-assets.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'retained-editor-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const sourceRoot = join(root, 'source'), cacheRoot = join(root, 'cache')
  for (const kind of ['design', 'slides']) await mkdir(join(sourceRoot, kind + '-editor/assets'), { recursive: true })
  const put = async (kind, name, bytes) => writeFile(join(sourceRoot, kind + '-editor/assets', name), bytes)
  return { root, sourceRoot, cacheRoot, put }
}

test('retain the complete public graph including unused lazy resources, not project files or grants', async t => {
  const f = await fixture(t), bytes = Buffer.from('export const unusedLazyFeature = true;')
  const name = 'design-' + createHash('sha256').update(bytes).digest('hex') + '.js'
  await f.put('design', name, bytes)
  await f.put('design', name + '.br', brotliCompressSync(bytes))
  await f.put('slides', 'exports-ABCDEFGH.js', bytes)
  await f.put('slides', 'exports-ABCDEFGH.js.gz', gzipSync(bytes))
  await f.put('slides', 'document.json', 'private')
  await f.put('slides', 'Main.dc.html', 'private')
  const now = Date.now()
  await retainEditorAssets({ ...f, now, prune: true })
  assert.deepEqual(await readFile(join(f.cacheRoot, 'design', name)), bytes)
  assert.deepEqual((await readdir(join(f.cacheRoot, 'slides'))).sort(), ['exports-ABCDEFGH.js', 'exports-ABCDEFGH.js.gz'])
  await rm(f.sourceRoot, { recursive: true })
  assert.deepEqual(await readFile(join(f.cacheRoot, 'slides/exports-ABCDEFGH.js')), bytes, 'old, never-used feature outlives the image')
})

test('only older-than-retention code is pruned after source and target images are copied', async t => {
  const f = await fixture(t), now = Date.now()
  await f.put('slides', 'exports-ABCDEFGH.js', 'old lazy export')
  await retainEditorAssets({ ...f, now: now - EDITOR_ASSET_RETENTION_MS - 1000 })
  const stale = join(f.cacheRoot, 'slides/stale-ABCDEFGH.js')
  await writeFile(stale, 'expired code');await utimes(stale, 0, 0)
  await retainEditorAssets({ ...f, now, prune: true })
  assert.equal(await readFile(join(f.cacheRoot, 'slides/exports-ABCDEFGH.js'), 'utf8'), 'old lazy export')
  assert.ok(!(await readdir(join(f.cacheRoot, 'slides'))).includes('stale-ABCDEFGH.js'))
  const grants = await readFile('server/src/modules/artifacts/grants.ts', 'utf8')
  assert.match(grants, /GRANT_TTL_MS = 12 \* 60 \* 60_000/)
  assert.ok(EDITOR_ASSET_RETENTION_MS > 12 * 60 * 60_000, 'retain longer than every outstanding grant')
})

test('a conflicting immutable URL or cache limit refuses preparation without evicting live code', async t => {
  const f = await fixture(t)
  await f.put('slides', 'exports-ABCDEFGH.js', 'original code')
  await retainEditorAssets(f)
  await f.put('slides', 'exports-ABCDEFGH.js', 'different code')
  await assert.rejects(retainEditorAssets(f), /immutable/)
  assert.equal(await readFile(join(f.cacheRoot, 'slides/exports-ABCDEFGH.js'), 'utf8'), 'original code')
  await f.put('slides', 'exports-ABCDEFGH.js', 'original code')
  await assert.rejects(retainEditorAssets({ ...f, prune: true, maxBytes: 1 }), /limit/)
  assert.equal(await readFile(join(f.cacheRoot, 'slides/exports-ABCDEFGH.js'), 'utf8'), 'original code')
})

test('a source symlink or invalid compressed representation never enters the cache', async t => {
  const f = await fixture(t)
  await writeFile(join(f.root, 'private'), 'secret')
  await symlink(join(f.root, 'private'), join(f.sourceRoot, 'slides-editor/assets/exports-ABCDEFGH.js'))
  await assert.rejects(retainEditorAssets(f), /regular file/)
  await rm(join(f.sourceRoot, 'slides-editor/assets/exports-ABCDEFGH.js'))
  await f.put('slides', 'exports-ABCDEFGH.js', 'actual')
  await f.put('slides', 'exports-ABCDEFGH.js.br', brotliCompressSync(Buffer.from('wrong')))
  await assert.rejects(retainEditorAssets(f), /compressed/)
})

test('a full staging area refuses new bytes before copying and interrupted copy leftovers are recoverable', async t => {
  const f = await fixture(t)
  await f.put('slides', 'exports-ABCDEFGH.js', 'public code')
  await assert.rejects(retainEditorAssets({ ...f, maxBytes: 1, stagingAllowanceBytes: 0 }), /staging limit/)
  assert.deepEqual(await readdir(join(f.cacheRoot, 'slides')), [])
  await writeFile(join(f.cacheRoot, 'slides/exports-ABCDEFGH.js.12345678-1234-1234-1234-123456789012.tmp'), 'partial public copy')
  await retainEditorAssets({ ...f, prune: true })
  assert.deepEqual(await readdir(join(f.cacheRoot, 'slides')), ['exports-ABCDEFGH.js'])
})

test('preparation captures both observed source images and target on both hosts before rollout', async () => {
  const calls = [], oldA = 'ghcr.io/lingxi-org/lingxiloop-server:' + 'a'.repeat(24), oldB = oldA.replace(/a{24}$/, 'b'.repeat(24)), target = oldA.replace(/a{24}$/, 'c'.repeat(24))
  await editorAssetPreparation({ target, helper: '// fixed helper', observe: async slot => slot === 'a' ? oldA : oldB, prepare: async (slot, script) => { calls.push(slot);for (const image of [oldA, oldB, target]) assert.ok(script.includes(image));assert.match(script, /--network none/);assert.match(script, /flock/);assert.doesNotMatch(script, /docker stop|compose up|db:migrate/) } })
  assert.deepEqual(calls.sort(), ['a', 'b'])
  await assert.rejects(editorAssetPreparation({ target, helper: '', observe: async () => 'untrusted/image:latest', prepare: async () => assert.fail('must refuse before host writes') }), /source image/)
})

test('generated retention command passes its heredoc to Node inside the image', async t => {
  const f = await fixture(t), bin = join(f.root, 'bin')
  await mkdir(bin)
  // Docker closes a container's stdin unless -i is passed. Execute the exact
  // generated shell script with that stdin contract; no host mounts or remote
  // deployment are needed to detect a silently skipped retention helper.
  await writeFile(join(bin, 'docker'), `#!/bin/sh
if [ "$1" = image ]; then exit 0; fi
if [ "$FAKE_DOCKER_EMPTY" = 1 ]; then exit 0; fi
for arg do
  if [ "$arg" = -i ]; then exec node --input-type=module; fi
done
exec node --input-type=module </dev/null
`, { mode: 0o755 })
  const target = 'ghcr.io/lingxi-org/lingxiloop-server:' + 'c'.repeat(24)
  let prepared = 0
  await editorAssetPreparation({
    target,
    helper: 'export async function retainEditorAssets() { return {copied:7} }',
    observe: async () => target,
    prepare: async (_slot, script) => {
      const local = script.replaceAll('/opt/lingxiloop/editor-assets', f.cacheRoot)
      const result = spawnSync('bash', ['-s'], {
        input: `set -euo pipefail\n${local}\n`, encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_DOCKER_EMPTY: '0' },
      })
      assert.equal(result.status, 0, result.stderr)
      assert.match(result.stdout, /"copied":7/, 'retention helper must actually execute')
      const empty = spawnSync('bash', ['-s'], {
        input: `set -euo pipefail\n${local}\n`, encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_DOCKER_EMPTY: '1' },
      })
      assert.notEqual(empty.status, 0, 'empty successful container must fail closed')
      assert.match(empty.stderr, /produced no retention report/)
      prepared++
    },
  })
  assert.equal(prepared, 2, 'both hosts must run the helper')
})


test('a missing observed app image blocks retention rather than guessing a rollout state', async () => {
  const target = 'ghcr.io/lingxi-org/lingxiloop-server:' + 'c'.repeat(24)
  const writes = []
  await assert.rejects(editorAssetPreparation({target, helper:'', observe:async slot => slot === 'a' ? '' : target,
    prepare:async slot => { writes.push(slot) }}), /source image/)
  assert.deepEqual(writes, [], 'unknown app state must block before any host write')
})
