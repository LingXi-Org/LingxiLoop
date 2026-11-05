import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inflateSync } from 'node:zlib'
import katex from 'katex'
import { createFixture, sha256 } from './native-artifact-fixture.mjs'
import { validateArtifactDocument, createDocument } from '../shared/artifact-document.ts'
import { applyOperations, prepareBatch } from '../shared/artifact-operations.ts'

test('50-page acceptance fixture has distinct decoded images and source formulas on every page in both formats', () => {
  for (const kind of ['design', 'slides']) {
    const fixture = createFixture(kind)
    const document = validateArtifactDocument(fixture.document)
    assert.equal(document.pageOrder.length, 50)
    assert.equal(new Set(fixture.images.map(image => image.sha256)).size, 50)
    assert.equal(fixture.manifest.formulas, 50)
    assert.equal(fixture.legacyFiles.size, 51)
    for (const [index, id] of document.pageOrder.entries()) {
      const page = document.pages[id]
      assert.equal(page.nodes[`${id}-heading`].text, `验收页面 ${index + 1}`)
      assert.ok(page.nodes[`${id}-formula`].source.length)
      assert.match(katex.renderToString(page.nodes[`${id}-formula`].source, { throwOnError: true, trust: false }), /class="katex"/)
      const source = fixture.legacyFiles.get(kind === 'slides' ? `project/slides/${id}.html` : `project/Page${index + 1}.dc.html`).toString()
      assert.ok(source.includes(`验收页面 ${index + 1}`))
      assert.ok(source.includes('\\[') && source.includes('<img '))
      const image = fixture.images[index], payloads = []
      assert.equal(sha256(image.bytes), image.sha256)
      for (let offset = 8; offset < image.bytes.length;) {
        const length = image.bytes.readUInt32BE(offset), type = image.bytes.toString('ascii', offset + 4, offset + 8)
        if (type === 'IDAT') payloads.push(image.bytes.subarray(offset + 8, offset + 8 + length))
        offset += 12 + length
      }
      assert.equal(inflateSync(Buffer.concat(payloads)).length, 360 * (1 + 640 * 3))
    }
    const empty = createDocument(kind, document.id)
    const operations = [...Object.values(document.assets).map(asset => ({ type: 'asset.set', asset })),
      ...Object.values(document.themes).map(theme => ({ type: 'theme.set', theme })),
      { type: 'document.patch', patch: { title: document.title, themeId: document.themeId } },
      ...document.pageOrder.map((id, index) => ({ type: 'page.insert', index, page: document.pages[id] }))]
    const saved = applyOperations(empty, prepareBatch(empty, operations, `fixture-${kind}`)).document
    assert.deepEqual(saved.pages, document.pages)
    assert.deepEqual(saved.assets, document.assets)
  }
})
