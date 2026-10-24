import assert from 'node:assert/strict'
import { mock,test } from 'node:test'
import type { Queryable } from '../db/queryable.js'
import type { CaseCoverClaim } from '../modules/cases/cover-repository.js'

let admit:()=>Promise<CaseCoverClaim|null>
let release:()=>Promise<boolean>
let fail:()=>Promise<boolean>
mock.module('../modules/cases/cover-repository.js',{namedExports:{
  claimCaseCover:()=>admit(),releaseCaseCover:()=>release(),failCaseCover:()=>fail(),
  renewCaseCoverLease:async()=>true,completeCaseCover:async()=>{throw new Error('unexpected completion')},
}})
const {createCaseCoverWorker}=await import('../modules/cases/cover-worker.js')
const db:Queryable={query:async()=>{throw new Error('unexpected database query')}}
const claim:CaseCoverClaim={id:'job',company_id:'company',case_id:'case',fingerprint:'fingerprint',generation:1,
  requested_by:'teacher',rules_version:'fixture',snapshot:{title:'Router',summary:'',category:'',tags:[],content:'Networks'},attempts:1,lease_token:'lease'}
function deferred<T>() {
  let resolve!:(value:T)=>void
  const promise=new Promise<T>(done=>{resolve=done})
  return {promise,resolve}
}

test('shutdown during admission releases the returned claim without starting generation',{timeout:5000},async()=>{
  const entered=deferred<void>(),admitted=deferred<CaseCoverClaim|null>(),released=deferred<void>()
  admit=async()=>{entered.resolve();return admitted.promise}
  let releases=0,generated=0
  release=async()=>{releases++;released.resolve();return true}
  fail=async()=>{throw new Error('unstarted job must be released without consuming an attempt')}
  const worker=createCaseCoverWorker({db,transaction:work=>work(db),enabled:()=>true,
    generate:async()=>{generated++;throw new Error('generation after shutdown')}})
  const handle=worker.start()!
  await entered.promise
  handle.stop()
  admitted.resolve(claim)
  await released.promise
  await new Promise<void>(resolve=>setImmediate(resolve))
  assert.equal(generated,0)
  assert.equal(releases,1)
  assert.equal(await worker.runOnce(),false)
})

test('shutdown aborts an already running generator and records only its fenced failure',{timeout:5000},async()=>{
  const entered=deferred<AbortSignal>(),failed=deferred<void>()
  admit=async()=>claim
  release=async()=>{throw new Error('active generation consumed its attempt')}
  fail=async()=>{failed.resolve();return true}
  const worker=createCaseCoverWorker({db,transaction:work=>work(db),enabled:()=>true,
    generate:async input=>{entered.resolve(input.signal);return new Promise(()=>{})}})
  const handle=worker.start()!
  const signal=await entered.promise
  handle.stop()
  await failed.promise
  assert.equal(signal.aborted,true)
  assert.equal(await worker.runOnce(),false)
})
