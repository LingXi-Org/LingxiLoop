import test from 'node:test'
import assert from 'node:assert/strict'
import {pullBenchmark} from './pull-benchmark.mjs'
test('pull consumes canonical target manifests and refuses missing proof before any remote operation',async()=>{
 let calls=0
 const env={KOMODO_API_KEY:'private',KOMODO_API_SECRET:'private'}
 const fetcher=async(_url,init)=>{calls++;const body=JSON.parse(init.body);assert.equal(body.target.params.server,'shanghai-b');assert.ok(body.command.endsWith(' query'));return new Response('{"status":"observed-unverified","pullAttempts":0}')}
 await assert.rejects(pullBenchmark('b',{},{env,fetcher}),{code:'QUALIFIED_IMAGE_PROOF_REQUIRED'});assert.equal(calls,0)
 const manifest={targets:{'main-runtime-b':{hostPlan:{images:{lingxiloop:{ociProof:{config:'fixture'},configDigest:'sha256:fixture',platformDigest:'sha256:fixture'}}}}}}
 const result=await pullBenchmark('b',manifest,{env,fetcher,observe:true});assert.equal(result.pullAttempts,0);assert.equal(calls,1)
})
