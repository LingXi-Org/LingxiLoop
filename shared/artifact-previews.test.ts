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
