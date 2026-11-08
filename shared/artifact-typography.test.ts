import assert from 'node:assert/strict'
import test from 'node:test'
import {createDocument,createNode,createPage} from './artifact-document.js'
import {artifactTypographyCensus,pageTypographyUsage,summarizeTypographyUsage,documentTypographyUsage} from './artifact-typography.js'
import {convertLegacyArtifact} from './artifact-legacy.js'
import {applyOperations,prepareBatch,artifactVersionKey,ArtifactOperationConflict} from './artifact-operations.js'

test('文字样式摘要包含未加载页面的字号，且不改写文档',()=>{
 const document=createDocument('design','doc')
 for(const [id,size]of [['one',36],['two',48]] as const){const page=createPage(id),node=createNode('text',id+'-text');node.style={fontSize:size,fontFamily:'Arial'};node.richText={type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:'作者内容'}]}]};page.nodeOrder=[node.id];page.nodes[node.id]=node;document.pageOrder.push(id);document.pages[id]=page}
 const before=JSON.stringify(document),census=artifactTypographyCensus(document),rows=summarizeTypographyUsage(Object.values(census).flat())
 assert.deepEqual(rows.map(row=>[row.size,row.name]),[[48,'标题 1'],[36,'标题 2']]);assert.equal(JSON.stringify(document),before)
 assert.ok(!JSON.stringify(census).includes('作者内容'))
})

test('样式摘要读取作者CSS字号及pt单位，保留字体频次，跳过变量',()=>{
 const page=createPage('page')
 for(const [index,css]of [{ 'font-size':'12pt !important','font-family':'Georgia, serif'},{'font-size':'var(--作者字号)'}].entries()){
  const node=createNode('text','n'+index);node.style={fontSize:48,fontFamily:'Arial'};node.css=css;page.nodeOrder.push(node.id);page.nodes[node.id]=node
 }
 assert.deepEqual(pageTypographyUsage(page),[{size:16,roles:{Body:1},families:{Georgia:1}}])
})

test('来源角色优先级区分标题、正文及小字；同字号按出现频次命名',()=>{
 const rows=summarizeTypographyUsage([{size:48,roles:{'Heading 1':1},families:{Arial:1}},{size:32,roles:{'Heading 2':1},families:{Arial:1}},{size:18,roles:{Body:2},families:{Arial:2}},{size:14,roles:{Caption:1},families:{Arial:1}}])
 assert.deepEqual(rows.map(row=>[row.size,row.name]),[[48,'标题 1'],[32,'标题 2'],[18,'正文'],[14,'说明文字']])
})

test('字号预览字体保留来源第一份页面摘要，不被后续页面频次改写',()=>{
 const rows=summarizeTypographyUsage([{size:48,roles:{'Heading 1':1},families:{Georgia:1}},{size:48,roles:{'Heading 1':2},families:{Arial:2}}])
 assert.equal(rows[0].family,'Georgia')
})

test('转换保留小字和展示类角色，不将说明文字误命名为标题',()=>{
 const file=(content:string)=>({content,sha256:'a'.repeat(64)}),files={'project/deck.json':file(JSON.stringify({v:4,order:['a']})),'project/slides/a.html':file('<section><div class="hero-title" style="font-size:64px">展示文字</div><h1 style="font-size:48px">主标题</h1><h2 style="font-size:32px">副标题</h2><p style="font-size:18px">正文</p><small style="font-size:14px">说明</small></section>')}
 const before=JSON.stringify(files),converted=convertLegacyArtifact({id:'roles',kind:'slides',title:'角色',files}),rows=summarizeTypographyUsage(Object.values(artifactTypographyCensus(converted.document)).flat())
 assert.deepEqual(rows.map(row=>[row.size,row.name]),[[64,'展示文字'],[48,'标题 1'],[32,'标题 2'],[18,'正文'],[14,'说明文字']]);assert.equal(JSON.stringify(files),before)
})

test('排版角色可保存重读、复制、撤销重做，并参与现有字段冲突键',()=>{
 const document=createDocument('design','roles'),page=createPage('page'),node=createNode('text','text');page.nodeOrder=['text'];page.nodes.text=node;document.pageOrder=['page'];document.pages.page=page
 const batch=prepareBatch(document,[{type:'node.patch',pageId:'page',nodeId:'text',patch:{typographyRole:'Caption'}}],'set-role'),written=applyOperations(document,batch)
 assert.equal(written.document.pages.page.nodes.text.typographyRole,'Caption');const stale=prepareBatch(document,[{type:'node.patch',pageId:'page',nodeId:'text',patch:{typographyRole:'Body'}}],'stale-role');assert.throws(()=>applyOperations(written.document,stale),ArtifactOperationConflict);assert.ok(written.changedKeys.includes(artifactVersionKey.node('page','text','field/typographyRole')))
 const undone=applyOperations(written.document,prepareBatch(written.document,written.inverse,'undo-role'));assert.equal(undone.document.pages.page.nodes.text.typographyRole,undefined)
 const redone=applyOperations(undone.document,prepareBatch(undone.document,undone.inverse,'redo-role'));assert.equal(JSON.parse(JSON.stringify(redone.document)).pages.page.nodes.text.typographyRole,'Caption')
 const copied=applyOperations(redone.document,prepareBatch(redone.document,[{type:'node.insert',pageId:'page',node:{...redone.document.pages.page.nodes.text,id:'copy'}}],'copy-role'));assert.equal(copied.document.pages.page.nodes.copy.typographyRole,'Caption')
 assert.equal(document.pages.page.nodes.text.typographyRole,undefined)
})

 test('未加载页使用派生摘要，本地已加载页修改替换旧统计且不残留删除页',()=>{
  const document=createDocument('design','partial')
  for(const [id,size]of [['one',36],['two',48]] as const){const page=createPage(id),node=createNode('text',id);node.style={fontSize:size};page.nodes[id]=node;page.nodeOrder=[id];document.pages[id]=page;document.pageOrder.push(id)}
  const census=artifactTypographyCensus(document),before=JSON.stringify(census),partial={...document,pages:{...document.pages,two:{...document.pages.two,nodes:{},nodeOrder:[]}}}
  assert.deepEqual(documentTypographyUsage(partial,census,['one']).map(row=>row.size),[36,48])
  partial.pages.one={...partial.pages.one,nodes:{one:{...partial.pages.one.nodes.one,style:{fontSize:20}}}}
  assert.deepEqual(documentTypographyUsage(partial,census,['one']).map(row=>row.size),[20,48])
  partial.pageOrder=['one'];assert.deepEqual(documentTypographyUsage(partial,census,['one']).map(row=>row.size),[20]);assert.equal(JSON.stringify(census),before)
 })
