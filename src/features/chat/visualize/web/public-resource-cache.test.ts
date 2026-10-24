import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { createPublicResourceCache } from './public-resource-cache'

const hash = (text:string) => createHash('sha256').update(text).digest('hex')
const signal = () => new AbortController().signal
test('only complete public bytes with matching version hashes are reused', async () => {
  const cache=createPublicResourceCache()
  let reads=0
  const read=async()=>{reads++;return 'fixed runtime'}
  assert.equal(await cache.read('gen-ui.js',hash('fixed runtime'),read,signal()),'fixed runtime')
  assert.equal(await cache.read('gen-ui.js',hash('fixed runtime'),read,signal()),'fixed runtime')
  assert.equal(reads,1)
  await cache.read('gen-ui.js',hash('new runtime'),async()=>{reads++;return 'new runtime'},signal())
  assert.equal(reads,2,'a changed digest is a distinct immutable version')
  for(const name of ['document.html','state','../gen-ui.js'])for(let attempt=0;attempt<2;attempt++)await cache.read(name,hash('fixed runtime'),read,signal())
  assert.equal(reads,8,'private and unknown names never enter the public cache')
  for(let attempt=0;attempt<2;attempt++)await cache.read('gen-ui.js',undefined,read,signal())
  assert.equal(reads,10,'an older page response without hashes keeps the existing resource path')
})
test('failure, cancellation and mismatched bytes never create cache entries', async () => {
  const cache=createPublicResourceCache()
  const digest=hash('complete runtime')
  await assert.rejects(cache.read('gen-ui.js',digest,async()=>{throw new Error('HTTP 503')},signal()),/503/)
  await assert.rejects(cache.read('gen-ui.js',digest,async()=>'truncated',signal()),/完整性/)
  const abort=new AbortController()
  await assert.rejects(cache.read('gen-ui.js',digest,async()=>{abort.abort(new Error('cancelled'));return 'complete runtime'},abort.signal),/cancelled/)
  let reads=0
  await cache.read('gen-ui.js',digest,async()=>{reads++;return 'complete runtime'},signal())
  assert.equal(reads,1)
})
test('bounded LRU eviction and simultaneous readers preserve independent cancellation', async () => {
  const cache=createPublicResourceCache({maxEntries:1,maxBytes:64})
  let reads=0
  const load=(text:string)=>async()=>{reads++;return text}
  await cache.read('gen-ui.js',hash('a'),load('a'),signal())
  await cache.read('visualize.css',hash('b'),load('b'),signal())
  await cache.read('gen-ui.js',hash('a'),load('a'),signal())
  assert.equal(reads,3)
  let release!:()=>void
  const gate=new Promise<void>(resolve=>{release=resolve})
  const abort=new AbortController()
  const pending=cache.read('visualize.html',hash('kit'),async()=>{await gate;return 'kit'},abort.signal)
  const peer=cache.read('visualize.html',hash('kit'),async()=>{await gate;return 'kit'},signal())
  abort.abort(new Error('old page cancelled'));release()
  await assert.rejects(pending,/old page cancelled/)
  assert.equal(await peer,'kit')
  const oversized='x'.repeat(100)
  for(let attempt=0;attempt<2;attempt++)await cache.read('gen-ui.js',hash(oversized),load(oversized),signal())
  assert.equal(reads,5,'an oversized successful response is not retained')
})
