import {createHash} from 'node:crypto'
import type {MemoryAPI,MemoryIdentity,MemoryScope,MemoryOptions} from '@lyyzka/lingxios'

const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
function fail(message:string):never{throw new Error(message)}
const scopeKey=(scope:MemoryScope)=>digest([scope.tenantId,scope.scopeType,scope.scopeId])
const scopeLimit=16
type IndexRow={scopeType:string;scopeSha256:string;key:string|null;eligible:number|null;indexed:number|null}
type IndexMemory=Pick<MemoryAPI,'scopes'|'doctor'|'reindex'>

/** Project only aggregate public index fields; never serialize a doctor result. */
export async function memoryIndexStatus(memory:IndexMemory,identity:MemoryIdentity,options:MemoryOptions['embeddings']) {
  if([identity.tenantId,identity.agentId,identity.principalId,identity.sessionId,identity.workId].some(value=>!value))fail('existing native memory identity required')
  const scopes=await memory.scopes(identity)
  if(scopes.length>scopeLimit||scopes.some(scope=>scope.tenantId!==identity.tenantId||!/^[a-z][a-z0-9_]{0,63}$/.test(scope.scopeType)||!scope.scopeId)
    ||new Set(scopes.map(scopeKey)).size!==scopes.length)fail('native memory scopes unavailable or ambiguous')
  let key:string|null=null
  const rows:IndexRow[]=[]
  for(const scope of scopes) {
    if(!options){rows.push({scopeType:scope.scopeType,scopeSha256:scopeKey(scope),key:null,eligible:null,indexed:null});continue}
    const index=(await memory.doctor(identity,scope)).index
    if(!index||!/^[a-f0-9]{64}$/.test(index.key)||(key!==null&&index.key!==key)||!Number.isSafeInteger(index.eligible)||!Number.isSafeInteger(index.indexed)
      ||index.eligible<0||index.indexed<0||index.indexed>index.eligible)fail('native memory index configuration or counts unavailable')
    key=index.key
    rows.push({scopeType:scope.scopeType,scopeSha256:scopeKey(scope),key:index.key,eligible:index.eligible,indexed:index.indexed})
  }
  const current=await memory.scopes(identity)
  if(current.length!==scopes.length||current.some(scope=>scope.tenantId!==identity.tenantId)
    ||JSON.stringify(current.map(scopeKey).sort())!==JSON.stringify(scopes.map(scopeKey).sort()))fail('native memory scope authorization changed during inspection')
  const eligible=rows.reduce((sum,row)=>sum+(row.eligible??0),0),indexed=rows.reduce((sum,row)=>sum+(row.indexed??0),0)
  if(!Number.isSafeInteger(eligible)||!Number.isSafeInteger(indexed))fail('native memory aggregate exceeds supported range')
  const configured=!!key&&rows.length>0
  const bindingSha256=digest([identity.tenantId,identity.agentId,identity.principalId,identity.sessionId,identity.workId])
  const planHash=digest({bindingSha256,model:options?.id??null,key,scopes:rows.map(({indexed:_indexed,...row})=>row).sort((a,b)=>a.scopeSha256.localeCompare(b.scopeSha256))})
  return {scopes,receipt:{format:'native-memory-index-status/v1',observedAt:new Date().toISOString(),bindingSha256,model:options?.id??null,key,
    coverageBasis:'current-key-and-version',globalCoverage:false,
    configured,scopeCount:rows.length,eligible:configured?eligible:null,indexed:configured?indexed:null,
    complete:configured&&rows.every(row=>row.eligible===row.indexed),scopes:rows,planHash}}
}

/** One finite enqueue pass. The native Worker owns guarded refresh and accounting. */
export async function enqueueMemoryIndex(memory:IndexMemory,identity:MemoryIdentity,status:Awaited<ReturnType<typeof memoryIndexStatus>>,
  expectedPlanHash:string,maxEligible:number,emit:(receipt:Record<string,unknown>)=>void) {
  const {receipt,scopes}=status
  if(!/^[a-f0-9]{64}$/.test(expectedPlanHash)||expectedPlanHash!==receipt.planHash||!receipt.configured||receipt.eligible===null
    ||!Number.isSafeInteger(maxEligible)||maxEligible<1||maxEligible>50000||receipt.eligible>maxEligible)fail('reviewed native memory index plan and finite eligible bound required')
  let queued=0
  for(const scope of scopes) {
    const scopeSha256=scopeKey(scope)
    emit({format:'native-memory-index-enqueue/v1',planHash:receipt.planHash,scopeSha256,status:'submitting'})
    try {
      const result=await memory.reindex(identity,scope)
      if(result.configured!==true||!Number.isSafeInteger(result.queued)||result.queued<0||result.queued>32)fail('native memory enqueue acknowledgement unavailable')
      queued+=result.queued
      emit({format:'native-memory-index-enqueue/v1',planHash:receipt.planHash,scopeSha256,status:'enqueued',queued:result.queued})
    } catch {
      emit({format:'native-memory-index-enqueue/v1',planHash:receipt.planHash,scopeSha256,status:'uncertain',noAutomaticRetry:true})
      fail('native memory enqueue stopped; resolve the recorded scope before another enqueue')
    }
  }
  return {format:'native-memory-index-reindex/v1',planHash:receipt.planHash,status:'enqueued',scopeCount:scopes.length,maxEligible,queued,
    complete:false,coverageComplete:false,observedAt:new Date().toISOString()}
}
