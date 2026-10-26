import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareCache} from './cache-pull.mjs'
const image={configDigest:'sha256:fixed',os:'linux',architecture:'amd64',ref:'ghcr.io/fixed@sha256:fixed'}
const failed=stderr=>Object.assign(Error('pull'),{code:'DOCKER_COMMAND_FAILED',cause:{stderr}})
function fixture(run,inspect=async()=>null){let clock=0;const steps=[];return {steps,args:{op:{createdAt:new Date(0).toISOString()},image,direction:'forward',context:{step:async(name,fn)=>{steps.push(name);return fn()}},run,inspect,now:()=>clock,wait:async ms=>{clock+=ms}},advance:ms=>clock+=ms}}
test('transient pull gets one quiet bounded retry after cache readback',async()=>{
 let calls=0;const proof={verified:true};const f=fixture(async(args,options)=>{assert.ok(args.includes('--quiet'));assert.equal(options.timeout,300000);if(++calls===1)throw failed('unexpected EOF')},async()=>calls===2?proof:null)
 assert.equal(await prepareCache(f.args),proof);assert.equal(calls,2);assert.deepEqual(f.steps,['pull:forward:sha256:fixed','pull:forward:sha256:fixed:retry:1'])
})
test('lost response with complete immutable identity does not pull twice',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;throw failed('timeout')},async()=>({verified:true}));await prepareCache(f.args);assert.equal(calls,1)
})
test('denials, certificate errors, permanent missing manifests and identity errors are never retried',async()=>{
 for(const detail of ['403 Forbidden','401 unauthorized','x509 certificate error','manifest unknown','404 not found']){let calls=0;const f=fixture(async()=>{calls++;throw failed(detail)});await assert.rejects(prepareCache(f.args));assert.equal(calls,1)}
 let calls=0;const f=fixture(async()=>{calls++;throw failed('EOF')},async()=>{throw Object.assign(Error('identity'),{code:'IMAGE_IDENTITY_MISMATCH'})});await assert.rejects(prepareCache(f.args),{code:'IMAGE_IDENTITY_MISMATCH'});assert.equal(calls,1)
})
test('two transient failures stop and original phase deadline caps the command',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;throw failed('EOF')});await assert.rejects(prepareCache(f.args));assert.equal(calls,2)
 const g=fixture(async(_args,options)=>{assert.equal(options.timeout,1000);g.advance(1000);throw failed('timeout')});g.advance(899000);await assert.rejects(prepareCache(g.args));assert.equal(g.steps.length,1)
})
