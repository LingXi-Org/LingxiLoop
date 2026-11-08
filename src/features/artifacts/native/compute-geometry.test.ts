import {packElementGeometry} from './compute-protocol'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BoundsIndex, ElementIndexes } from './compute-geometry'

test('visible boards follow viewport and incremental moves/removals without document payloads', () => {
  const index = new BoundsIndex()
  index.replace(Array.from({ length: 50 }, (_, i) => ({ id: `page-${i}`, x: i * 1100, y: 0, width: 1000, height: 700 })))
  assert.deepEqual(index.visible({ x: 0, y: 0, width: 1050, height: 900 }), ['page-0'])
  assert.deepEqual(index.visible({ x: 1100 * 49, y: 0, width: 1000, height: 700 }), ['page-49'])
  index.update([{ id: 'page-49', x: 20, y: 20, width: 1000, height: 700 }], ['page-0'])
  assert.deepEqual(index.visible({ x: 0, y: 0, width: 1050, height: 900 }), ['page-49'])
  index.replace([])
  assert.deepEqual(index.visible({ x: 0, y: 0, width: 1050, height: 900 }), [])
})

test('snap chooses nearest page edge/centre independently and leaves distant coordinates untouched', () => {
  const index = new BoundsIndex()
  index.replace([{ id: 'a', x: 100, y: 200, width: 500, height: 400 }])
  assert.deepEqual(index.snap({ x: 348, y: 599 }, 6), { x: 350, y: 600 })
  assert.deepEqual(index.snap({ x: 300, y: 500 }, 6), { x: 300, y: 500 })
})

test('50个画板可在一个计算回合内依次装载并裁剪，索引仍只有8页',()=>{
 const indexes=new ElementIndexes(),viewport={x:0,y:0,width:100,height:100}
 for(let page=0;page<50;page++){
  const result=indexes.project(`p${page}`,packElementGeometry([{id:'visible',...viewport},{id:'outside',x:1000,y:0,width:20,height:20}]),viewport,1,page)
  assert.deepEqual(result.ids,['visible']);assert.deepEqual(result.issues,[])
  assert.ok(indexes.size<=8)
 }
 const result=indexes.project('p0',packElementGeometry([{id:'updated',...viewport}]),viewport,2,51)
 assert.deepEqual(result.ids,['updated'])
 assert.throws(()=>indexes.project('p0',packElementGeometry([]),viewport,1,1),/stale_index/)
})

test('视口改变复用同份几何，几何改变后重新校验；异常位置仍有中文上层反馈依据',()=>{
 const indexes=new ElementIndexes(),viewport={x:0,y:0,width:100,height:100}
 const first=indexes.project('page',packElementGeometry([{id:'a',...viewport}]),viewport,1,1)
 const next=indexes.project('page',packElementGeometry([{id:'a',...viewport}]),{...viewport,x:500},1,1)
 assert.deepEqual(first.ids,['a']);assert.deepEqual(next.ids,[])
 assert.equal(first.issues,next.issues,'未改几何不重复校验')
 const invalid=indexes.project('page',packElementGeometry([{id:'a',...viewport,width:-1}]),viewport,2,2)
 assert.deepEqual(invalid.issues,[{id:'a',code:'negative_size'}]);assert.deepEqual(invalid.ids,[])
})
