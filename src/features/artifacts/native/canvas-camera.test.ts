import assert from 'node:assert/strict'
import test from 'node:test'
import {cameraScroll,worldCamera} from './canvas-camera'

const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-8)
test('world cameras survive narrower scroll extents without consuming clamped DOM positions',()=>{
  const old={x:2928,y:2400,scale:.22105263157894736},scroll={x:2880,y:2200},camera=worldCamera(scroll,old)
  const narrow={...old,x:780,y:1900}
  const next=cameraScroll(camera,narrow)
  assert.notEqual(next.x,2542-(2880-780),'a browser-clamped old scroll value cannot become the camera')
  const restored=cameraScroll(worldCamera(next,narrow),old)
  near(restored.x,scroll.x);near(restored.y,scroll.y)
})

test('cached world cameras preserve object screen coordinates after inactive canvas origin changes',()=>{
  const old={x:2928,y:2400,scale:.22105263157894736},scroll={x:2880,y:2200},object={x:688,y:-778}
  const cached=JSON.parse(JSON.stringify(worldCamera(scroll,old)))
  const next={...old,x:old.x+5000*old.scale,y:old.y+3000*old.scale},restored=cameraScroll(cached,next)
  near(object.x*old.scale+old.x-scroll.x,object.x*next.scale+next.x-restored.x)
  near(object.y*old.scale+old.y-scroll.y,object.y*next.scale+next.y-restored.y)
})
