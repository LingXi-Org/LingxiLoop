import test from 'node:test'
import assert from 'node:assert/strict'
import {assertImageFailure,assertImageRecoveryInventory,restoreImageSource} from './host-release-image-recovery.mjs'
import {SAME54_FORMAT} from './public-text-release.mjs'
const apps=['lingxiloop-app-a','lingxiloop-app-b'],a='a'.repeat(40),b='b'.repeat(40),h='c'.repeat(64)
const plan={format:'product54-image-host-release/v1',planHash:h,source:{sha:a,image:{indexDigest:'sha256:'+h,configDigest:'sha256:'+h}},target:{sha:b,image:{indexDigest:'sha256:'+'d'.repeat(64),configDigest:'sha256:'+'d'.repeat(64)}}}
const original=apps.flatMap((stack,i)=>['lingxiloop','worker'].map((service,j)=>({stack,service,id:String(i*2+j+1).repeat(64),source:a,imageId:'sha256:'+h,running:true,pid:1,healthy:true,restarting:false,restartCount:0,policy:{configurationSha256:h}})))
plan.publicText={sourceContainers:original.map(({stack,service,id,imageId})=>({stack,service,id,imageId}))}
const failed=()=>({mode:plan.format,planHash:h,complete:false,events:[{phase:'preflight',status:'verified',original:structuredClone(original)},
 {phase:'service-action',action:'DeployStack',stack:apps[0],service:'lingxiloop'},
 {phase:'komodo',status:'submitting',operation:'DeployStack',stack:apps[0]},
 {phase:'komodo',status:'pending',operation:'DeployStack',stack:apps[0],updateId:'e'.repeat(24)},
 {phase:'komodo',status:'complete',operation:'DeployStack',stack:apps[0],updateId:'e'.repeat(24)},
 {phase:'rollout',status:'observed',stack:apps[0],service:'lingxiloop',containerId:'f'.repeat(64),imageId:plan.target.image.configDigest},
 {phase:'stopped',status:'failed',noAutomaticRetry:true}]})
test('known failed54 native operation binds only its attributed target service',()=>{
 const boundary=assertImageFailure(plan,failed());boundary.targetImages=Object.fromEntries(apps.map(s=>[s,plan.target.image.configDigest]));assert.equal(boundary.operations.length,1)
 assert.deepEqual([...boundary.deployments.keys()],[apps[0]+':lingxiloop'])
 const rows=structuredClone(original);Object.assign(rows[0],{id:'f'.repeat(64),source:b,imageId:plan.target.image.configDigest,healthy:false,restartCount:2,restarting:true})
 assert.doesNotThrow(()=>assertImageRecoveryInventory(rows,plan,boundary))
})
for(const [name,mutate] of [
 ['complete receipt',r=>r.complete=true],['recovery output',r=>r.mode='product54-source-restoration/v1'],
 ['uncertain operation',r=>r.events[4].status='uncertain'],['missing terminal',r=>r.events.splice(4,1)],
 ['missing update id',r=>delete r.events[3].updateId],['wrong plan',r=>r.planHash='0'.repeat(64)],
 ['unattributed deployment',r=>r.events.splice(1,1)],['migration',r=>r.events.splice(1,0,{phase:'migration'})],
 ['replaced original',r=>r.events[0].original[0].id='0'.repeat(64)],
])test(name+' prevents source restoration',()=>{const r=failed();mutate(r);assert.throws(()=>assertImageFailure(plan,r))})
test('known terminal failed deploy may be inspected but not replayed',()=>{
 const r=failed();r.events[4].status='failed';assert.equal(assertImageFailure(plan,r).operations[0].success,false)
})
test('same audited target image cannot substitute another container after recorded deployment',()=>{
 const boundary=assertImageFailure(plan,failed());boundary.targetImages=Object.fromEntries(apps.map(s=>[s,plan.target.image.configDigest]))
 const rows=structuredClone(original);Object.assign(rows[0],{source:b,id:'9'.repeat(64),imageId:plan.target.image.configDigest})
 assert.throws(()=>assertImageRecoveryInventory(rows,plan,boundary))
})
for(const [name,mutate] of [
 ['missing container',r=>r.pop()],['unattributed target',r=>Object.assign(r[1],{source:b,id:'f'.repeat(64),imageId:plan.target.image.configDigest})],
 ['changed source id',r=>r[0].id='f'.repeat(64)],['source restarted',r=>r[0].restartCount=1],
 ['target replaced after receipt',r=>Object.assign(r[0],{source:b,id:'9'.repeat(64),imageId:plan.target.image.configDigest})],
 ['changed full policy',r=>r[0].policy.configurationSha256='0'.repeat(64)],['wrong image',r=>r[0].imageId='sha256:'+'0'.repeat(64)],
])test(name+' prevents stopping any reader',()=>{const rows=structuredClone(original);mutate(rows);assert.throws(()=>assertImageRecoveryInventory(rows,plan,assertImageFailure(plan,failed())))})
test('recovery export exists only for the explicit same54 contract',()=>{assert.equal(SAME54_FORMAT,plan.format);assert.equal(typeof restoreImageSource,'function')})
