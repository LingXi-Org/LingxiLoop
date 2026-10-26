import test from 'node:test'
import assert from 'node:assert/strict'
import {ComposeAdapter,validatePolicy} from './adapter.mjs'
import {policy,newImage} from './fixtures/fake-host.mjs'
test('registry is the only enabled image transport and missing proxy fails before pull',async()=>{
 assert.throws(()=>validatePolicy({...policy('/tmp/fixed'),artifactTransport:'r2'}),{code:'INVALID_POLICY'})
 let pulls=0
 const adapter={policy:{artifactTransport:'registry'},inspectImage:async()=>null,run:async args=>{if(args[0]==='info')return '{}';pulls++}}
 await assert.rejects(ComposeAdapter.prototype.prepareImage.call(adapter,{},newImage,{}, {step:(_key,fn)=>fn()},'forward'),{code:'REGISTRY_PROXY_UNQUALIFIED'})
 assert.equal(pulls,0)
})
test('lost pull response resumes from immutable cache identity, never falls back to R2 or reloads source',async()=>{
 let complete=false,pulls=0
 const identity={localImageId:newImage.indexDigest,localIdKind:'index'}
 const adapter={policy:{artifactTransport:'registry'},inspectImage:async()=>complete?identity:null,run:async(args,options)=>{
  if(args[0]==='info')return JSON.stringify({HttpProxy:'http://127.0.0.1:17890',HttpsProxy:'http://127.0.0.1:17890'})
  assert.deepEqual(args,['image','pull','--quiet','--platform','linux/amd64',newImage.ref]);assert.equal(options.timeout,300000);pulls++;complete=true;throw Error('lost CLI response')
 }}
 const prepare=direction=>ComposeAdapter.prototype.prepareImage.call(adapter,{},newImage,{}, {step:(_key,fn)=>fn()},direction)
 await assert.rejects(prepare('source'),{code:'OFFLINE_IMAGE_MISSING'});assert.equal(pulls,0)
 assert.equal((await prepare('forward')).reused,false)
 assert.equal((await prepare('forward')).reused,true);assert.equal(pulls,1)
})
