import {createNode,createPage} from '../../../../shared/artifact-document'
import {nodeMatrix} from '../../../../shared/artifact-geometry'
import assert from 'node:assert/strict'
import test from 'node:test'
import { anchorInFrame, pointInFrame,readElementFrame,layoutPosition } from './rendered-geometry'
test('comments use the actual layout offset and rendered size rather than authored absolute offsets',()=>{
  const frame={matrix:[0,1,-1,0,300,100] as [number,number,number,number,number,number],width:80,height:40}
  const point={x:270,y:120},anchor=anchorInFrame('p','image',frame,point)
  assert.deepEqual(anchor,{pageId:'p',nodeId:'image',x:.25,y:.75})
  assert.deepEqual(pointInFrame(anchor,frame),point)
})

test('fractional layout positions survive rotated and mirrored parents at magnified canvas scales',()=>{
  const page=createPage('p'),group={...createNode('group','group'),x:200,y:300,width:480,height:3000,rotation:37,flipX:true},node={...createNode('note','note'),parentId:'group',rotation:-13,flipY:true},actual={...node,x:250.25,y:1510.5,width:230.125,height:3128.375}
  page.nodes={group,note:actual};page.nodeOrder=['group','note']
  const expected=nodeMatrix(page,actual),parent={matrix:nodeMatrix(page,group),width:group.width,height:group.height},origin={left:-120000,top:-330000},scale=8
  const corners=[[0,0],[actual.width,0],[0,actual.height],[actual.width,actual.height]].map(([x,y])=>({x:expected[0]*x+expected[2]*y+expected[4],y:expected[1]*x+expected[3]*y+expected[5]}))
  const element={offsetWidth:230,offsetHeight:3128,getBoundingClientRect:()=>({left:origin.left+Math.min(...corners.map(p=>p.x))*scale,top:origin.top+Math.min(...corners.map(p=>p.y))*scale})} as unknown as HTMLElement
  const source=Object.getOwnPropertyDescriptor(globalThis,'getComputedStyle')
  Object.defineProperty(globalThis,'getComputedStyle',{configurable:true,value:()=>({width:`${actual.width}px`,height:`${actual.height}px`})})
  try{
    const frame=readElementFrame({getBoundingClientRect:()=>origin} as HTMLElement,element,page,node,scale),position=layoutPosition(node,frame,parent)
    for(let i=0;i<6;i++)assert.ok(Math.abs(frame.matrix[i]!-expected[i]!)<1e-8)
    assert.equal(frame.width,actual.width);assert.equal(frame.height,actual.height)
    assert.ok(Math.abs(position.x-actual.x)<1e-8);assert.ok(Math.abs(position.y-actual.y)<1e-8)
  }finally{if(source)Object.defineProperty(globalThis,'getComputedStyle',source);else Reflect.deleteProperty(globalThis,'getComputedStyle')}
})
