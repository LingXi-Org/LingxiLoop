import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { releaseVersions } from '@lyyzka/lingxios'
import type { Pool } from 'pg'
import { developmentPoolFingerprint, type DevelopmentVerificationInput } from '../db/development-runtime-qualification.js'

// Reviewed offline-only verifier code, not a candidate-specific runtime hash.
// An arbitrary callback, success JSON or replacement executable is not proof.
const VERIFIER_SHA256='cfe960d8a58f1db51268546266f8cd03e816bab64d250d3c6aa6363d06785e8d'
const execute=promisify(execFile)
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex')

export async function verifySealedDevelopmentInputs(input:DevelopmentVerificationInput,database:Pool){
  if(process.env.NODE_ENV!=='test')throw new Error('development qualification requires explicit test mode')
  const verifier=await readFile(input.verifierPath)
  if(hash(verifier)!==VERIFIER_SHA256)throw new Error('sealed offline verifier code is required')
  const raw=await readFile(input.inputsPath)
  if(!/^[a-f0-9]{64}$/.test(input.inputsSha256)||hash(raw)!==input.inputsSha256)throw new Error('sealed development inputs changed')
  const value=JSON.parse(raw.toString('utf8')) as Record<string,unknown>
  const root=await realpath(fileURLToPath(new URL('../../../',import.meta.url)))
  if(value.qualificationType!=='development'||value.published!==false||value.releaseEligible!==false
    ||typeof value.runtimeSourceSha!=='string'||!/^[a-f0-9]{40}$/.test(value.runtimeSourceSha)
    ||typeof value.productSha!=='string'||!/^[a-f0-9]{40}$/.test(value.productSha)
    ||value.productTree!==root||process.cwd()!==root||value.runtimeVersion!==releaseVersions.runtime){
    throw new Error('development proof must bind this exact unpublished package and product tree')
  }
  const databaseName='runtime342_dev_'+value.runtimeSourceSha.slice(0,12)+'_'+value.productSha.slice(0,12)+'_test'
  developmentPoolFingerprint(database,databaseName)
  const head=await execute('git',['rev-parse','HEAD'],{cwd:root})
  if(head.stdout.trim()!==value.productSha)throw new Error('development product commit changed')
  // No provider or database call: the pinned verifier reads source/package bytes
  // and resolves both public ESM entrypoints. Failed/partial audits cannot mint.
  const result=await execute('python',['-c',verifier.toString('utf8'),input.inputsPath],{cwd:root,maxBuffer:1024*1024,timeout:60000})
  const audit=JSON.parse(result.stdout) as Record<string,unknown>
  for(const key of ['qualificationType','published','releaseEligible','productSha','runtimeSourceSha','runtimeVersion','packageSha256','packageIntegrity']){
    if(audit[key]!==value[key])throw new Error('sealed development audit identity differs')
  }
  if(!Number.isSafeInteger(audit.filesVerified)||Number(audit.filesVerified)<1
    ||hash(await readFile(input.verifierPath))!==VERIFIER_SHA256||hash(await readFile(input.inputsPath))!==input.inputsSha256){
    throw new Error('sealed development audit changed or incomplete')
  }
  return {databaseName,productTree:root,runtime:releaseVersions.runtime}
}
