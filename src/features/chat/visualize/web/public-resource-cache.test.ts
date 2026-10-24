import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { createPublicResourceCache } from './public-resource-cache'

const hash = (text:string) => createHash('sha256').update(text).digest('hex')
const signal = () => new AbortController().signal
const deferred = () => {
  let resolve!:(text:string)=>void
  let reject!:(error:Error)=>void
  const promise=new Promise<string>((done,fail)=>{resolve=done;reject=fail})
  return {promise,resolve,reject}
}
test('simultaneous cold pages share one verified public resource load', async () => {
  const cache=createPublicResourceCache()
  let reads=0
  let release!:()=>void
  const gate=new Promise<void>(resolve=>{release=resolve})
  const load=async()=>{reads++;await gate;return 'fixed runtime'}
  const pending=[cache.read('gen-ui.js',hash('fixed runtime'),load,signal()),cache.read('gen-ui.js',hash('fixed runtime'),load,signal())]
  const twoPages=reads
  pending.push(cache.read('gen-ui.js',hash('fixed runtime'),load,signal()))
  try {
    assert.deepEqual({twoPages,threePages:reads},{twoPages:1,threePages:1})
  } finally {
    release()
    assert.deepEqual(await Promise.all(pending),['fixed runtime','fixed runtime','fixed runtime'])
  }
})
test('followers cancel independently and an aborted owner releases them to their own capability', async () => {
  const cache=createPublicResourceCache()
  const gate=deferred(),ownerAbort=new AbortController(),followerAbort=new AbortController()
  let followerReads=0
  const owner=cache.read('gen-ui.js',hash('runtime'),()=>gate.promise,ownerAbort.signal)
  const cancelled=cache.read('gen-ui.js',hash('runtime'),async()=>{throw new Error('cancelled follower must not load')},followerAbort.signal)
  const peer=cache.read('gen-ui.js',hash('runtime'),async()=>{followerReads++;return 'runtime'},signal())
  followerAbort.abort(new Error('follower cancelled'))
  await assert.rejects(cancelled,/follower cancelled/)
  assert.equal(ownerAbort.signal.aborted,false)
  assert.equal(followerReads,0)
  ownerAbort.abort(new Error('owner cancelled'))
  await assert.rejects(owner,/owner cancelled/)
  assert.equal(await peer,'runtime','fallback cannot wait for an aborted owner whose loader ignores cancellation')
  assert.equal(followerReads,1)
  gate.resolve('runtime')
  await cache.read('gen-ui.js',hash('runtime'),async()=>{throw new Error('late cancelled owner must not evict verified peer bytes')},signal())
})

test('owner failures and mismatched bytes fall back once without poisoning the cache', async () => {
  for(const failure of ['network','digest']) {
    const cache=createPublicResourceCache(),gate=deferred()
    let reads=0
    const owner=cache.read('gen-ui.js',hash('complete runtime'),()=>gate.promise,signal())
    const rejected=assert.rejects(owner,failure==='network'?/HTTP 503/:/完整性/)
    const peer=cache.read('gen-ui.js',hash('complete runtime'),async()=>{reads++;throw new Error('own capability denied')},signal())
    const peerRejected=assert.rejects(peer,/own capability denied/)
    if(failure==='network')gate.reject(new Error('HTTP 503'));else gate.resolve('truncated')
    await Promise.all([rejected,peerRejected])
    assert.equal(reads,1,'a failed fallback must not join or retry another owner')
    assert.equal(await cache.read('gen-ui.js',hash('complete runtime'),async()=>{reads++;return 'complete runtime'},signal()),'complete runtime')
    assert.equal(await cache.read('gen-ui.js',hash('complete runtime'),async()=>{throw new Error('verified bytes should be cached')},signal()),'complete runtime')
    assert.equal(reads,2,'failed owners and followers retain neither pending slots nor bytes')
  }
})

test('a follower waits at most five seconds before one own read without cancelling its owner', async t => {
  t.mock.timers.enable({apis:['setTimeout']})
  const cache=createPublicResourceCache(),gate=deferred(),ownerAbort=new AbortController()
  let reads=0
  const owner=cache.read('gen-ui.js',hash('runtime'),()=>gate.promise,ownerAbort.signal)
  const peer=cache.read('gen-ui.js',hash('runtime'),async()=>{reads++;return 'runtime'},signal())
  const failedPeer=cache.read('gen-ui.js',hash('runtime'),async()=>{reads++;throw new Error('own read failed')},signal())
  const rejected=assert.rejects(failedPeer,/own read failed/)
  t.mock.timers.tick(4999)
  await Promise.resolve()
  assert.equal(reads,0)
  t.mock.timers.tick(1)
  assert.equal(await peer,'runtime')
  await rejected
  assert.equal(reads,2,'each timed-out follower gets one own read')
  assert.equal(ownerAbort.signal.aborted,false)
  gate.resolve('runtime')
  assert.equal(await owner,'runtime')
})

test('pending capacity, completed LRU budgets and version/private isolation stay bounded', async () => {
  const cache=createPublicResourceCache({maxEntries:1,maxBytes:64})
  let reads=0
  const load=(text:string)=>async()=>{reads++;return text}
  const gate=deferred()
  const owner=cache.read('gen-ui.js',hash('old'),()=>gate.promise,signal())
  const overflow=deferred()
  const first=cache.read('visualize.css',hash('new'),async()=>{reads++;return overflow.promise},signal())
  const second=cache.read('visualize.css',hash('new'),async()=>{reads++;return overflow.promise},signal())
  assert.equal(reads,2,'a full pending registry cannot register another shared owner')
  assert.equal(await cache.read('gen-ui.js',hash('changed'),load('changed'),signal()),'changed','versions must not follow the old pending digest')
  overflow.resolve('new');gate.resolve('old')
  await Promise.all([owner,first,second])
  const next=deferred()
  const nextOwner=cache.read('calendar.js',hash('calendar'),()=>next.promise,signal())
  const nextPeer=cache.read('calendar.js',hash('calendar'),async()=>{throw new Error('settled pending slots must be reusable')},signal())
  next.resolve('calendar');await Promise.all([nextOwner,nextPeer])
  reads=0
  await cache.read('gen-ui.js',hash('a'),load('a'),signal())
  await cache.read('visualize.css',hash('b'),load('b'),signal())
  await cache.read('gen-ui.js',hash('a'),load('a'),signal())
  assert.equal(reads,3)
  const oversized='x'.repeat(100)
  for(let attempt=0;attempt<2;attempt++)await cache.read('gen-ui.js',hash(oversized),load(oversized),signal())
  assert.equal(reads,5,'an oversized successful response is not retained')
  for(const [name,digest] of [['document.html',hash('private')],['state',hash('private')],['../gen-ui.js',hash('private')],['gen-ui.js',undefined],['gen-ui.js','invalid']]) {
    const privateGate=deferred()
    let privateReads=0
    const privateLoad=async()=>{privateReads++;return privateGate.promise}
    const pair=[cache.read(name!,digest,privateLoad,signal()),cache.read(name!,digest,privateLoad,signal())]
    assert.equal(privateReads,2,'private/unknown names and missing/invalid hashes must not share pending reads')
    privateGate.resolve('private');await Promise.all(pair)
    await cache.read(name!,digest,privateLoad,signal())
    assert.equal(privateReads,3,'private and unknown bytes must not be retained')
  }
})
