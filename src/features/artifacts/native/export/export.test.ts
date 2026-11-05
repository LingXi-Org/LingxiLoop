import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { createDocument, createNode, createPage } from '../../../../../shared/artifact-document'
import { exportArtifact } from '../export-artifact'
import { ExportResources } from './common'
import { encodeArtifactPdf } from './pdf-writer'
import { renderPageHtml, pageText } from './render'

function fixture() {
  const document = createDocument('slides', 'export-test', '导出测试')
  const page = createPage('page', '第一页'), node = { ...createNode('text', 'text'), text: '<script>doNotExecute()</script> 中文 text' }
  page.nodes[node.id] = node; page.nodeOrder.push(node.id)
  document.pages[page.id] = page; document.pageOrder.push(page.id)
  return document
}

test('extended appearance exports with geometry, annotations stay off artboards and video fallback is explicit', async () => {
  const document = fixture(), page = document.pages.page!
  const shape = { ...createNode('shape', 'gradient'), shape: 'ellipse' as const, flipX: true, style: { gradient: { type: 'linear' as const, angle: 90, stops: [{ color: '#ff0000', offset: 0 }, { color: '#0000ff', offset: 1 }] }, shadow: { x: 2, y: 4, blur: 8, spread: 0, color: '#00000040' } } }
  const note = { ...createNode('note', 'annotation'), scope: 'canvas' as const, text: 'PRIVATE CANVAS ANNOTATION' }
  const video = { ...createNode('video', 'video'), text: '课程视频' }
  for (const node of [shape, note, video]) { page.nodes[node.id] = node; page.nodeOrder.push(node.id) }
  const resources = new ExportResources(document, { format: 'html' }), html = await renderPageHtml(page, resources)
  assert.match(html, /linearGradient/); assert.match(html, /fill="url\(#gradient-page-gradient\)"/)
  assert.match(html, /box-shadow:2px 4px 8px 0px #00000040/); assert.match(html, /scale\(-1,1\)/)
  assert.ok(!html.includes('PRIVATE CANVAS ANNOTATION'))
  const group = { ...createNode('group', 'canvas-group'), scope: 'canvas' as const }
  const child = { ...createNode('text', 'canvas-child'), parentId: group.id, text: 'PRIVATE NESTED ANNOTATION' }
  page.nodes[group.id]=group; page.nodes[child.id]=child; page.nodeOrder.push(group.id,child.id)
  assert.ok(!pageText(page).includes('PRIVATE'))
  assert.ok([...resources.warnings].some(w => w.includes('视频以封面导出')))
})

test('offline HTML escapes authored text and preserves the fixed snapshot', async () => {
  const document = fixture(), before = JSON.stringify(document)
  const result = await exportArtifact(document, { format: 'html' })
  const html = await result.blob.text()
  assert.ok(html.includes('&lt;script&gt;doNotExecute()&lt;/script&gt;'))
  assert.ok(html.includes('中文 text'))
  assert.equal(JSON.stringify(document), before)
  assert.equal(result.filename, '导出测试.html')
})

test('image metadata never authorizes embedding a JSON API response or forged image bytes', async () => {
  const document = fixture()
  document.assets.image = { id: 'image', url: '/api/private', contentType: 'image/png' }
  const node = { ...createNode('image', 'image'), assetId: 'image' }
  document.pages.page!.nodes.image = node; document.pages.page!.nodeOrder.push('image')
  for (const type of ['application/json', 'image/png']) {
    await assert.rejects(exportArtifact(document, { format: 'html', resolveAsset: async () => new Blob(['{"private":"never-export"}'], { type }) }), /图片/)
  }
  await assert.rejects(exportArtifact(document, { format: 'html' }), /授权读取器/)
})

test('cancellation occurs before loading resources or modifying a document', async () => {
  const controller = new AbortController(); controller.abort()
  const document = fixture(), before = JSON.stringify(document)
  let reads = 0
  await assert.rejects(exportArtifact(document, { format: 'html', signal: controller.signal, resolveAsset: async () => { reads++; return new Blob() } }), { name: 'AbortError' })
  assert.equal(reads, 0); assert.equal(JSON.stringify(document), before)
})

test('offline HTML uses the isolated content snapshot and reports loss of interactivity', async () => {
  const document = fixture()
  document.assets.preview = { id: 'preview', url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/kK0AAAAASUVORK5CYII=', contentType: 'image/png' }
  const node = { ...createNode('embed', 'embed'), embed: { source: '<script src="./support.js"></script><x-dc>{{title}}</x-dc>', format: 'html' as const, previewAssetId: 'preview' } }
  document.pages.page!.nodes.embed = node; document.pages.page!.nodeOrder.push('embed')
  const result = await exportArtifact(document, { format: 'html' }), html = await result.blob.text()
  assert.ok(html.includes('data:image/png;base64,'))
  assert.ok(!html.includes('support.js') && !html.includes('{{title}}') && !html.includes('<iframe'))
  assert.ok(result.warnings.some(warning => warning.includes('静态快照')))
  delete (node.embed as { previewAssetId?: string }).previewAssetId
  await assert.rejects(exportArtifact(document, { format: 'html' }), /预览快照/)
})

test('formula output uses KaTeX and a malformed source remains readable with a warning', async () => {
  const document = fixture(), node = { ...createNode('math', 'math'), source: String.raw`\frac{1}{2}` }
  document.pages.page!.nodes.math = node; document.pages.page!.nodeOrder.push('math')
  const resources = new ExportResources(document, { format: 'html' })
  assert.match(await renderPageHtml(document.pages.page!, resources), /class="katex"/)
  node.source = String.raw`\unknownCommand{`
  assert.match(await renderPageHtml(document.pages.page!, resources), /unknownCommand/)
  assert.ok(resources.warnings.size)
})

test('PDF page tree, Unicode text layer and links are understood by an independent parser', t => {
  if (spawnSync('pdftotext', ['-v']).error) { t.skip('Poppler pdftotext is unavailable'); return }
  const bytes = encodeArtifactPdf(Array.from({ length: 50 }, (_, index) => ({ width: 1280, height: 720,
    jpeg: new Uint8Array([255, 216, 255, 217]), text: `第${index + 1}页 中文 E=mc²`, links: [{ href: 'https://example.com', x: 0, y: 0, width: 100, height: 30 }] })), 'Unicode')
  const content = new TextDecoder().decode(bytes)
  assert.match(content, /\/Count 50/)
  assert.match(content, /\/URI \(https:\/\/example\.com\)/)
  const result = spawnSync('pdftotext', ['-', '-'], { input: bytes })
  assert.equal(result.status, 0, result.stderr.toString())
  assert.match(result.stdout.toString().replace(/\s/g, ''), /第50页中文E=mc²/)
})

test('inline formulas in text and table cells render while prices and code stay literal', async () => {
  const document = fixture(), page = document.pages.page!
  page.nodes.text!.text = String.raw`Price $10 and $x^2$ plus \(y_1\).`
  const table = { ...createNode('table', 'table'), cells: [[String.raw`\[\frac{1}{2}\]`, '中文']] }
  page.nodes.table = table; page.nodeOrder.push(table.id)
  const code = { ...createNode('text', 'code'), text: '$x^2$', richText: { type: 'doc' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: '$x^2$', marks: [{ type: 'code' as const }] }] }] } }
  page.nodes.code = code; page.nodeOrder.push(code.id)
  const html = await renderPageHtml(page, new ExportResources(document, { format: 'html' }))
  assert.equal((html.match(/class="katex"/g) ?? []).length, 3)
  assert.ok(html.includes('Price $10'))
  assert.ok(html.includes('<code>$x^2$</code>'))
})

test('theme-bound defaults affect page, text and shape export while authored overrides remain fixed', async () => {
  const document = fixture(), page = document.pages.page!
  document.themeId = 'theme'; document.themes.theme = { id: 'theme', name: 'Dark', tokens: { background: '#102030', text: '#f1f2f3', accent: '#708090', 'font.sans': 'Arial' } }
  const shape = createNode('shape', 'shape'); page.nodes.shape = shape; page.nodeOrder.push(shape.id)
  const html = await renderPageHtml(page, new ExportResources(document, { format: 'html' }))
  assert.ok(html.includes('background:#102030'))
  assert.ok(html.includes('color:#f1f2f3'))
  assert.ok(html.includes('fill="#708090"'))
  shape.style.fill = '#123456'
  const fixed = await renderPageHtml(page, new ExportResources(document, { format: 'html' }))
  assert.ok(fixed.includes('fill="#123456"'))
})
