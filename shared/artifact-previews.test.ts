import assert from 'node:assert/strict'
import test from 'node:test'
import { createDocument, createNode, createPage } from './artifact-document.js'
import { artifactPreviews } from './artifact-previews.js'
test('navigation summaries are bounded and omit executable sources, notes and full text', () => {
  const document=createDocument('slides','doc')
  for(let i=0;i<100;i++) { const p=createPage(`p-${i}`); p.notes='private note';const node={...createNode('embed','embed'),text:'x'.repeat(1000),embed:{source:'<script>NEVER COPY</script>',format:'html' as const,previewAssetId:'poster'}};p.nodeOrder=['embed'];p.nodes.embed=node;document.pages[p.id]=p;document.pageOrder.push(p.id) }
  const before=JSON.stringify(document),previews=artifactPreviews(document,2048),bytes=JSON.stringify(previews)
  assert.ok(Object.keys(previews).length<100);assert.ok(Object.keys(previews).length>0)
  assert.ok(!bytes.includes('NEVER COPY'));assert.ok(!bytes.includes('private note'))
  assert.equal(previews['p-0'].nodes.embed.text?.length,512)
  assert.equal(JSON.stringify(document),before)
})

test('链接装饰摘要限制文字和节点数量，并剥离原地址',()=>{
  const document=createDocument('slides','links'),page=createPage('page'),node=createNode('text','text')
  node.richText={type:'doc',content:[{type:'paragraph',content:Array.from({length:1000},(_,index)=>({type:'text' as const,text:'文',...(index%2?{marks:[{type:'link' as const,attrs:{href:'https://private-link.test/'+index}}]}:{})}))}]}
  page.nodeOrder=[node.id];page.nodes[node.id]=node;document.pageOrder=[page.id];document.pages[page.id]=page
  const before=JSON.stringify(document),preview=artifactPreviews(document),text=preview.page.nodes.text.richText!,parts=text.content![0].content!
  assert.ok(parts.length<=64)
  assert.ok(parts.reduce((length,part)=>length+(part.text?.length??0),0)<=512)
  assert.ok(parts.some(part=>part.marks?.some(mark=>mark.type==='underline')))
  assert.ok(!JSON.stringify(preview).includes('private-link'))
  assert.equal(JSON.stringify(document),before)
})
