import assert from 'node:assert/strict'
import test from 'node:test'
import {createNode,createPage,createDocument,validateArtifactDocument} from '../../../../shared/artifact-document'
import {applyOperations,prepareBatch} from '../../../../shared/artifact-operations'
import {elementTextAlignmentPatch,elementTextAlignmentValue} from './element-text-alignment'

test('文本对齐显示实际CSS声明，缺省值沿父级继承',()=>{
 const parent={...createNode('group','parent'),style:{textAlign:'right' as const}},node={...createNode('text','text'),parentId:parent.id,style:{textAlign:'left' as const},css:{'text-align':'center !important'}}
 const page={...createPage('page'),nodes:{[parent.id]:parent,[node.id]:node},nodeOrder:[parent.id,node.id]}
 assert.equal(elementTextAlignmentValue(node,page),'center')
 assert.equal(elementTextAlignmentValue({...node,css:undefined,style:{}},page),'right')
 assert.equal(elementTextAlignmentValue({...node,parentId:null,css:undefined,style:{}},page),'left')
})
test('逻辑起止值按固定来源保留无选中状态，选择方向后才规范化',()=>{
 for(const value of ['start','end']){
  const node={...createNode('text','text'),css:{'text-align':value}},page={...createPage('page'),nodes:{[node.id]:node},nodeOrder:[node.id]}
  assert.equal(elementTextAlignmentValue(node,page),null)
  assert.deepEqual(elementTextAlignmentPatch(node,page,'right'),{patch:{style:{textAlign:'right'}},unset:['css']})
 }
})
test('选择对齐覆盖旧优先声明，保留其他属性且不改原稿',()=>{
 const node={...createNode('text','text'),style:{textAlign:'left' as const},css:{'text-align':'center !important',opacity:'.5'}},page={...createPage('page'),nodes:{[node.id]:node},nodeOrder:[node.id]},before=JSON.stringify(node)
 const result=elementTextAlignmentPatch(node,page,'right')
 assert.deepEqual(result,{patch:{style:{textAlign:'right'},css:{opacity:'.5'}},unset:[]})
 assert.equal(JSON.stringify(node),before)
})
test('显式选择缺省左对齐仍成为可保存声明，相同作者声明不重复写入',()=>{
 const node=createNode('text','text'),page={...createPage('page'),nodes:{[node.id]:node},nodeOrder:[node.id]}
 assert.deepEqual(elementTextAlignmentPatch(node,page,'left'),{patch:{style:{textAlign:'left'}},unset:[]})
 assert.deepEqual(elementTextAlignmentPatch({...node,style:{textAlign:'left'}},page,'left'),{patch:{},unset:[]})
})
test('还原删除两种作者声明并恢复父级继承，其他CSS不变',()=>{
 const parent={...createNode('group','parent'),style:{textAlign:'right' as const}},node={...createNode('text','text'),parentId:parent.id,style:{textAlign:'left' as const},css:{'text-align':'center !important',opacity:'.5'}},page={...createPage('page'),nodes:{[parent.id]:parent,[node.id]:node},nodeOrder:[parent.id,node.id]}
 const result=elementTextAlignmentPatch(node,page,null)
 assert.deepEqual(result,{patch:{css:{opacity:'.5'}},unset:['style.textAlign']})
 assert.equal(elementTextAlignmentValue({...node,style:{},css:{opacity:'.5'}},page),'right')
})
test('声明替换进入共享保存及逆操作，未修改页面和原始快照不变',()=>{
 const node={...createNode('text','text'),css:{'text-align':'center !important'}},page={...createPage('page'),nodes:{[node.id]:node},nodeOrder:[node.id]},other=createPage('other'),document={...createDocument('design','fixture'),pageOrder:[page.id,other.id],pages:{[page.id]:page,[other.id]:other}},original=JSON.stringify(document)
 const {patch,unset}=elementTextAlignmentPatch(node,page,'right'),changed=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:page.id,nodeId:node.id,patch,unset}],'text-align-change'))
 validateArtifactDocument(changed.document)
 assert.equal(changed.document.pages.page.nodes.text.style.textAlign,'right');assert.equal(changed.document.pages.page.nodes.text.css,undefined)
 const reopened=validateArtifactDocument(JSON.parse(JSON.stringify(changed.document)))
 assert.equal(reopened.pages.page.nodes.text.style.textAlign,'right')
 const undone=applyOperations(changed.document,prepareBatch(changed.document,changed.inverse,'text-align-undo'))
 assert.deepEqual(undone.document.pages.page.nodes.text,node);assert.deepEqual(changed.document.pages.other,other);assert.equal(JSON.stringify(document),original)
})
