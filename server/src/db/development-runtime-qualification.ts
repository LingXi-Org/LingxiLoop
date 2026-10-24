import { releaseVersions } from '@lyyzka/lingxios'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Client, type Pool } from 'pg'
import { assertCurrentRuntimeProfile, PUBLIC_PURPOSE_SCHEMA_HASH } from './runtime-profile.js'

declare const developmentToken: unique symbol
export interface DevelopmentRuntimeQualification { readonly [developmentToken]: true }
export interface DevelopmentVerificationInput { verifierPath:string; inputsPath:string; inputsSha256:string }
interface Binding { pool:Pool; fingerprint:string; databaseName:string; productTree:string; runtime:string; inputs:DevelopmentVerificationInput }
const bindings=new WeakMap<DevelopmentRuntimeQualification,Binding>()
const migrationsUrl=new URL('./migrations/',import.meta.url).href

function requireTestMode():void {
  if(process.env.NODE_ENV!=='test')throw new Error('development qualification requires explicit test mode')
}

/** Inspect the actual Pool options, including pg connectionString overrides. */
export function developmentPoolFingerprint(database:Pool, databaseName:string):string {
  requireTestMode()
  const options=database.options
  if(typeof options.connectionString!=='string')throw new Error('development qualification requires an exact local Pool connectionString')
  const target=new URL(options.connectionString)
  if(!/^runtime342_dev_[a-f0-9]{12}_[a-f0-9]{12}_test$/.test(databaseName)
    ||target.protocol!=='postgres:'||target.hostname!=='127.0.0.1'||target.port!=='18438'
    ||target.pathname!=='/'+databaseName||target.search||target.hash
    ||options.host!==undefined||options.port!==undefined||options.database!==undefined
    ||Reflect.get(options,'stream')!==undefined||Reflect.get(options,'connection')!==undefined||Reflect.get(options,'Client')!==undefined
    ||Reflect.get(database,'Client')!==Client){
    throw new Error('development qualification requires the exact local test Pool without target overrides')
  }
  return createHash('sha256').update(JSON.stringify([options.connectionString,options.host,options.port,options.database])).digest('hex')
}

/** Explicit testing API; no environment flag or default startup path calls it. */
export async function createDevelopmentRuntimeQualification(database:Pool,input:DevelopmentVerificationInput):Promise<DevelopmentRuntimeQualification>{
  requireTestMode()
  if(database.totalCount!==0||database.waitingCount!==0)throw new Error('development proof requires a previously unused Pool')
  const { verifySealedDevelopmentInputs }=await import('../__integration__/_development-runtime-verifier.js')
  const verified=await verifySealedDevelopmentInputs(input,database)
  if(database.totalCount!==0||database.waitingCount!==0)throw new Error('development Pool connected before proof was established')
  assertCurrentRuntimeProfile(releaseVersions,PUBLIC_PURPOSE_SCHEMA_HASH,verified.runtime)
  const token=Object.freeze({}) as DevelopmentRuntimeQualification
  bindings.set(token,{pool:database,fingerprint:developmentPoolFingerprint(database,verified.databaseName),
    databaseName:verified.databaseName,productTree:verified.productTree,runtime:verified.runtime,inputs:Object.freeze({...input})})
  return token
}

/** Repeat the scope checks before any DB connection, including cache hits. */
export function assertDevelopmentQualification(token:DevelopmentRuntimeQualification,database:Pool,url:URL,full54:boolean):string {
  const binding=bindings.get(token)
  if(!binding)throw new Error('unverified development qualification token')
  requireTestMode()
  if(!full54||url.href!==migrationsUrl)throw new Error('development qualification requires the standard complete product54 migration set')
  if(database!==binding.pool||process.cwd()!==binding.productTree
    ||developmentPoolFingerprint(database,binding.databaseName)!==binding.fingerprint
    ||createHash('sha256').update(readFileSync(binding.inputs.inputsPath)).digest('hex')!==binding.inputs.inputsSha256){
    throw new Error('development qualification scope changed')
  }
  assertCurrentRuntimeProfile(releaseVersions,PUBLIC_PURPOSE_SCHEMA_HASH,binding.runtime)
  return binding.runtime
}
