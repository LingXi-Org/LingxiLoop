import test from 'node:test'
import assert from 'node:assert/strict'
import {runRelease} from './run.mjs'
const manifest={releaseId:'fixed-release',appSha:'a'.repeat(40),opsSha:'b'.repeat(40),checks:{commit:'a'.repeat(40),conclusion:'success'}}
const record=status=>({releaseId:manifest.releaseId,appSha:manifest.appSha,opsSha:manifest.opsSha,status,workflowId:'fixed-workflow'})
const missing=()=>{throw Object.assign(Error('missing'),{status:404})}
test('one invocation submits once and observes automatic recovery without an administrator mutation',async()=>{
  for(const outcome of ['accepted','recovered']){
    const calls=[];let current=null,clock=0,saved
    const result=await runRelease({manifest},{now:()=>clock,wait:async ms=>{clock+=ms},save:r=>saved=structuredClone(r),call:async method=>{
      calls.push(method);if(method==='get'){if(!current)return missing();current=record(outcome);return current}if(method==='plan')return{};if(method==='submit')return current=record('active');throw Error('unexpected')
    }})
    assert.equal(result.status,outcome);assert.equal(calls.filter(x=>x==='submit').length,1);assert.equal(calls.some(x=>['resume','recover'].includes(x)),false);assert.equal(saved.status,outcome)
  }
})
test('lost submit reply and process restart read back the same release without repeating a successful write',async()=>{
  let current=null,writes=0,saved,clock=0
  const deps={now:()=>clock,wait:async ms=>{clock+=ms},save:r=>saved=structuredClone(r),call:async method=>{
    if(method==='get')return current??missing();if(method==='plan')return{};if(method==='submit'){writes++;current=record('accepted');throw Error('lost private response')}
  }}
  assert.equal((await runRelease({manifest},deps)).status,'accepted')
  assert.equal((await runRelease({manifest,previous:saved},deps)).status,'accepted');assert.equal(writes,1)
  assert.equal(JSON.stringify(saved).includes('private'),false)
})
test('preflight refusal, missing permission and expired persistent deadline never write',async()=>{
  let writes=0
  const call=async method=>{if(['submit','resume','recover'].includes(method))writes++;throw Object.assign(Error('denied'),{status:403,code:'UNAUTHORIZED'})}
  const denied=await runRelease({manifest},{call});assert.equal(denied.error,'UNAUTHORIZED');assert.equal(writes,0)
  const snapshot=[];await runRelease({manifest,budgetMs:1},{call,now:()=>0,save:r=>snapshot.push(structuredClone(r))})
  const result=await runRelease({manifest,previous:snapshot.at(-1)},{call,now:()=>2});assert.equal(result.error,'RUN_DEADLINE_EXCEEDED');assert.equal(writes,0)
})
test('one command stops observing a pending release at its budget and does not claim production failure or success',async()=>{
  let clock=0
  const result=await runRelease({manifest,budgetMs:10},{now:()=>clock,wait:async ms=>{clock+=ms},call:async()=>record('active')})
  assert.equal(result.status,'unverified');assert.equal(result.error,'RUN_DEADLINE_EXCEEDED');assert.equal(result.controller.status,'active');assert.equal(clock,10)
})
test('uncertain admin response is never replayed without a changed durable Workflow identity',async()=>{
  let writes=0,saved
  const deps={save:r=>saved=structuredClone(r),call:async method=>{if(method==='get')return record('blocked');writes++;throw Error('lost')}}
  assert.equal((await runRelease({manifest,mode:'recover'},deps)).error,'ADMIN_COMMAND_OUTCOME_UNKNOWN')
  assert.equal((await runRelease({manifest,mode:'recover',previous:saved},deps)).error,'ADMIN_COMMAND_OUTCOME_UNKNOWN');assert.equal(writes,1)
})
test('resume observes the new Workflow initialization instead of returning its stale blocked status',async()=>{
 let clock=0,writes=0,reads=0,saved
 const before={...record('blocked'),workflowId:'old'}
 const after={...record('blocked'),workflowId:'new'}
 const deps={now:()=>clock,wait:async ms=>{clock+=ms},save:r=>saved=structuredClone(r),call:async method=>{
  if(method==='get')return ++reads===1?before:reads===2?after:{...record('accepted'),workflowId:'new'}
  if(method==='resume'){writes++;return after}throw Error('unexpected')
 }}
 const result=await runRelease({manifest,mode:'resume'},deps)
 assert.equal(result.status,'accepted');assert.equal(writes,1);assert.equal(saved.commandObservationDeadline,30000)
})
test('resume initialization wait is bounded and process restart preserves its deadline',async()=>{
 let clock=0,writes=0,saved,current={...record('blocked'),workflowId:'old'}
 const deps={now:()=>clock,wait:async ms=>{clock+=ms},save:r=>saved=structuredClone(r),call:async method=>{
  if(method==='get')return current
  if(method==='resume'){writes++;return current={...current,workflowId:'new'}}throw Error('unexpected')
 }}
 const result=await runRelease({manifest,mode:'resume'},deps)
 assert.equal(result.status,'blocked');assert.equal(clock,30000);assert.equal(writes,1)
 await runRelease({manifest,mode:'resume',previous:saved},deps)
 assert.equal(clock,30000);assert.equal(writes,1)
})
