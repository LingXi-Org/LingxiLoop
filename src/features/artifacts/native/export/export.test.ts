import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { createDocument, createNode, createPage } from '../../../../../shared/artifact-document'
import { exportArtifact } from '../export-artifact'
import { ExportResources } from './common'
import { encodeArtifactPdf } from './pdf-writer'
import { renderPageHtml, pageText } from './render'

test('a one-pixel-high horizontal stroke retains ink and arrow overflow in export', async () => {
  const document=fixture(),page=document.pages.page!
  const line={...createNode('line','horizontal'),width:240,height:1,points:[{x:0,y:0},{x:240,y:0}],lineEnd:'arrow' as const,style:{stroke:'#18332b',strokeWidth:12}}
  page.nodes[line.id]=line;page.nodeOrder.push(line.id)
  const html=await renderPageHtml(page,new ExportResources(document,{format:'html'}))
  assert.match(html,/<svg[^>]+style="overflow:visible"[^>]*viewBox="0 0 240 1"/)
})

function fixture() {
  const document = createDocument('slides', 'export-test', '导出测试')
  const page = createPage('page', '第一页'), node = { ...createNode('text', 'text'), text: '<script>doNotExecute()</script> 中文 text' }
  page.nodes[node.id] = node; page.nodeOrder.push(node.id)
  document.pages[page.id] = page; document.pageOrder.push(page.id)
  return document
}

test('代码声明进入离线页面且属性转义；链接保留安全关系',async()=>{
  const document=fixture(),node=document.pages.page!.nodes.text!
  node.css={filter:'blur(1px)','max-width':'1800px','--Brand':'#d97757'}
  node.attributes={'data-label':'中文"说明',title:'中文提示',href:'https://example.test/',target:'_blank'}
  const html=await renderPageHtml(document.pages.page!,new ExportResources(document,{format:'html'}))
  assert.match(html,/filter:blur\(1px\);max-width:1800px;--Brand:#d97757/)
  assert.match(html,/data-label="中文&quot;说明"/)
  assert.match(html,/<a class="artifact-export-element-link"/)
  assert.match(html,/rel="noopener noreferrer"/)
  assert.ok(html.includes('title="中文提示"'))
})

test('整体链接和子文字链接使用并列锚点，离线解析不拆散组合',async()=>{
  const document=fixture(),page=document.pages.page!,child=page.nodes.text!,group={...createNode('group','linked-group'),attributes:{href:'https://group.test/',target:'_blank'}}
  child.parentId=group.id;child.richText={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'子链接',marks:[{type:'link',attrs:{href:'https://child.test/'}}]}]}]}
  page.nodes[group.id]=group;page.nodeOrder.unshift(group.id)
  const before=JSON.stringify(document),html=await renderPageHtml(page,new ExportResources(document,{format:'html'}))
  const {Parser}=await import('htmlparser2');let anchors=0,depth=0,nested=false;const stack:boolean[]=[]
  const parser=new Parser({onopentag(tag){stack.push(tag==='a');if(tag==='a'){nested||=depth>0;depth++;anchors++}},onclosetag(){if(stack.pop())depth--}})
  parser.write(html);parser.end();assert.equal(nested,false,'整体链接不能成为子链接的祖先');assert.equal(anchors,2)
  assert.ok(html.includes('https://group.test/'));assert.ok(html.includes('https://child.test/'));assert.equal(JSON.stringify(document),before)
})

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

test('整份幻灯片导出排除跳过页，包括备注与不能读取的媒体；原文档不变', async () => {
  const document = fixture(), skipped = createPage('skipped', '跳过页')
  skipped.skip = true
  skipped.notes = '不应出现在导出文件中的跳过页备注'
  const embed = { ...createNode('embed', 'skipped-embed'), embed: { format: 'html' as const, source: '<p>不可执行的跳过页内容</p>' } }
  skipped.nodes[embed.id] = embed
  skipped.nodeOrder = [embed.id]
  document.pages[skipped.id] = skipped
  document.pageOrder.unshift(skipped.id)
  const before = JSON.stringify(document)
  const result = await exportArtifact(document, { format: 'html', resolveAsset: async () => { throw new Error('不应读取跳过页素材') } })
  const html = await result.blob.text()
  assert.equal((html.match(/<article(?:\s|>)/g) ?? []).length, 1)
  assert.ok(!html.includes(skipped.notes))
  assert.ok(!html.includes('不可执行的跳过页内容'))
  assert.equal(JSON.stringify(document), before)
})

test('全部跳过时整份幻灯片导出给出中文说明', async () => {
  const document = fixture()
  document.pages.page!.skip = true
  for (const format of ['html', 'pdf', 'pptx'] as const)
    await assert.rejects(exportArtifact(document, { format }), /所有页面均已跳过，请先恢复至少一页/)
})

test('HTML retains slide transition and motion identity as escaped data for offline playback', async () => {
  const document=fixture(),page=document.pages.page!
  page.transition='magic';page.nodes.text!.motionId='original-heading'
  const result=await exportArtifact(document,{format:'html'}),html=await result.blob.text()
  assert.match(html,/data-transition="magic"/)
  assert.match(html,/data-motion-id="original-heading"/)
  assert.match(html,/data-motion-root/)
  assert.match(html,/prefers-reduced-motion/)
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

test('table headers remain semantic and editable in export without promoting old body rows', async () => {
  const document=fixture(),page=document.pages.page!
  const table={...createNode('table','table'),tableHeader:true,cells:[['列标题','第二列'],['正文','数据']]}
  page.nodes.table=table;page.nodeOrder.push('table')
  const html=await renderPageHtml(page,new ExportResources(document,{format:'html'}))
  assert.match(html,/<th scope="col"[^>]*>列标题<\/th>/)
  assert.match(html,/<td[^>]*>正文<\/td>/)
  const plain={...page,nodes:{...page.nodes,table:{...table,tableHeader:undefined}}}
  const original=await renderPageHtml(plain,new ExportResources(document,{format:'html'}))
  assert.doesNotMatch(original,/<th[ >]/)
})


test('画板网页归档包含可离线打开的单页文件，并保留文档快照', async () => {
  const document=fixture(),before=JSON.stringify(document)
  const result=await exportArtifact(document,{format:'html',htmlArchive:true})
  assert.equal(result.blob.type,'application/zip')
  assert.equal(result.filename,'导出测试-html.zip')
  const {default:JSZip}=await import('jszip'),archive=await JSZip.loadAsync(await result.blob.arrayBuffer())
  assert.deepEqual(Object.keys(archive.files),['导出测试.html'])
  const html=await archive.file('导出测试.html')!.async('string')
  assert.ok(html.startsWith('<!doctype html>'));assert.ok(html.includes('中文 text'))
  assert.ok(html.includes('&lt;script&gt;doNotExecute()&lt;/script&gt;'))
  assert.equal(JSON.stringify(document),before)
})

test('原始声明替换生成的同名声明，避免无效值回退到旧的显式宽度',async()=>{
  const document=fixture(),node=document.pages.page!.nodes.text!
  node.css={width:'480',color:'#123456 !important'}
  const html=await renderPageHtml(document.pages.page!,new ExportResources(document,{format:'html'}))
  const opening=html.match(/data-node-id="text"[^>]*style="([^"]*)"/)?.[1]??''
  assert.equal((opening.match(/(?:^|;)width:/g)??[]).length,1)
  assert.match(opening,/(?:^|;)width:480(?:;|$)/)
  assert.match(opening,/color:#123456 !important/)
})

test('离线页面保留画板四角裁切且原稿保持不变',async()=>{
  const document=fixture(),page=document.pages.page;page.radius=[10,20,30,40];const before=JSON.stringify(document)
  const html=await renderPageHtml(page,new ExportResources(document,{format:'html'}))
  assert.match(html,/class="artifact-export-page"[^>]*border-radius:10px 20px 30px 40px/)
  assert.equal(JSON.stringify(document),before)
})

test('显式A4打印使用纸张物理尺寸，图片和链接按相同比例缩放',()=>{
  const bytes=encodeArtifactPdf([{width:800,height:1131,paper:'A4',jpeg:new Uint8Array([0xff,0xd8,0xff,0xd9]),text:'打印纸张',links:[{href:'https://example.test/',x:80,y:100,width:160,height:20}]}],'打印测试')
  const pdf=new TextDecoder().decode(bytes)
  assert.ok(pdf.includes('/MediaBox [0 0 595.28 841.89]'))
  const rect=pdf.match(/\/Rect \[([^\]]+)\]/)![1].split(' ').map(Number)
  const sx=595.28/800,sy=841.89/1131
  assert.deepEqual(rect,[80*sx,841.89-120*sy,240*sx,841.89-100*sy])
  assert.ok(pdf.includes('/Width 800 /Height 1131'),'栅格像素尺寸保持原值')
})

test('PDF链接保留相对地址及电话，并以URI编码保存中文而不重复编码原地址',()=>{
  const hrefs=['https://example.test/中文','https://example.test/%E4%B8%AD%E6%96%87','../页面.html','tel:+861234567890']
  const bytes=encodeArtifactPdf([{width:800,height:600,jpeg:new Uint8Array([0xff,0xd8,0xff,0xd9]),text:'中文链接',links:hrefs.map((href,index)=>({href,x:0,y:index*30,width:100,height:20}))}],'链接')
  const pdf=new TextDecoder().decode(bytes)
  assert.equal((pdf.match(/\/URI \(https:\/\/example\.test\/%E4%B8%AD%E6%96%87\)/g)??[]).length,2)
  assert.ok(pdf.includes('/URI (../%E9%A1%B5%E9%9D%A2.html)'))
  assert.ok(pdf.includes('/URI (tel:+861234567890)'))
})
