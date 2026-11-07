import assert from 'node:assert/strict'
import test from 'node:test'
import {createNode,createPage} from '../../../../shared/artifact-document'
import {elementAlignmentPatch,elementAlignmentVertical} from './element-alignment'

const page={...createPage('page'),width:1920,height:1080}
const node={...createNode('text','heading'),x:64,y:40,width:1152,height:76}

test('绝对元素居中保留两侧锚点和自动边距，后续宽高修改仍能居中',()=>{
  const horizontal=elementAlignmentPatch(node,page,'center')
  assert.equal(horizontal.patch.x,0)
  assert.deepEqual(horizontal.patch.css,{right:'0px','margin-left':'auto','margin-right':'auto'})
  const vertical=elementAlignmentPatch(node,page,'middle')
  assert.equal(vertical.patch.y,0)
  assert.deepEqual(vertical.patch.css,{bottom:'0px','margin-top':'auto','margin-bottom':'auto'})
  assert.equal(horizontal.patch.width,undefined);assert.equal(vertical.patch.height,undefined)
})

test('两端对齐恢复相反锚点并清除居中自动边距，保留自适应宽度',()=>{
  const centered={...node,x:0,css:{width:'auto',right:'0px','margin-left':'auto','margin-right':'auto'},implicitWidth:true}
  const left=elementAlignmentPatch(centered,page,'left')
  assert.equal(left.patch.x,undefined)
  assert.deepEqual(left.patch.css,{width:'auto',right:'auto','margin-left':'0px','margin-right':'0px'})
  assert.ok(!left.unset.includes('implicitWidth'))
  const right=elementAlignmentPatch(centered,page,'right')
  assert.deepEqual(right.patch.css,{width:'auto',left:'auto',right:'0px','margin-left':'0px','margin-right':'0px'})
})

test('流式元素禁用垂直对齐，绝对和固定定位保留垂直对齐',()=>{
  for(const position of ['static','relative','sticky'])assert.equal(elementAlignmentVertical({...node,css:{position}},page),false)
  for(const position of ['absolute','fixed'])assert.equal(elementAlignmentVertical({...node,css:{position}},page),true)
  assert.equal(elementAlignmentVertical(node,page),true)
})

test('流式水平对齐使用自动边距且不改变偏移，自适应宽高字段和原节点保持不变',()=>{
  const flow={...node,css:{position:'static',width:'auto'},implicitWidth:true},original=JSON.stringify(flow)
  assert.deepEqual(elementAlignmentPatch(flow,page,'center').patch.css,{position:'static',width:'auto','margin-left':'auto','margin-right':'auto'})
  assert.deepEqual(elementAlignmentPatch(flow,page,'left').patch.css,{position:'static',width:'auto','margin-right':'auto'})
  assert.deepEqual(elementAlignmentPatch(flow,page,'right').patch.css,{position:'static',width:'auto','margin-left':'auto'})
  assert.deepEqual(elementAlignmentPatch(flow,page,'top'),{patch:{},unset:[]})
  assert.equal(JSON.stringify(flow),original)
})

test('相对定位水平对齐先还原左右相对偏移',()=>{
  const relative={...node,css:{position:'relative',left:'64px',right:'20px'}}
  const result=elementAlignmentPatch(relative,page,'center')
  assert.equal(result.patch.x,0)
  assert.equal(result.patch.css?.right,'auto')
})
