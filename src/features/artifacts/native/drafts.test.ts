import assert from 'node:assert/strict'
import test from 'node:test'
import { NativeDrafts } from './drafts'

test('explicit saving flushes editable controls while an unfinished pen keeps its transient points',()=>{
  const drafts=new NativeDrafts(),field=Symbol('field'),pen=Symbol('pen')
  let fieldSaves=0,completedPaths=0
  drafts.register(field,()=>{fieldSaves++;drafts.mark(field,false)})
  const unmount=drafts.register(pen,reason=>{if(reason!=='save'){completedPaths++;drafts.mark(pen,false)}})
  drafts.mark(field,true);drafts.mark(pen,true);drafts.flush('save')
  assert.equal(fieldSaves,1);assert.equal(completedPaths,0);assert.equal(drafts.getSnapshot(),1)
  unmount();assert.equal(completedPaths,1);assert.equal(drafts.getSnapshot(),0)
})

test('separate editor draft registries isolate save callbacks and dirty snapshots', () => {
  const first = new NativeDrafts(), second = new NativeDrafts(), key = Symbol('control')
  let firstSaves = 0, secondSaves = 0, firstNotifications = 0, secondNotifications = 0
  first.register(key, () => { firstSaves++; first.mark(key, false) })
  second.register(key, () => { secondSaves++; second.mark(key, false) })
  const unsubscribe = first.subscribe(() => { firstNotifications++ })
  second.subscribe(() => { secondNotifications++ })
  first.mark(key, true); first.mark(key, true)
  second.mark(key, true)
  first.flush()
  assert.equal(first.getSnapshot(), 0)
  assert.equal(second.getSnapshot(), 1)
  assert.equal(firstSaves, 1)
  assert.equal(secondSaves, 0)
  assert.equal(firstNotifications, 2)
  assert.equal(secondNotifications, 1)
  unsubscribe()
  first.mark(key, true)
  assert.equal(firstNotifications, 2)
})

test('flush retains a composing control as dirty until the control acknowledges its draft', () => {
  const drafts = new NativeDrafts(), key = Symbol('text')
  let composing = true, saves = 0
  drafts.register(key, () => {
    if (composing) return
    saves++; drafts.mark(key, false)
  })
  drafts.mark(key, true)
  drafts.flush()
  assert.equal(drafts.getSnapshot(), 1)
  assert.equal(saves, 0)
  composing = false
  drafts.flush()
  assert.equal(drafts.getSnapshot(), 0)
  assert.equal(saves, 1)
})

test('control cleanup flushes its latest callback and removes the dirty registration once', () => {
  const drafts = new NativeDrafts(), key = Symbol('field')
  let latest: () => void = () => { throw new Error('stale callback') }
  let saves = 0
  const dispose = drafts.register(key, () => latest())
  drafts.mark(key, true)
  latest = () => { saves++ }
  dispose(); dispose()
  assert.equal(saves, 1)
  assert.equal(drafts.getSnapshot(), 0)
  drafts.mark(key, true)
  assert.equal(drafts.getSnapshot(), 0)
  const remount = drafts.register(key, () => { saves++ })
  assert.equal(drafts.getSnapshot(), 0)
  remount()
  assert.equal(saves, 2)
})

test('cleanup removes a dirty entry even if its flush reports a failure', () => {
  const drafts = new NativeDrafts(), key = Symbol('field')
  const dispose = drafts.register(key, () => { throw new Error('save failed') })
  drafts.mark(key, true)
  assert.throws(dispose, /save failed/)
  assert.equal(drafts.getSnapshot(), 0)
})
