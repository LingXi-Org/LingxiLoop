import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inflateSync } from 'node:zlib'
import katex from 'katex'
import { DomUtils, parseDocument } from 'htmlparser2'
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
    assert.equal(fixture.manifest.version, 2)
    assert.equal(fixture.manifest.isolatedBlocks.length, 1)
    assert.equal(fixture.legacyFiles.size, 51)
    for (const [index, id] of document.pageOrder.entries()) {
      const page = document.pages[id]
      assert.equal(page.nodes[`${id}-heading`].text, `验收页面 ${index + 1}`)
      assert.ok(page.nodes[`${id}-formula`].source.length)
      assert.match(katex.renderToString(page.nodes[`${id}-formula`].source, { throwOnError: true, trust: false }), /class="katex"/)
      const source = fixture.legacyFiles.get(kind === 'slides' ? `project/slides/${id}.html` : `project/Page${index + 1}.dc.html`).toString()
      assert.ok(source.includes(`验收页面 ${index + 1}`))
      assert.ok(source.includes('\\[') && source.includes('<img '))
      const iframe = DomUtils.findOne(node => node.type === 'tag' && node.name === 'iframe', parseDocument(source).children)
      if (index === 24) {
        const embedNode = page.nodes['page-25-isolated'], embed = embedNode.embed
        assert.equal(page.nodeOrder.length, 7)
        assert.equal(embed.previewAssetId, 'image-25')
        assert.equal(embed.sourceHash, sha256(embed.source))
        assert.equal(fixture.manifest.isolatedBlocks[0].sourceSha256, embed.sourceHash)
        assert.equal(fixture.manifest.isolatedBlocks[0].previewSha256, fixture.images[index].sha256)
        assert.equal(iframe.attribs.sandbox, 'allow-scripts')
        assert.equal(iframe.attribs.srcdoc, embed.source, 'legacy and native isolated source is byte-identical')
        const imageElement = DomUtils.findOne(node => node.type === 'tag' && node.name === 'img', parseDocument(embed.source).children)
        assert.equal(imageElement.attribs.src, `data:image/png;base64,${fixture.images[index].bytes.toString('base64')}`, 'the fixed preview is the exact initial embedded raster')
        assert.match(embed.source, /image\.addEventListener\('click',toggle\)/)
      } else {
        assert.equal(page.nodeOrder.length, 6)
        assert.equal(iframe, null)
      }
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

test('isolated source and semantic hash stay fixed across fixture origins and document IDs', () => {
  const baseline = createFixture('slides', 'baseline', Array.from({ length: 50 }, (_, i) => `http://127.0.0.1:24411/native-artifact-fixture/image-${i + 1}.png`))
  const candidate = createFixture('slides', 'candidate', Array.from({ length: 50 }, (_, i) => `http://127.0.0.1:24412/native-artifact-fixture/image-${i + 1}.png`))
  assert.equal(baseline.manifest.semanticSha256, candidate.manifest.semanticSha256)
  assert.deepEqual(baseline.document.pages['page-25'].nodes['page-25-isolated'].embed, candidate.document.pages['page-25'].nodes['page-25-isolated'].embed)
  assert.notEqual(baseline.manifest.nativeSha256, candidate.manifest.nativeSha256)
})
