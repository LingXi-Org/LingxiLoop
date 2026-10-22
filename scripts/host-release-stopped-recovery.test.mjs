// Failure cases recorded before implementation: wrong plan, incomplete stops,
// unresolved update, any migration submission, replaced/running old container,
// changed DB/host configuration/image/metadata, and still-live leases must stop.
// A known stopped boundary may continue once, without replaying stage or stop.
import test from 'node:test'
import assert from 'node:assert/strict'
import {assertStoppedReceipt,assertStoppedContainers,assertRecoveryConfig} from './host-release-stopped-recovery.mjs'
import {hash} from './host-release.mjs'
const apps=['lingxiloop-app-a','lingxiloop-app-b'],plan={format:'conversation-repair-provenance-host-release/v1',planHash:'a'.repeat(64),source:{sha:'b'.repeat(40)}}
const original=apps.flatMap((stack,i)=>['lingxiloop','worker'].map((service,j)=>({stack,service,id:String(i*2+j+1).repeat(64),source:plan.source.sha,imageId:'sha256:'+'c'.repeat(64),running:true,pid:12,restarting:false,restartCount:0,policy:{readOnly:service==='worker'}})))
const receipt=()=>({planHash:plan.planHash,mode:plan.format,complete:false,events:[{phase:'preflight',status:'verified',original},...apps.map(stack=>({phase:'host-config',status:'verified',stack,fullConfigReadback:true})),{phase:'komodo',status:'submitting',operation:'StopStack',stack:apps[0]},{phase:'komodo',status:'pending',operation:'StopStack',stack:apps[0],updateId:'d'.repeat(24)},{phase:'komodo',status:'complete',operation:'StopStack',stack:apps[0],updateId:'d'.repeat(24)},...original.map(({stack,service})=>({phase:'drain',status:'stopped',stack,service})),{phase:'stopped',status:'failed',recovery:'source-unchanged-recovery-requires-review',noAutomaticRetry:true}]})
test('accepts only the known completely stopped pre-migration boundary',()=>assert.deepEqual(assertStoppedReceipt(plan,receipt()),original))
for(const [name,change] of [
 ['wrong plan',r=>r.planHash='e'.repeat(64)],
 ['missing stop',r=>r.events=r.events.filter(e=>!(e.phase==='drain'&&e.stack===apps[1]&&e.service==='worker'))],
 ['unresolved update',r=>r.events=r.events.filter(e=>!(e.phase==='komodo'&&e.status==='complete'))],
 ['uncertain outcome',r=>r.events.splice(-1,0,{phase:'komodo',status:'uncertain'})],
 ['migration submitted',r=>r.events.splice(-1,0,{phase:'migration',status:'submitting'})],
 ['deployment submitted',r=>r.events.splice(-1,0,{phase:'komodo',status:'submitting',operation:'DeployStack'})],
 ['unverified target config',r=>r.events=r.events.filter(e=>!(e.phase==='host-config'&&e.stack===apps[1]))],
])test(name+' rejected',()=>{const r=receipt();change(r);assert.throws(()=>assertStoppedReceipt(plan,r))})
const stopped=()=>original.map(r=>({...r,running:false,pid:0,healthy:false}))
test('accepts exactly the four original stopped containers',()=>assert.doesNotThrow(()=>assertStoppedContainers(stopped(),original)))
for(const [name,change] of [
 ['replaced container',r=>r[0].id='f'.repeat(64)],['running old writer',r=>r[0].running=true],
 ['security policy changed',r=>r[0].policy={readOnly:true}],['missing container',r=>r.pop()],
 ['old writer restarted',r=>r[0].restartCount=1],['different image',r=>r[0].imageId='sha256:'+'f'.repeat(64)],
])test(name+' rejected',()=>{const r=stopped();change(r);assert.throws(()=>assertStoppedContainers(r,original))})
test('full current configuration must reproduce the accepted source hash after only the reviewed four-field change',()=>{
 const old={commit:'old',branch:'release/source',environment:'synthetic-secret',auto_pull:true,extra_args:[],other:'fixed'}
 const row={stack:apps[0],source:{commit:old.commit,branch:old.branch,autoPull:true,extraArgs:[]}}
 const proof={id:'a'.repeat(24),configSha256:hash(JSON.stringify(old))},current={_id:{$oid:proof.id},config:{...old,commit:'new',branch:'release/target',auto_pull:false,extra_args:['--no-deps','--pull','never']}}
 assert.doesNotThrow(()=>assertRecoveryConfig(current,row,proof))
 current.config.environment='changed';assert.throws(()=>assertRecoveryConfig(current,row,proof))
 current.config=old;current._id.$oid='b'.repeat(24);assert.throws(()=>assertRecoveryConfig(current,row,proof))
})
