// Fixed product57 maintenance entrypoint. No dotenv, migrations, DDL or product imports.
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {applyPublishedRuntimePatch,assertRuntimePatchDescriptors,observePublishedRuntimePatch,runtimePatchPlanHash} from './db/runtime-patch.js'
import type {PublishedRuntimePatchDescriptor,RuntimePatchDescriptor} from './db/runtime-patch.js'

const MAX_INPUT=64*1024
const check=(ok:unknown):void=>{if(!ok)throw Error('RUNTIME_PATCH_INPUT_INVALID')}
export function parseRuntimePatchInput(raw:string):{source:RuntimePatchDescriptor;target:PublishedRuntimePatchDescriptor}{
 check(Buffer.byteLength(raw)<=MAX_INPUT)
 const value=JSON.parse(raw) as {source:RuntimePatchDescriptor;target:PublishedRuntimePatchDescriptor}
 check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')==='source,target')
 for(const [name,d] of Object.entries(value)){
  const keys=['runtime','schema','protocol','schemaHash','productVersion','migrations',...(name==='target'?['integrity','tarball']:[])].sort()
  check(d&&typeof d==='object'&&Object.keys(d).sort().join(',')===keys.join(',')&&d.productVersion===57&&Array.isArray(d.migrations))
  for(const m of d.migrations)check(m&&Object.keys(m).sort().join(',')==='checksum,name,version')
 }
 assertRuntimePatchDescriptors(value.source,value.target)
 check(/^sha512-[A-Za-z0-9+/]{86}==$/.test(value.target.integrity)&&
  /^https:\/\/npm\.pkg\.github\.com\/download\/@lyyzka\/lingxios\/3\.8\.13\/[a-f0-9]{40}$/.test(value.target.tarball))
 return value
}
async function main(){
 const [action,...extra]=process.argv.slice(2)
 check((action==='apply'||action==='observe')&&extra.length===0)
 let raw='',bytes=0
 for await(const chunk of process.stdin){bytes+=Buffer.byteLength(chunk);check(bytes<=MAX_INPUT);raw+=chunk.toString()}
 const {source,target}=parseRuntimePatchInput(raw)
 check(action!=='apply'||process.env.LINGXIOS_SCHEMA_UPGRADE_DRAINED==='true')
 const connection=process.env.DATABASE_URL
 check(connection&&['postgres:','postgresql:'].includes(new URL(connection).protocol))
 const {Pool}=await import('pg')
 const database=new Pool({connectionString:connection,max:1,application_name:'lingxi-release-runtime-patch57',connectionTimeoutMillis:5000,idleTimeoutMillis:1000})
 let result,failure:unknown,failed=false
 try{
  result=action==='observe'?await observePublishedRuntimePatch(database,source,target):
   {complete:true,...await applyPublishedRuntimePatch(database,source,target),planHash:runtimePatchPlanHash(source,target)}
 }catch(error){failed=true;failure=error}
 try{await database.end()}catch{failed=true;failure=Object.assign(Error('Runtime patch connection close unconfirmed'),{uncertain:action==='apply'})}
 if(failed)throw failure
 process.stdout.write(JSON.stringify({action,...result})+'\n')
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)void main().catch((error:unknown)=>{
 const uncertain=(error as {uncertain?:boolean})?.uncertain===true
 process.stdout.write(JSON.stringify({error:{code:uncertain?'RUNTIME_PATCH_COMMIT_UNCONFIRMED':'RUNTIME_PATCH_REFUSED',
  uncertain,outcomeKnown:!uncertain,observationRequired:uncertain}})+'\n')
 process.exitCode=1
})
