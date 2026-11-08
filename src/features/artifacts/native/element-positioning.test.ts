import assert from 'node:assert/strict'
import test from 'node:test'
import {createNode,createPage,createDocument,type ArtifactNode} from '../../../../shared/artifact-document'
import {elementMovePatch,elementMoveValues,elementResizePatch,type ElementPositionPins} from './element-positioning'

import {applyOperations,prepareBatch} from '../../../../shared/artifact-operations'
const page=createPage('page')
const saved=(node:ArtifactNode,patch:Partial<ArtifactNode>)=>{const document=createDocument('design','geometry');document.pages[page.id]={...page,nodes:{[node.id]:node},nodeOrder:[node.id]};document.pageOrder=[page.id];return applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:page.id,nodeId:node.id,patch}])).document.pages[page.id].nodes[node.id]}

const pins:ElementPositionPins={bothX:false,bothY:false,useRight:false,useBottom:false,left:0,right:768,top:40,bottom:964}
test('双侧锚点锁定对应拖动方向，不把绘制后坐标写回作者偏移',()=>{
  const node={...createNode('text','text'),x:0,y:40,css:{right:'0px','margin-left':'auto','margin-right':'auto'}}
  assert.deepEqual(elementMoveValues({...pins,bothX:true},90,0),{top:40})
  assert.deepEqual(elementMovePatch(page,node,{...pins,bothX:true},90,0),{})
  assert.deepEqual(elementMovePatch(page,node,{...pins,bothX:true},90,10),{y:50})
})
test('右边和底边保持同一锚点，更新偏移不激活旧的左上几何',()=>{
  const node={...createNode('text','text'),css:{left:'auto',right:'0px',top:'auto',bottom:'0px'}}
  const before=JSON.stringify(node)
  assert.deepEqual(elementMovePatch(page,node,{...pins,useRight:true,useBottom:true,right:0,bottom:0},60,20).css,{left:'auto',right:'-60px',top:'auto',bottom:'-20px'})
  assert.equal(JSON.stringify(node),before)
})
test('左上拖动只写原生坐标并移除同属性CSS声明',()=>{
  const node={...createNode('text','text'),x:120,y:40,css:{left:'120px !important',right:'auto',filter:'blur(1px)'}}
  assert.deepEqual(elementMovePatch(page,node,{...pins,left:120},20,0),{x:140,css:{filter:'blur(1px)'}})
})

test('东侧缩放保留居中锚点和未触碰的自适应高度，西侧只调整作者左偏移',()=>{
  const node={...createNode('text','text'),x:0,y:40,width:1152,height:76,css:{right:'0px','margin-left':'auto','margin-right':'auto',height:'auto'},implicitHeight:true},painted={...node,x:384,height:60}
  const east=elementResizePatch(page,node,{...pins,bothX:true},painted,{...painted,width:1242},'e')
  assert.equal(east.height,undefined);assert.equal(east.implicitHeight,undefined)
  assert.deepEqual(east,{width:1242})
  const west=elementResizePatch(page,node,{...pins,bothX:true},painted,{...painted,x:474,width:1062},'w')
  assert.equal(west.x,90);assert.equal(saved(node,west).css?.right,'0px');assert.equal(saved(node,west).css?.['margin-left'],'auto')
})
test('右锚点东侧缩放调整右偏移，西侧缩放保留右偏移',()=>{
  const node={...createNode('text','text'),x:64,width:180,css:{left:'auto',right:'0px'}},painted={...node,x:1740}
  const east=elementResizePatch(page,node,{...pins,useRight:true,right:0},painted,{...painted,width:200},'e')
  assert.deepEqual(east,{width:200,css:{left:'auto',right:'-20px'}})
  const west=elementResizePatch(page,node,{...pins,useRight:true,right:0},painted,{...painted,x:1760,width:160},'w')
  assert.equal(saved(node,west).css?.right,'0px');assert.equal(west.x,undefined)
})

test('CSS锚点缩放仍提交几何工具计算的连接线坐标',()=>{
  const node={...createNode('line','line'),x:0,y:40,width:100,height:80,css:{left:'0px'},points:[{x:0,y:0},{x:100,y:80}]}
  const resized={...node,width:200,points:[{x:0,y:0},{x:200,y:80}]}
  assert.deepEqual(elementResizePatch(page,node,pins,node,resized,'e').points,resized.points)
})

test('键盘微移保留双侧居中锚点，只调整方向键所控制的偏移',async()=>{
 const {elementNudgePatch}=await import('./element-positioning')
 const node={...createNode('text','text'),x:0,y:40,css:{right:'0px','margin-left':'auto','margin-right':'auto'}}
 const patch=elementNudgePatch(page,node,{...pins,bothX:true},1,0)
 assert.equal(patch.x,1);assert.equal(patch.y,undefined);assert.equal(saved(node,patch).css?.right,'0px');assert.equal(saved(node,patch).css?.left,undefined)
 const right={...node,css:{left:'auto',right:'0px'}}
 assert.deepEqual(elementNudgePatch(page,right,{...pins,useRight:true,right:0},1,0),{css:{left:'auto',right:'-1px'}})
})

test('内容盒缩放扣除内边距和边框，零尺寸同样只写原生字段',()=>{
 const node={...createNode('text','text'),width:1152,height:76,css:{padding:'20px','box-sizing':'content-box'}}
 const painted={...node,width:1192,height:116},boxPins={...pins,boxWidth:40,boxHeight:40}
 const patch=elementResizePatch(page,node,boxPins,painted,{...painted,width:1232},'e')
 assert.equal(patch.width,1192);assert.equal(patch.css?.width,undefined)
 const zero=elementResizePatch(page,node,boxPins,painted,{...painted,width:8},'e')
 assert.equal(zero.width,0);assert.equal(zero.css?.width,undefined)
})
