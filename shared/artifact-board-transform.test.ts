import assert from 'node:assert/strict'
import test from 'node:test'
import {moveBoardRects,resizeBoardRect,resizeBoardSelection,type BoardHandle} from './artifact-board-transform.js'
const first={x:0,y:0,width:1920,height:1080},others=[{...first,x:2080},{...first,x:4160}],scale=420/1900

test('固定来源标题拖动吸附、非吸附阈值及原对象不变',()=>{
  const original=JSON.stringify(first)
  assert.deepEqual(moveBoardRects([first],40/scale,30/scale,others,scale).rects[0],{...first,x:160,y:136})
  for(const [screenX,x]of [[25,113],[28,160],[30,160],[42,160],[44,199],[46,208]])assert.equal(moveBoardRects([first],screenX/scale,30/scale,others,scale).rects[0].x,x)
  assert.equal(JSON.stringify(first),original)
  assert.deepEqual(Object.keys(moveBoardRects([{...first,id:'来源标识',nodes:{}} as typeof first],0,0,[],1).rects[0]).sort(),['height','width','x','y'])
})

test('固定来源右下缩放吸附、Shift等比及120最小尺寸',()=>{
  assert.deepEqual(resizeBoardRect(first,'se',40/scale,30/scale,others,scale).rect,{...first,width:2080,height:1216})
  assert.deepEqual(resizeBoardRect(first,'se',40/scale,30/scale,others,scale,true).rect,{...first,width:2162,height:1216})
  assert.deepEqual(resizeBoardRect(first,'se',-500/scale,-300/scale,others,scale).rect,{...first,width:120,height:120})
  assert.deepEqual(resizeBoardRect(first,'se',-500/scale,-300/scale,others,scale,true).rect,{...first,width:213,height:120})
  assert.deepEqual(resizeBoardRect(first,'se',3000/scale,2000/scale,others,scale).rect,{...first,width:8000,height:8000})
})

test('左上缩放固定对角，多个画板共同移动保留间隔',()=>{
  const rect=resizeBoardRect(first,'nw',100,80,[],1).rect
  assert.deepEqual(rect,{x:100,y:80,width:1820,height:1000})
  const selected=[first,{...first,x:2080}],result=moveBoardRects(selected,100,80,[],1)
  assert.equal(result.rects[1].x-result.rects[0].x,2080)
})

test('固定参考八向手柄的实际保存几何一致',()=>{
  const expected:Record<BoardHandle,number[]>={n:[0,136,1920,944],e:[0,0,2080,1080],s:[0,0,1920,1216],w:[181,0,1739,1080],nw:[181,136,1739,944],ne:[0,136,2080,944],sw:[181,0,1739,1216],se:[0,0,2080,1216]}
  for(const handle of Object.keys(expected) as BoardHandle[]){
    const rect=resizeBoardRect(first,handle,40/scale,30/scale,others,scale).rect
    assert.deepEqual([rect.x,rect.y,rect.width,rect.height],expected[handle],handle)
  }
})

test('只吸附同类型，未触及的小数坐标和尺寸不写成整数',()=>{
  const page={x:0,y:0,width:200,height:150},other={x:200,y:1000,width:40,height:150}
  assert.equal(moveBoardRects([page],25,0,[other],1).rects[0].x,25)
  assert.equal(resizeBoardRect(page,'se',25,5,[other],1).rect.width,225)
  const fraction={x:.4,y:100.25,width:1920.4,height:1080.4}
  assert.deepEqual(moveBoardRects([fraction],40,0,[],1).rects[0],{...fraction,x:40})
  assert.equal(resizeBoardRect(fraction,'n',40,30,[],1).rect.width,fraction.width)
  assert.equal(resizeBoardRect(fraction,'n',40,30,[],1).rect.x,fraction.x)
})

test('原版多选统一外框的普通、等比和最小值实际保存结果',()=>{
  const pages=[first,others[0]],snapshot=JSON.stringify(pages)
  for(const [ratio,dx,dy,width,height,x]of [[false,40,30,1997,1216,2163],[true,40,30,2161,1216,2341],[false,-1000,-500,120,120,130]] as const){
    const result=resizeBoardSelection(pages,'se',dx/scale,dy/scale,[others[1]],scale,ratio)
    assert.deepEqual(result.rects,[{x:0,y:0,width,height},{x,y:0,width,height}])
  }
  assert.equal(JSON.stringify(pages),snapshot)
})

test('组缩放不改无边框页尺寸，未触及轴和舍入后相同的小数值保留',()=>{
  const pages=[{...first,x:.4,width:1920.4,frameless:true},{...first,x:2080.4,width:1920.4}]
  const result=resizeBoardSelection(pages,'n',0,30,[],1)
  assert.equal(result.rects[0].width,pages[0].width);assert.equal(result.rects[0].height,pages[0].height)
  assert.equal(result.rects[0].x,pages[0].x);assert.equal(result.rects[1].x,pages[1].x)
  assert.equal(result.rects[1].width,pages[1].width)
})
