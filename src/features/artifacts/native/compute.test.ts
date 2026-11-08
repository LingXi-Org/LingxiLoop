import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import { NativeCompute } from './compute'
import {packElementGeometry} from './compute-protocol'
import {ElementIndexes} from './compute-geometry'
import type { ComputeMessage, ComputeResponse } from './compute-protocol'

class TestWorker {
  static current: TestWorker
  sent: ComputeMessage[] = []
  onmessage: ((event: { data: ComputeResponse }) => void) | null = null
  onerror: (() => void) | null = null
  terminated = false
  constructor() { TestWorker.current = this }
  postMessage(message: ComputeMessage,transfer:Transferable[]=[]) { this.sent.push(structuredClone(message,{transfer})) }
  terminate() { this.terminated = true }
  reply(data: ComputeResponse) { this.onmessage?.({ data }) }
}

function installWorker(t: TestContext) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: TestWorker })
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'Worker', descriptor)
    else Reflect.deleteProperty(globalThis, 'Worker')
  })
}

test('revision changes reject old calculations and discard their late worker replies', async t => {
  installWorker(t)
  const compute = new NativeCompute()
  const old = compute.math('x', false, 1)
  const oldRejected = assert.rejects(old, { name: 'AbortError' })
  const next = compute.math('x+1', false, 2)
  TestWorker.current.reply({ id: 1, revision: 1, value: { html: 'stale' } })
  TestWorker.current.reply({ id: 2, revision: 2, value: { html: 'current' } })
  await oldRejected
  assert.deepEqual(await next, { html: 'current' })
  assert.ok(TestWorker.current.sent.some(message => 'cancel' in message && message.cancel === 1))
  compute.dispose()
})

test('unmount cancellation releases pending request and dispose terminates worker', async t => {
  installWorker(t)
  const compute = new NativeCompute()
  const controller = new AbortController()
  const pending = compute.math('x', false, 3, controller.signal)
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  compute.dispose()
  assert.equal(TestWorker.current.terminated, true)
  await assert.rejects(compute.visible({ x: 0, y: 0, width: 1, height: 1 }, 3), { name: 'AbortError' })
})

test('坐标缓冲区可转移，但页面缓存保持完整以支持再次查询与取消',async t=>{
 installWorker(t)
 const compute=new NativeCompute(),geometry=packElementGeometry([{id:'node',x:10,y:20,width:30,height:40}]),controller=new AbortController()
 const first=compute.projectElements('page',geometry,{x:0,y:0,width:100,height:100},0,controller.signal)
 assert.deepEqual([...geometry.coordinates],[10,20,30,40])
 const request=TestWorker.current.sent[0];assert.ok('task'in request&&request.task.kind==='project-elements')
 assert.deepEqual([...request.task.geometry.coordinates],[10,20,30,40])
 controller.abort();await assert.rejects(first,{name:'AbortError'})
 const second=compute.projectElements('page',geometry,{x:0,y:0,width:100,height:100},0)
 TestWorker.current.reply({id:2,revision:0,value:{ids:['node'],issues:[]}})
 assert.deepEqual(await second,{ids:['node'],issues:[]});assert.equal(geometry.coordinates.byteLength,32);compute.dispose()
})

test('编辑视图和预览共用计算器时，相同页面的不同几何不会碰撞',async t=>{
 installWorker(t)
 const compute=new NativeCompute(),indexes=new ElementIndexes(),viewport={x:0,y:0,width:100,height:100}
 const editor=packElementGeometry([{id:'node',x:10,y:10,width:20,height:20}])
 const preview=packElementGeometry([{id:'node',x:1000,y:10,width:20,height:20}])
 const run=async(geometry:ReturnType<typeof packElementGeometry>,revision:number)=>{
  const pending=compute.projectElements('page',geometry,viewport,revision)
  const request=TestWorker.current.sent.at(-1)!;assert.ok('task'in request&&request.task.kind==='project-elements')
  const task=request.task
  TestWorker.current.reply({id:request.id,revision,value:indexes.project(task.pageId,task.geometry,task.viewport,revision,task.geometryKey)})
  return{value:await pending,key:task.geometryKey}
 }
 const first=await run(editor,0),second=await run(preview,1),third=await run(editor,1)
 assert.deepEqual(first.value.ids,['node']);assert.deepEqual(second.value.ids,[]);assert.deepEqual(third.value.ids,['node'])
 assert.notEqual(first.key,second.key);assert.equal(first.key,third.key)
 compute.dispose()
})
