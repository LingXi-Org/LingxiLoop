// Immutable SDK12 -> SDK14 product57 provenance-only CAS. No executable paths or SQL in this input.
import {createHash} from 'node:crypto'
import {canonical,fault} from './journal.mjs'
const keys=(value,expected)=>value&&typeof value==='object'&&!Array.isArray(value)&&canonical(Object.keys(value).sort())===canonical([...expected].sort())
const fields=['runtime','schema','protocol','schemaHash','productVersion','migrations']
const validDescriptor=(d,runtime,extra=[])=>keys(d,[...fields,...extra])&&d.runtime===runtime&&d.schema===14&&d.protocol===11&&d.productVersion===57&&/^[a-f0-9]{64}$/.test(d.schemaHash??'')&&Array.isArray(d.migrations)&&d.migrations.length===57&&d.migrations.every((m,i)=>keys(m,['version','name','checksum'])&&m.version===i+1&&/^[a-z0-9_]+$/.test(m.name??'')&&m.name.length<=128&&/^[a-f0-9]{64}$/.test(m.checksum??''))
export function validateRuntimePatch(database){
 const patch=database.runtimePatch
 if(patch===undefined)return undefined
 if(!keys(patch,['source','target'])||!validDescriptor(patch.source,'3.8.12')||!validDescriptor(patch.target,'3.8.14',['integrity','tarball'])||patch.source.schemaHash!==patch.target.schemaHash||canonical(patch.source.migrations)!==canonical(patch.target.migrations)||!/^sha512-[A-Za-z0-9+/]{86}==$/.test(patch.target.integrity??'')||!/^https:\/\/npm\.pkg\.github\.com\/download\/@lyyzka\/lingxios\/3\.8\.14\/[a-f0-9]{40}$/.test(patch.target.tarball??'')||[database.from,database.to].some(d=>d?.nativeSchema!==14||d?.productSchema!==57)||canonical(database.migrations)!==canonical(patch.target.migrations)||Buffer.byteLength(JSON.stringify(patch))>65536)throw fault('INVALID_RUNTIME_PATCH','Runtime patch requires exact SDK12 to SDK14 native14/protocol11/product57 provenance and unchanged complete named ledger',422)
 return patch
}
export function runtimePatchPlanHash(patch){
 const descriptor=d=>({runtime:d.runtime,schema:d.schema,protocol:d.protocol,schemaHash:d.schemaHash,productVersion:d.productVersion,migrations:d.migrations.map(({version,name,checksum})=>({version,name,checksum}))})
 return 'sha256:'+createHash('sha256').update(JSON.stringify({source:descriptor(patch.source),target:{...descriptor(patch.target),integrity:patch.target.integrity,tarball:patch.target.tarball}})).digest('hex')
}
export function assertRuntimePatchResult(result,patch,action){
 const fields=['action','source','target','schema','product','planHash','complete',...(action==='apply'?['updated']:['state','observationOnly'])]
 if(!keys(result,fields)||result.action!==action||result.source!==patch.source.runtime||result.target!==patch.target.runtime||result.schema!==14||result.product!==57||result.planHash!==runtimePatchPlanHash(patch)||(action==='apply'?(result.complete!==true||result.updated!==1):(result.observationOnly!==true||!['source','target'].includes(result.state)||result.complete!==(result.state==='target'))))throw Object.assign(fault('RUNTIME_PATCH_OUTCOME_UNRESOLVED','Fixed runtime patch response does not prove the exact immutable provenance postcondition'),{uncertain:true})
 return result
}
