import test from 'node:test'
import assert from 'node:assert/strict'
import {createTransport} from './schema-upgrade-komodo.mjs'
const sid='a'.repeat(24),id='b'.repeat(24),stack='lingxiloop-app-a',commit='c'.repeat(40)
function fixture(fault){
 const calls=[],events=[]
 const transport=createTransport({apiKey:'fixture',apiSecret:'fixture',wait:async()=>{},onProgress:async e=>events.push(e),fetcher:async(url,options)=>{
  calls.push({url,params:JSON.parse(options.body)})
  if(url.endsWith('GetStack'))return Response.json({_id:{$oid:sid}})
  if(fault==='unknown')throw Error('secret fixture never emitted')
  if(url.endsWith('UpdateStack'))return Response.json({})
  return Response.json({_id:{$oid:id},operation:fault==='wrong-operation'?'DeployStack':'WriteStackContents',target:{type:'Stack',id:fault==='wrong-target'?'d'.repeat(24):sid},status:'Complete',success:fault!=='failure'})
 }})
 return {transport,calls,events}
}
test('public host file write binds real WriteStackContents receipt and re-reads exact update',async()=>{
 const f=fixture();await f.transport.writeHostFile(stack,'services: {}')
 assert.deepEqual(f.calls.map(x=>x.url.split('/').at(-1)),['GetStack','WriteStackFileContents','GetUpdate'])
 assert.deepEqual(f.calls[1].params,{stack,file_path:'compose.yml',contents:'services: {}'})
})
test('wrong receipt/unknown write is never retried or treated as success',async()=>{
 for(const fault of ['unknown','wrong-operation','wrong-target','failure']){
  const f=fixture(fault);await assert.rejects(f.transport.writeHostFile(stack,'services: {}'),e=>!e.message.includes('secret fixture'))
  assert.equal(f.calls.filter(x=>x.url.endsWith('WriteStackFileContents')).length,1)
  assert.equal(f.events.some(x=>x.status==='complete'),false)
 }
})
test('native config patch changes only exact app provenance and cache/dependency policy',async()=>{
 const f=fixture();await f.transport.setHostReleaseConfig(stack,{commit,branch:'release/target',auto_pull:false,extra_args:['--no-deps','--pull','never']})
 assert.deepEqual(f.calls[1].params,{id:sid,config:{commit,branch:'release/target',auto_pull:false,extra_args:['--no-deps','--pull','never']}})
 for(const config of [{commit,branch:'release/target',auto_pull:true,extra_args:[]},{commit,branch:'release/target',auto_pull:false,extra_args:['--privileged']},{commit,branch:'release/target',auto_pull:false,extra_args:['--no-deps','--pull','never'],environment:'secret'}]){
  const a=fixture();await assert.rejects(a.transport.setHostReleaseConfig(stack,config));assert.equal(a.calls.length,0)
 }
 const a=fixture();await assert.rejects(a.transport.writeHostFile('lingxiloop-core-state','services: {}'));assert.equal(a.calls.length,0)
})
