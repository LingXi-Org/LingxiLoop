import assert from 'node:assert/strict'
import test from 'node:test'
import {equalBoardGaps} from './artifact-board-spacing.js'
import {moveBoardRects} from './artifact-board-transform.js'

const scale=420/1900,first={x:0,y:0,width:1920,height:1080},middle={...first,x:2080},last={...first,x:4160}
test('原版中间画板保持两侧160间距，标注按实际重叠范围居中',()=>{
  const moving={...middle,x:middle.x+5/scale,y:30/scale},result=equalBoardGaps(moving,[first,last],8/scale)
  assert.ok(Math.abs(moving.x+result.dx-2080)<1e-9)
  assert.equal(result.dy,0);assert.deepEqual(result.gaps.map(gap=>[gap.axis,gap.from,gap.to,gap.label]),[['x',1920,2080,'160'],['x',4000,4160,'160']])
  assert.ok(result.gaps.every(gap=>Math.abs(gap.at-(moving.y+1080)/2)<1e-9))
})
test('向左延续已有间距，垂直布局使用相同几何规则',()=>{
  const result=moveBoardRects([first],-5/scale,30/scale,[middle,last],scale)
  assert.deepEqual(result.rects[0],{...first,y:136});assert.deepEqual(result.gaps.map(gap=>gap.label),['160','160'])
  const swap=(rect:typeof first)=>({x:rect.y,y:rect.x,width:rect.height,height:rect.width})
  const moving=swap({...middle,x:middle.x+5/scale,y:30/scale}),vertical=equalBoardGaps(moving,[swap(first),swap(last)],8/scale)
  assert.ok(Math.abs(moving.y+vertical.dy-2080)<1e-9);assert.ok(vertical.gaps.every(gap=>gap.axis==='y'&&gap.label==='160'))
})
test('最近容器限制外部参考，取消吸附不返回残留间距',()=>{
  const moving={x:300,y:100,width:100,height:100},container={x:0,y:0,width:1000,height:1000}
  assert.deepEqual(equalBoardGaps(moving,[container,{...moving,x:1200},{...moving,x:1400}],80).gaps,[])
  const unsnapped=moveBoardRects([middle],5/scale,30/scale,[],scale)
  assert.equal(unsnapped.rects[0].x,2103);assert.deepEqual(unsnapped.gaps,[])
})
