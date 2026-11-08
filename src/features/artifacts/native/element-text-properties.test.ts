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

test('复合装饰添加删除线时保留原下划线、线型、颜色和厚度',()=>{
 const node={...createNode('text','text'),css:{'text-decoration':'underline dotted red 2px',opacity:'.5'}},page={...createPage('page'),nodes:{text:node},nodeOrder:['text']}
 const result=textPropertyPatch(node,page,{'text-decoration-line':'underline line-through'})
 assert.equal(result.patch.css?.['text-decoration'],undefined)
 assert.equal(result.patch.css?.['text-decoration-style'],'dotted');assert.equal(result.patch.css?.['text-decoration-color'],'red');assert.equal(result.patch.css?.['text-decoration-thickness'],'2px');assert.equal(result.patch.css?.['text-decoration-line'],'underline line-through');assert.equal(result.patch.css?.opacity,'.5')
})
test('切换嵌套列表种类只修改外层类型，条目身份顺序和子列表保持原结构',()=>{
 const paragraph=(text:string)=>({type:'paragraph' as const,content:[{type:'text' as const,text}]})
 const node={...createNode('text','text'),text:'父条目\n子条目\n末条目',richText:{type:'doc' as const,content:[{type:'bulletList' as const,content:[{type:'listItem' as const,content:[paragraph('父条目'),{type:'bulletList' as const,content:[{type:'listItem' as const,content:[paragraph('子条目')]}]}]},{type:'listItem' as const,content:[paragraph('末条目')]}]}]}}
 const changed={...node,...textListPatch(node,'number')}
 assert.deepEqual(changed.richText,{...node.richText,content:[{...node.richText.content[0],type:'orderedList'}]});assert.equal(changed.richText?.content?.[0].content?.length,2)
 assert.deepEqual({...changed,...textListPatch(changed,'bullet')},node)
})
