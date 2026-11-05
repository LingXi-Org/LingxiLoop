import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inflateSync } from 'node:zlib'
import katex from 'katex'
import { DomUtils, parseDocument } from 'htmlparser2'
import { createFixture, FIXTURE_VERSION, sha256 } from './native-artifact-fixture.mjs'
import { validateArtifactDocument, createDocument } from '../shared/artifact-document.ts'
import { applyOperations, prepareBatch } from '../shared/artifact-operations.ts'

const fixtures = new Map()
const fixtureFor = kind => {
  if (!fixtures.has(kind)) fixtures.set(kind, createFixture(kind))
  return fixtures.get(kind)
}

function rasterBytes(dataUrl) {
  assert.match(dataUrl, /^data:image\/png;base64,/)
  return Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64')
}

test('50-page acceptance fixture has distinct decoded images and source formulas on every page in both formats', () => {
  for (const kind of ['design', 'slides']) {
    const fixture = fixtureFor(kind)
    const document = validateArtifactDocument(fixture.document)
    assert.equal(document.pageOrder.length, 50)
    assert.equal(new Set(fixture.images.map(image => image.sha256)).size, 50)
    assert.equal(fixture.manifest.formulas, 50)
    assert.equal(fixture.manifest.version, FIXTURE_VERSION)
    assert.equal(FIXTURE_VERSION, 3)
    assert.equal(fixture.manifest.isolatedBlocks.length, 1)
    assert.equal(fixture.legacyFiles.size, kind === 'slides' ? 101 : 51)
    assert.equal(Object.keys(document.assets).length, 51)
    assert.equal(fixture.manifest.imageBytes, 30_877_750, 'the 50 full-size page rasters remain unchanged')
    for (const [index, id] of document.pageOrder.entries()) {
      const page = document.pages[id]
      assert.equal(page.nodes[`${id}-heading`].text, `验收页面 ${index + 1}`)
      assert.ok(page.nodes[`${id}-formula`].source.length)
      assert.match(katex.renderToString(page.nodes[`${id}-formula`].source, { throwOnError: true, trust: false }), /class="katex"/)
      const source = fixture.legacyFiles.get(kind === 'slides' ? `project/slides/${id}.html` : `project/Page${index + 1}.dc.html`).toString()
      assert.ok(source.includes(`验收页面 ${index + 1}`))
      assert.ok(source.includes('\\[') && source.includes('<img '))
      const asides = DomUtils.findAll(node => node.type === 'tag' && node.name === 'aside', parseDocument(source).children)
      const legacySpeakerNotes = asides.map(node => DomUtils.textContent(node)).join('\n')
      assert.equal(page.notes, legacySpeakerNotes, 'native and legacy initial speaker notes must match exactly')
      assert.equal(page.notes, kind === 'slides' ? `第 ${index + 1} 页讲者备注，保存和导出后必须保留。` : '')
      const iframe = DomUtils.findOne(node => node.type === 'tag' && node.name === 'iframe', parseDocument(source).children)
      if (index === 24) {
        const embedNode = page.nodes['page-25-isolated'], embed = embedNode.embed
        assert.equal(page.nodeOrder.length, 7)
        assert.equal(embed.previewAssetId, 'image-isolated')
        assert.equal(embed.sourceHash, sha256(embed.source))
        assert.equal(fixture.manifest.isolatedBlocks[0].sourceSha256, embed.sourceHash)
        const preview = document.assets[embed.previewAssetId], previewBytes = rasterBytes(preview.url)
        assert.equal(sha256(previewBytes), preview.sha256)
        assert.equal(fixture.manifest.isolatedBlocks[0].previewSha256, preview.sha256)
        assert.equal(preview.width, 64)
        assert.equal(preview.height, 36)
        assert.equal(previewBytes.readUInt32BE(16), 64)
        assert.equal(previewBytes.readUInt32BE(20), 36)
        assert.equal(fixture.manifest.isolatedBlocks[0].sourceBytes, Buffer.byteLength(embed.source))
        assert.ok(Buffer.byteLength(embed.source) <= 16 * 1024, 'frozen Slides x-embed accepts at most 16 KiB')
        if (kind === 'slides') {
          assert.equal(iframe, null, 'the frozen Slides compiler forbids raw iframes')
          const isolatedSource = source.slice(source.indexOf('>', source.indexOf('<x-embed ')) + 1, source.lastIndexOf('</x-embed>'))
          assert.equal(isolatedSource, embed.source, 'legacy x-embed and native isolated source are byte-identical')
        } else {
          assert.equal(iframe.attribs.sandbox, 'allow-scripts')
          assert.equal(iframe.attribs.srcdoc, embed.source, 'legacy iframe and native isolated source are byte-identical')
        }
        const imageElement = DomUtils.findOne(node => node.type === 'tag' && node.name === 'img', parseDocument(embed.source).children)
        assert.equal(imageElement.attribs.src, preview.url, 'the fixed preview is the exact initial embedded raster')
        assert.match(embed.source, /image\.addEventListener\('click',toggle\)/)
      } else {
        assert.equal(page.nodeOrder.length, 6)
        assert.equal(iframe, null)
        assert.ok(!source.includes('<x-embed'))
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
    assert.equal(fixture.manifest.speakerNotes, kind === 'slides' ? 50 : 0)
    if (kind === 'design') {
      assert.deepEqual(JSON.parse(fixture.legacyFiles.get('project/canvas.json')).notes, {}, 'legacy canvas notes are spatial annotations, not page speaker strings')
    }
    const operations = [...Object.values(document.assets).map(asset => ({ type: 'asset.set', asset })),
      ...Object.values(document.themes).map(theme => ({ type: 'theme.set', theme })),
      { type: 'document.patch', patch: { title: document.title, themeId: document.themeId } },
      ...document.pageOrder.map((id, index) => ({ type: 'page.insert', index, page: document.pages[id] }))]
    const saved = applyOperations(empty, prepareBatch(empty, operations, `fixture-${kind}`)).document
    assert.deepEqual(saved.pages, document.pages)
    assert.deepEqual(saved.assets, document.assets)
  }
})

test('all legacy resource references resolve to supplied assets except the documented injected Design runtime marker', () => {
  for (const kind of ['design', 'slides']) {
    const fixture = fixtureFor(kind)
    const expectedImages = new Map(fixture.images.map(image => [`/native-artifact-fixture/${image.filename}`, image]))
    let runtimeMarkers = 0
    const checkSource = (source, path) => {
      const nodes = DomUtils.findAll(node => Boolean(node.attribs), parseDocument(source).children)
      const checkReference = (reference, node) => {
        if (reference.startsWith('data:image/png;base64,')) {
          assert.ok(rasterBytes(reference).length > 0)
          return
        }
        if (kind === 'design' && node.name === 'script' && reference === './support.js') {
          runtimeMarkers++
          return // Canonical authoring marker replaced by the genuine frozen editor runtime.
        }
        if (expectedImages.has(reference)) {
          assert.equal(kind, 'design', 'frozen Slides requires a project design-system asset path')
          return
        }
        assert.ok(fixture.legacyFiles.has(reference), `${path}: unresolved local resource ${reference}`)
        assert.match(reference, /^project\/ds\/fixture\/image-\d+\.png$/)
        const name = reference.split('/').at(-1), image = fixture.images.find(candidate => candidate.filename === name)
        assert.ok(image)
        assert.deepEqual(fixture.legacyFiles.get(reference), image.bytes)
      }
      for (const node of nodes) {
        for (const attribute of ['src', 'href']) if (node.attribs[attribute]) checkReference(node.attribs[attribute], node)
        if (node.attribs.srcdoc) checkSource(node.attribs.srcdoc, path)
        const css = `${node.attribs.style ?? ''} ${node.name === 'style' ? DomUtils.textContent(node) : ''}`
        for (const match of css.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) checkReference(match[1], node)
      }
    }
    for (const [path, bytes] of fixture.legacyFiles) if (path.endsWith('.html')) checkSource(bytes.toString(), path)
    assert.equal(runtimeMarkers, kind === 'design' ? 50 : 0)
    assert.ok(![...fixture.legacyFiles.keys()].some(path => path.endsWith('/support.js')), 'fixture must not fabricate a runtime')
    for (const image of fixture.images) {
      const asset = fixture.document.assets[image.id]
      assert.equal(asset.sha256, image.sha256)
      assert.equal(asset.url, `/native-artifact-fixture/${image.filename}`)
    }
    const manifest = JSON.parse(fixture.legacyFiles.get(kind === 'slides' ? 'project/deck.json' : 'project/canvas.json'))
    for (const id of manifest.order) assert.ok(fixture.legacyFiles.has(kind === 'slides' ? `project/slides/${id}.html` : `project/${id}`))
  }
})

test('isolated source and semantic hash stay fixed across fixture origins and document IDs', () => {
  const baseline = createFixture('slides', 'baseline', Array.from({ length: 50 }, (_, i) => `http://127.0.0.1:24411/native-artifact-fixture/image-${i + 1}.png`))
  const candidate = createFixture('slides', 'candidate', Array.from({ length: 50 }, (_, i) => `http://127.0.0.1:24412/native-artifact-fixture/image-${i + 1}.png`))
  assert.equal(baseline.manifest.semanticSha256, candidate.manifest.semanticSha256)
  assert.deepEqual(baseline.document.pages['page-25'].nodes['page-25-isolated'].embed, candidate.document.pages['page-25'].nodes['page-25-isolated'].embed)
  assert.notEqual(baseline.manifest.nativeSha256, candidate.manifest.nativeSha256)
})
