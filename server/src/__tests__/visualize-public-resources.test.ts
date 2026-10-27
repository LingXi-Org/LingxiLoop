import assert from 'node:assert/strict'
import test from 'node:test'
import { publicVisualizeResourceHashes } from '../im/visualize-public-resources'

test('only exact public asset names and valid fixed hashes leave the server manifest boundary', () => {
  const css='a'.repeat(64), bundle='b'.repeat(64), vendor='c'.repeat(64)
  const hashes=publicVisualizeResourceHashes({files:{'visualize.css':{sha256:css},'document.html':{sha256:css},'../state':{sha256:css},'calendar.js':{sha256:'invalid'}}},
    {resources:[{file:'d3-7.9.0.min.js',sha256:vendor},{file:'../../private',sha256:vendor},{file:'unknown.js',sha256:vendor}]},
    {files:{'gen-ui.js':{sha256:bundle},'private.json':{sha256:bundle}}})
  assert.deepEqual(hashes,{'visualize.css':css,'gen-ui.js':bundle,'vendor/d3-7.9.0.min.js':vendor})
  assert.equal(Object.isFrozen(hashes),true)
  assert.deepEqual(publicVisualizeResourceHashes(null,[],{files:{'gen-ui.js':{sha256:42}}}),{})
})

// Fixed bytes must be checked once, shared concurrently, and never cache a failure.
test('public byte cache coalesces verified reads, retries failures and respects its memory limit', async () => {
  const { createVisualizeAssetCache } = await import('../im/visualize-public-resources')
  const { createHash } = await import('node:crypto')
  const bytes=Buffer.from('fixed public bytes'), hash=createHash('sha256').update(bytes).digest('hex')
  let reads=0, fail=true
  const cached=createVisualizeAssetCache(async()=>{reads++;if(fail)throw new Error('fixture read failure');return bytes})
  await assert.rejects(cached('gen-ui.js',hash),/fixture read failure/)
  fail=false
  const [a,b]=await Promise.all([cached('gen-ui.js',hash),cached('gen-ui.js',hash)])
  assert.equal(a,b)
  await cached('gen-ui.js',hash)
  assert.equal(reads,2)
  await assert.rejects(cached('document.html',hash),/Unknown/)
  await assert.rejects(cached('visualize.css','0'.repeat(64)),/integrity/)
  const uncached=createVisualizeAssetCache(async()=>{reads++;return bytes},1)
  const before=reads
  await uncached('gen-ui.js',hash); await uncached('gen-ui.js',hash)
  assert.equal(reads-before,2)
})
