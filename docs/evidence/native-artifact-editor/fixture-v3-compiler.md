# Frozen Slides compiler validation for fixture v3

The actual compiler built from frozen commit
`d004312841026a4d90dfbd9e8292a55cc29a2e95` accepted all 50 generated legacy Slides
pages with no compiler errors. Every compiled image references the supplied
`project/ds/fixture/image-N.png` file. Page 25's compiled isolated HTML is
byte-identical to the native block: 8,776 bytes, SHA-256
`9a9101842761abc977010dee3a715a2c49f080db188d7244f9e6ebaac2ffd07a`.

The tested `server/assets/slides-editor/node/compiler.cjs` has SHA-256
`07a2d1a38dc7e8737fbaa5d0355d38541d6be05b3d55e2bebb5dbff759ed22f8`.
This check used the separate frozen checkout; no retired compiler or runtime
was added to the candidate application.

This is a compiler check, not a browser, authenticated-service or performance
result. Design retains the canonical `./support.js` marker documented by its
frozen authoring instructions. Its preview builder replaces that marker with
the genuine runtime; the fixture must not provide a replacement implementation.
Actual Design runtime injection and browser readiness still require the owning
browser acceptance run.

Run from the candidate checkout after building the exact frozen baseline at the
specified separate path:

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createFixture } from './scripts/native-artifact-fixture.mjs'

const baseline = '/workspace/scratch/lingxiloop-editor-baseline'
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: baseline, encoding: 'utf8',
}).trim()
assert.equal(commit, 'd004312841026a4d90dfbd9e8292a55cc29a2e95')
const { runtime } = createRequire(import.meta.url)(
  baseline + '/server/assets/slides-editor/node/compiler.cjs',
)
const fixture = createFixture('slides', 'compiler-validation',
  Array.from({ length: 50 }, (_, i) =>
    `https://localhost:24411/native-artifact-fixture/image-${i + 1}.png`),
)
const collect = (value, predicate, result = []) => {
  if (value && typeof value === 'object') {
    if (predicate(value)) result.push(value)
    for (const child of Object.values(value)) collect(child, predicate, result)
  }
  return result
}
let embed
for (let number = 1; number <= 50; number++) {
  const file = `project/slides/page-${number}.html`
  const compiled = runtime.compileSlideHtml(fixture.legacyFiles.get(file).toString())
  assert.deepEqual(compiled.errors, [], file)
  const expected = `project/ds/fixture/image-${number}.png`
  const images = collect(compiled.content, value => value.kind === 'img')
  assert.equal(images.length, 1, file)
  assert.equal(images[0].src, expected, file)
  assert.ok(fixture.legacyFiles.has(expected))
  if (number === 25) {
    const blocks = collect(compiled.content, value => value.kind === 'html')
    assert.equal(blocks.length, 1)
    embed = blocks[0].html
  }
}
const native = fixture.document.pages['page-25'].nodes['page-25-isolated'].embed
assert.equal(embed, native.source)
assert.equal(Buffer.byteLength(embed), 8776)
const hash = createHash('sha256').update(embed).digest('hex')
assert.equal(hash, '9a9101842761abc977010dee3a715a2c49f080db188d7244f9e6ebaac2ffd07a')
assert.equal(hash, native.sourceHash)
console.log({
  commit, pages: 50, errors: 0, imageReferences: 50,
  embedBytes: Buffer.byteLength(embed), embedSha256: hash,
  nativeLegacySourceEqual: true, designRuntimeBrowserCheck: 'pending',
})
NODE
```

Observed result:

```json
{
  "commit": "d004312841026a4d90dfbd9e8292a55cc29a2e95",
  "pages": 50,
  "errors": 0,
  "imageReferences": 50,
  "embedBytes": 8776,
  "embedSha256": "9a9101842761abc977010dee3a715a2c49f080db188d7244f9e6ebaac2ffd07a",
  "nativeLegacySourceEqual": true,
  "designRuntimeBrowserCheck": "pending"
}
```
