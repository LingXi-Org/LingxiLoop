import assert from 'node:assert/strict'
import test from 'node:test'
import { anchorInFrame, pointInFrame } from './rendered-geometry'
test('comments use the actual layout offset and rendered size rather than authored absolute offsets',()=>{
  const frame={matrix:[0,1,-1,0,300,100] as [number,number,number,number,number,number],width:80,height:40}
  const point={x:270,y:120},anchor=anchorInFrame('p','image',frame,point)
  assert.deepEqual(anchor,{pageId:'p',nodeId:'image',x:.25,y:.75})
  assert.deepEqual(pointInFrame(anchor,frame),point)
})
