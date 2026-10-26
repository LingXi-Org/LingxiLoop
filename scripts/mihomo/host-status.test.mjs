import test from 'node:test'
import assert from 'node:assert/strict'
import {inspectUploadPaths} from './host-status.mjs'
test('upload inventory uses fixed stat/systemd reads on A/B without reading provider content or mutating services',async()=>{
  const bodies=[]
  const result=await inspectUploadPaths({KOMODO_API_KEY:'private',KOMODO_API_SECRET:'private'},{fetcher:async(_url,init)=>{
    const body=JSON.parse(init.body);bodies.push(body)
    assert.doesNotMatch(body.command,/systemctl (?:start|restart|enable)|chmod|mkdir|provider.*read_text/)
    return new Response(JSON.stringify({readOnly:true,paths:[],service:{LoadState:'not-found'},providerContentsRead:false})+'\n')
  }})
  assert.deepEqual(bodies.map(b=>b.target.params.server),['shanghai-a','shanghai-b'])
  assert.equal(result.hosts.length,2);assert.equal(result.productionWrites,0)
})
