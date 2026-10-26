import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {nativeCommand,nativeOperation} from './native-operator.mjs'
test('native maintenance has fixed finite actions and no Docker/network-policy mutation',()=>{
 for(const action of ['query','install','validate','start','probe']){
  const source=nativeCommand('a',action)
  const result=spawnSync('python3',['-c','import ast,shlex,sys;ast.parse(shlex.split(sys.argv[1])[2])',source])
  assert.equal(result.status,0)
  assert.doesNotMatch(source,/daemon\.json|systemctl[^\n]*(?:restart|enable)|--insecure|curl[^\n]*['"]-k['"]/)
 }
 assert.throws(()=>nativeCommand('c','start'));assert.throws(()=>nativeCommand('a','restart-docker'))
})
test('unconfirmed terminal output is never retried, and fixed host/action receipt is returned',async()=>{
 let calls=0
 const env={KOMODO_API_KEY:'private',KOMODO_API_SECRET:'private'}
 const fetcher=async(_url,init)=>{calls++;const body=JSON.parse(init.body);assert.equal(body.target.params.server,'shanghai-b');assert.equal(body.terminal,'issue-514-native-b-query');return new Response('{"verified":false}\n')}
 assert.equal((await nativeOperation('b','query',{env,fetcher})).receipt.verified,false)
 await assert.rejects(nativeOperation('b','query',{env,fetcher:async()=>{calls++;return new Response('incomplete')}}),/UNCONFIRMED/)
 assert.equal(calls,2)
})
