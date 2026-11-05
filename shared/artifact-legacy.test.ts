import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { convertLegacyArtifact } from './artifact-legacy'

const sha = 'a'.repeat(64)
const file = (content: string) => ({ content, sha256: sha })

describe('legacy artifact conversion', () => {
  it('preserves ordered pages, editable text, images, formula source and notes without changing originals', () => {
    const files = {
      'project/deck.json': file(JSON.stringify({ v: 4, order: ['second', 'first'], title: '原稿' })),
      'project/slides/first.html': file('<section><p>第一页</p></section>'),
      'project/slides/second.html': file('<section data-transition="fade"><h1 id="heading">标题 <b>加粗</b></h1><img src="/_blob/image" width="240" height="160"><p>$$E=mc^2$$</p><aside>讲者备注</aside></section>'),
    }
    const before = JSON.stringify(files)
    const result = convertLegacyArtifact({ id: 'artifact', kind: 'slides', title: '稿件', files })
    assert.deepEqual(result.document.pageOrder, ['second', 'first'])
    const page = result.document.pages.second!
    assert.equal(page.notes, '讲者备注')
    assert.equal(page.transition, 'fade')
    assert.ok(Object.values(page.nodes).some(node => node.type === 'text' && node.text === '标题 加粗'))
    assert.ok(Object.values(page.nodes).some(node => node.type === 'image'))
    assert.ok(Object.values(page.nodes).some(node => node.type === 'math' && node.source === 'E=mc^2'))
    assert.equal(result.originals['project/slides/second.html'], sha)
    assert.equal(JSON.stringify(files), before)
  })

  it('keeps executable Design source isolated and addressed by its original hash', () => {
    const source = '<div id="root"></div><script>globalThis.__shouldNeverExecute = 1</script>'
    const result = convertLegacyArtifact({ id: 'artifact', kind: 'design', title: '设计', files: {
      'project/canvas.json': file(JSON.stringify({ v: 3, boards: { 'app.dc.html': { x: 100, y: 200, w: 800, h: 600 } }, order: ['app.dc.html'] })),
      'project/app.dc.html': file(source),
    } })
    const page = Object.values(result.document.pages)[0]!
    assert.deepEqual([page.x, page.y, page.width, page.height], [100, 200, 800, 600])
    assert.deepEqual(Object.values(page.nodes)[0]!.embed, { source, format: 'html', sourceHash: sha, originalPath: 'project/app.dc.html' })
    assert.match(result.warnings.join(' '), /隔离/)
    assert.equal('__shouldNeverExecute' in globalThis, false)
  })

  it('never moves event handlers or unsafe SVG into native DOM nodes', () => {
    const result = convertLegacyArtifact({ id: 'artifact', kind: 'slides', title: '测试', files: {
      'project/deck.json': file('{"v":4,"order":["p"]}'),
      'project/slides/p.html': file('<section><img src="/_blob/a" onerror="alert(1)"><svg><foreignObject><script>alert(1)</script></foreignObject></svg></section>'),
    } })
    assert.ok(Object.values(result.document.pages.p!.nodes).every(node => node.type === 'embed'))
  })

  it('refuses unknown format versions and missing referenced pages instead of losing data', () => {
    assert.throws(() => convertLegacyArtifact({ id: 'a', kind: 'slides', title: '', files: {
      'project/deck.json': file('{"v":99,"order":[]}'),
    } }), /version|版本/)
    assert.throws(() => convertLegacyArtifact({ id: 'a', kind: 'slides', title: '', files: {
      'project/deck.json': file('{"v":4,"order":["missing"]}'),
    } }), /missing|缺失/)
  })

  it('converts static DC wrappers, empty decorative shapes, grid tracks and print metadata', () => {
    const result = convertLegacyArtifact({ id: 'a', kind: 'design', title: '', files: {
      'project/canvas.json': file(JSON.stringify({ v: 3, boards: { 'Page.dc.html': { w: 794, h: 1600, print: 'flow', paper: 'a4' } }, order: ['Page.dc.html'] })),
      'project/Page.dc.html': file('<html><head><script src="./support.js"></script></head><body><x-dc><div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr))"><p>一</p><p>二</p></div><div style="position:absolute;left:20px;top:500px;width:100px;height:80px;background:#112233"></div></x-dc></body></html>'),
    } })
    const page = result.document.pages.Page!
    assert.equal(page.sizing, 'flow'); assert.equal(page.paper, 'A4')
    assert.ok(Object.values(page.nodes).some(node => node.type === 'shape' && node.style.fill === '#112233'))
    assert.ok(Object.values(page.nodes).some(node => node.layout?.mode === 'grid' && node.layout.columns === 2))
    assert.ok(!Object.values(page.nodes).some(node => node.type === 'embed'))
  })
})

it('legacy iframe srcdoc becomes the opaque block source without a forbidden nested frame', () => {
  const source = '<section><iframe width="640" height="360" srcdoc="&lt;html&gt;&lt;body&gt;&lt;button onclick=&quot;this.textContent=\'clicked\'&quot;&gt;click&lt;/button&gt;&lt;/body&gt;&lt;/html&gt;"></iframe></section>'
  const files = { 'project/deck.json': { content: JSON.stringify({ v: 4, order: ['one'] }), sha256: 'a'.repeat(64) }, 'project/slides/one.html': { content: source, sha256: 'b'.repeat(64) } }
  const converted = convertLegacyArtifact({ id: 'srcdoc', kind: 'slides', title: 'Srcdoc', files })
  const node = Object.values(converted.document.pages.one!.nodes).find(node => node.type === 'embed')!
  assert.ok(node.embed!.source.startsWith('<html>'))
  assert.ok(node.embed!.source.includes('onclick="this.textContent=\'clicked\'"'))
  assert.ok(!node.embed!.source.includes('<iframe'))
  assert.equal(files['project/slides/one.html'].content, source)
})

it('keeps x-embed contents byte-exact and converts surrounding nodes and stored image references', () => {
  const isolated = '<!doctype html><html><head><style>body{margin:0}</style></head><body><p>isolated</p><script>if (1 < 2) globalThis.__legacyEmbedMustNotRun = "a&b";</script></body></html>'
  const source = `<section><p>editable</p><img src="project/ds/fixture/photo.png"><img src="../ds/fixture/photo.png"><img src="../../missing.png"><x-embed style="position:absolute;left:10px;top:20px;width:640px;height:360px">${isolated}</x-embed></section>`
  const files = {
    'project/deck.json': file('{"v":4,"order":["one"]}'),
    'project/slides/one.html': file(source),
    'project/ds/fixture/photo.png': { content: 'binary bytes are not decoded by the converter', sha256: 'b'.repeat(64) },
  }
  const before = JSON.stringify(files)
  const converted = convertLegacyArtifact({ id: 'fixture', kind: 'slides', title: 'Fixture', files })
  const nodes = Object.values(converted.document.pages.one!.nodes)
  assert.ok(nodes.some(node => node.type === 'text' && node.text === 'editable'))
  const isolatedNode = nodes.find(node => node.embed?.source === isolated)!
  assert.ok(isolatedNode)
  assert.deepEqual([isolatedNode.x, isolatedNode.y, isolatedNode.width, isolatedNode.height], [10, 20, 640, 360])
  assert.equal(nodes.filter(node => node.type === 'image').length, 2)
  for (const node of nodes.filter(node => node.type === 'image')) {
    const asset = converted.document.assets[node.assetId!]!
    assert.equal(asset.url, `/api/artifacts/fixture/originals/${'b'.repeat(64)}/project/ds/fixture/photo.png`)
    assert.equal(asset.contentType, 'image/png')
  }
  assert.ok(nodes.some(node => node.embed?.source.includes('../../missing.png')))
  assert.equal(JSON.stringify(files), before)
  assert.equal('__legacyEmbedMustNotRun' in globalThis, false)
})
