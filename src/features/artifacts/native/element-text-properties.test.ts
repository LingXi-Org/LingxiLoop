import assert from 'node:assert/strict'
import test from 'node:test'
import {createNode,createPage,artifactRichTextSchema} from '../../../../shared/artifact-document'
import {textPropertyPatch,textListKind,textListPatch} from './element-text-properties'

test('装饰和大小写覆盖原作者CSS，保留其他声明与原稿',()=>{
 const node={...createNode('text','text'),css:{'text-transform':'lowercase !important',opacity:'.5'}},page={...createPage('page'),nodes:{text:node},nodeOrder:['text']},original=JSON.stringify(node)
 assert.deepEqual(textPropertyPatch(node,page,{'text-transform':'uppercase'}),{patch:{css:{'text-transform':'uppercase',opacity:'.5'}},unset:[]})
 assert.equal(JSON.stringify(node),original)
 assert.deepEqual(textPropertyPatch(node,page,{'text-transform':null}),{patch:{css:{opacity:'.5'}},unset:[]})
})
test('纯文本列表保留文字，切换列表类型不重复嵌套，还原恢复内容',()=>{
 const node={...createNode('text','text'),text:'第一行\n第二行'}
 const bullet={...node,...textListPatch(node,'bullet')}
 assert.equal(textListKind(bullet),'bullet');assert.equal(artifactRichTextSchema.safeParse(bullet.richText).success,true)
 assert.equal(textListKind({...bullet,...textListPatch(bullet,'number')}),'number')
 const restored={...bullet,...textListPatch(bullet,'none')}
 assert.equal(textListKind(restored),'none');assert.equal(restored.text,node.text)
})
test('列表转换保留文字链接和强调标记',()=>{
 const node={...createNode('text','text'),text:'链接',richText:{type:'doc' as const,content:[{type:'paragraph' as const,content:[{type:'text' as const,text:'链接',marks:[{type:'bold' as const}]}]}]}}
 const bullet={...node,...textListPatch(node,'bullet')},restored={...bullet,...textListPatch(bullet,'none')}
 assert.deepEqual(restored.richText,node.richText)
})

test('缺省列表未改动时移除可选行不产生文档补丁',()=>{assert.deepEqual(textListPatch(createNode('text','text'),'none'),{})})

test('可选文字属性复用保存、逆操作及旧文档读取，其他页面和原快照不变',async()=>{
 const {createDocument,validateArtifactDocument}=await import('../../../../shared/artifact-document')
 const {applyOperations,prepareBatch}=await import('../../../../shared/artifact-operations')
 const node={...createNode('text','text'),text:'文字'},page={...createPage('page'),nodes:{text:node},nodeOrder:['text']},other=createPage('other'),document={...createDocument('design','fixture'),pageOrder:[page.id,other.id],pages:{page,other}},original=JSON.stringify(document)
 const css=textPropertyPatch(node,page,{'text-transform':'uppercase','text-decoration-line':'underline line-through'})
 const changed=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:page.id,nodeId:node.id,patch:{...css.patch,...textListPatch(node,'number')},unset:css.unset}],'optional-text'))
 const reopened=validateArtifactDocument(JSON.parse(JSON.stringify(changed.document)))
 assert.equal(textListKind(reopened.pages.page.nodes.text),'number');assert.equal(reopened.pages.page.nodes.text.css?.['text-decoration-line'],'underline line-through')
 const undone=applyOperations(reopened,prepareBatch(reopened,changed.inverse,'undo-optional-text'))
 assert.deepEqual(undone.document.pages.page.nodes.text,node);assert.deepEqual(reopened.pages.other,other);assert.equal(JSON.stringify(document),original)
})
