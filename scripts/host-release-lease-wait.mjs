// Read-only natural expiry after all original writers stopped. Never edits a
// lease or retries a production mutation. Caller's read rechecks identities/DB.
const counters=['liveWork','liveSession','liveAttempts','liveCapture','liveOutbox']
export async function waitForWorkerLeaseExpiry({read,wait,onProgress=async()=>{},now=Date.now}){
 const deadline=now()+150000
 for(let observation=0;observation<=30;observation++){
  const state=await read()
  if(state?.readOnly!==true||state.fullVisibility!==true||state.prepared!==0||!counters.every(k=>Number.isSafeInteger(state[k])&&state[k]>=0))throw Error('Invalid visible lease barrier')
  if(counters.every(k=>state[k]===0))return state
  if(observation===30||now()>=deadline)throw Error('Worker lease expiry deadline exceeded')
  await onProgress({phase:'drain',status:'waiting-for-lease-expiry',observation:observation+1,leases:Object.fromEntries(counters.map(k=>[k,state[k]]))})
  const remaining=deadline-now();if(remaining<=0)throw Error('Worker lease expiry deadline exceeded')
  await wait(Math.min(5000,remaining))
 }
 throw Error('Worker lease expiry deadline exceeded')
}
