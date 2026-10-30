import { releaseVersions } from '@lyyzka/lingxios'
import { readFile } from 'node:fs/promises'

// Published3.6 native14 bytes are unchanged by the reviewed3.7 reader,3.8 trace and3.8.2 repair releases.
export const PUBLIC_PURPOSE_SCHEMA_HASH = 'c56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f'
interface RuntimeVersions { runtime:string; schema:number; controlPlane:number; publicText?:number; runTrace?:number }
interface PackageFile {
  dependencies?:Record<string,string>
  packages?:Record<string,{dependencies?:Record<string,string>;version?:string;integrity?:string;resolved?:string}>
}

/** Read-only proof, shared by startup, empty initialization and the explicit CAS. */
export function assertLockedRuntimePackage(files:PackageFile[],runtime:string=releaseVersions.runtime){
  const [lock,serverLock,manifest,serverManifest]=files,key='@lyyzka/lingxios'
  const p=lock?.packages?.['node_modules/'+key],s=serverLock?.packages?.['node_modules/'+key]
  if(![manifest,serverManifest,lock?.packages?.[''],serverLock?.packages?.['']].every(v=>v?.dependencies?.[key]===runtime)
    ||p?.version!==runtime||s?.version!==runtime||p.integrity!==s.integrity||p.resolved!==s.resolved
    ||!/^sha512-[\w+/]+={0,2}$/.test(p.integrity??'')
    ||!p.resolved?.startsWith(`https://npm.pkg.github.com/download/${key}/${runtime}/`)){
    throw new Error('exact formal runtime package and matching root/server manifests/locks required')
  }
  return {runtime,integrity:p.integrity!,tarball:p.resolved}
}
export async function loadLockedRuntimePackage(){
  const files=await Promise.all(['../../../package-lock.json','../../package-lock.json','../../../package.json','../../package.json']
    .map(async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8')) as PackageFile))
  return assertLockedRuntimePackage(files)
}
export function assertFull54InstallBoundary(appliedCount:number,runtime:string=releaseVersions.runtime,targetProductVersion:54|55|56|57|58|59=54):void{
  const completeProduct=appliedCount>=54&&appliedCount<=targetProductVersion
  if(runtime!=='3.8.2'&&appliedCount!==0&&!completeProduct){
    throw new Error('partial product history requires its exact historical package before the separate runtime patch CAS')
  }
}

/** Full54 current execution uses the exact installed/locked package, not a historical migration version. */
export function currentPublicTextVersion(runtime:string):2|3 {
  const patch=/^3\.8\.(0|[1-9]\d*)$/.exec(runtime)
  if(!patch||!Number.isSafeInteger(Number(patch[1]))||Number(patch[1])<2)throw new Error('full54 requires the reviewed3.8 runtime patch family')
  return Number(patch[1])>=7?3:2
}
export function assertCurrentRuntimeProfile(versions:RuntimeVersions=releaseVersions,schemaHash?:string,lockedRuntime:string=releaseVersions.runtime):void {
  if(versions.runtime!==lockedRuntime||versions.schema!==14||versions.controlPlane!==11
    ||versions.publicText!==currentPublicTextVersion(versions.runtime)||versions.runTrace!==1||schemaHash!==PUBLIC_PURPOSE_SCHEMA_HASH){
    throw new Error('full54 requires the exact current formal package with unchanged native14/protocol11/runTrace1 and matching publicText capability')
  }
}

export function assertMigrationRuntime(delivery:boolean,purposeReader:boolean,
  versions:RuntimeVersions=releaseVersions,schemaHash?:string,runTrace=false,conversationRepair=false):void {
  if(conversationRepair){
    if(!delivery||!purposeReader||!runTrace||versions.runtime!=='3.8.2'||versions.schema!==14||versions.controlPlane!==11
      ||versions.publicText!==2||versions.runTrace!==1||schemaHash!==PUBLIC_PURPOSE_SCHEMA_HASH){
      throw new Error('0053 requires the formally published LingxiOS 3.8.2/schema14/publicText2/runTrace1 package and unchanged native schema')
    }
  }else if(runTrace){
    if(!delivery||!purposeReader||versions.runtime!=='3.8.0'||versions.schema!==14||versions.controlPlane!==11
      ||versions.publicText!==2||versions.runTrace!==1||schemaHash!==PUBLIC_PURPOSE_SCHEMA_HASH){
      throw new Error('0052 requires the formally published LingxiOS 3.8.0/schema14/publicText2/runTrace1 package and unchanged native schema')
    }
  }else if(purposeReader){
    if(!delivery||versions.runtime!=='3.7.0'||versions.schema!==14||versions.controlPlane!==11
      ||versions.publicText!==2||schemaHash!==PUBLIC_PURPOSE_SCHEMA_HASH){
      throw new Error('0051 requires the formally published LingxiOS 3.7.0/schema14/publicText2 package and unchanged native schema')
    }
  }else if(delivery&&(versions.runtime!=='3.6.0'||versions.schema!==14)){
    throw new Error('0050 requires the formally published LingxiOS 3.6.0/schema14 package')
  }
}
