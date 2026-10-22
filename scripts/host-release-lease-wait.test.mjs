// Failure modes before implementation: leases survive process exit; leases never
// expire; visibility/counts/prepared state is invalid; read outcome is uncertain.
// Only natural expiry may be observed, with finite waits and no mutation retries.
import test from 'node:test'
import assert from 'node:assert/strict'
import {waitForWorkerLeaseExpiry} from './host-release-lease-wait.mjs'
const empty={readOnly:true,fullVisibility:true,liveWork:0,liveSession:0,liveAttempts:0,liveCapture:0,liveOutbox:0,prepared:0}
function fixture(states){let time=0,reads=0;const waits=[],events=[];return {waits,events,get reads(){return reads},run:()=>waitForWorkerLeaseExpiry({read:async()=>{const s=states[Math.min(reads++,states.length-1)];if(s instanceof Error)throw s;return s},wait:async ms=>{waits.push(ms);time+=ms},now:()=>time,onProgress:async e=>events.push(e)})}}
test('already empty adds neither delay nor extra read',async()=>{const f=fixture([empty]);assert.deepEqual(await f.run(),empty);assert.equal(f.reads,1);assert.deepEqual(f.waits,[])})
test('observes natural expiry and records counts without changing them',async()=>{const live={...empty,liveWork:1,liveSession:1,liveAttempts:1},f=fixture([live,empty]);await f.run();assert.equal(live.liveWork,1);assert.deepEqual(f.waits,[5000]);assert.equal(f.events.length,1)})
test('permanently live leases stop after at most150s and31 observations',async()=>{const f=fixture([{...empty,liveWork:1}]);await assert.rejects(f.run(),/deadline/);assert.equal(f.reads,31);assert.equal(f.waits.reduce((a,b)=>a+b,0),150000)})
for(const patch of [{prepared:1},{readOnly:false},{fullVisibility:false},{liveWork:-1},{liveAttempts:null},{liveOutbox:NaN}])test('invalid barrier does not wait: '+JSON.stringify(patch),async()=>{const f=fixture([{...empty,...patch}]);await assert.rejects(f.run());assert.equal(f.reads,1);assert.deepEqual(f.waits,[])})
test('uncertain read is propagated without another read or wait',async()=>{const error=Object.assign(Error('uncertain'),{uncertain:true}),f=fixture([error]);await assert.rejects(f.run(),e=>e===error);assert.equal(f.reads,1);assert.deepEqual(f.waits,[])})
