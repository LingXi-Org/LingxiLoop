#!/usr/bin/env node
// Fixed, independent, read-only database evidence and readiness helper. Never accepts a command or SQL from stdin.
import { readFile } from 'node:fs/promises'
import {networkInterfaces} from 'node:os'
import {isIP} from 'node:net'
import {inspectQualifiedImage} from './image-identity.mjs'
import { DatabaseSync } from 'node:sqlite'
import { isAbsolute,join,resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runDocker, validateContract } from './adapter.mjs'
import { hash, fault } from './journal.mjs'

import { STATE_SQL } from './pg-client.mjs'
export { STATE_SQL } from './pg-client.mjs'

export function qualifyDatabaseEvidence(actual, database) {
  const profile = database.profiles?.[`${actual.nativeSchema}:${actual.productSchema}:${actual.schemaHash}`]
  if (!profile || actual.readOnly !== true || actual.fullVisibility !== true || actual.nativeSchema !== actual.installedSchema ||
    actual.productSchema !== actual.migrationCount || hash(actual.migrations) !== profile.migrationsHash || String(actual.protocolVersion) !== String(profile.protocolVersion)) {
    throw fault('DATABASE_PROVENANCE_UNQUALIFIED','Installed database schema, migration checksums or capability policy do not match a qualified local profile')
  }
  validateContract(profile.contract)
  if (!Array.isArray(profile.requiredCapabilities) || profile.contract.nativeSchema !== actual.nativeSchema || profile.contract.productSchema !== actual.productSchema) throw fault('DATABASE_PROVENANCE_UNQUALIFIED','Database capability profile has inconsistent schemas')
  return { ...actual, ...profile.contract, migrations:actual.migrations, requiredCapabilities:profile.requiredCapabilities, verified:true }
}
export async function databaseEvidence(policy, run = (args,options = {}) => runDocker(args,{ ...options,binary:policy.dockerBinary ?? '/usr/bin/docker' })) {
  const database = policy.database
  if (!database) throw fault('DATABASE_NOT_CONFIGURED','Trusted local PostgreSQL identity and qualified profiles are required')
  let raw
  if (database.transport === 'cached-client') {
    if (!/^sha256:[a-f0-9]{64}$/.test(database.clientImage??'') || !isAbsolute(database.envFile??'') || (database.clientWorkdir??'/app') !== '/app') throw fault('DATABASE_CLIENT_POLICY_INVALID','Cached observer requires an exact inspected local image ID, fixed /app workdir and trusted environment file')
    const configuredScript=policy.clientScript??'/opt/lingxi-release/current/scripts/release-host/pg-client.mjs'
    const script=resolve(configuredScript)
    if (!isAbsolute(configuredScript) || script.includes(',')) throw fault('DATABASE_CLIENT_POLICY_INVALID','Observer source must be a fixed trusted local file')
    const images=JSON.parse(await run(['image','inspect',database.clientImage]))
    if (images.length!==1 || images[0].Id!==database.clientImage || images[0].Os!=='linux' || !['amd64','arm64'].includes(images[0].Architecture)) throw fault('DATABASE_CLIENT_IMAGE_MISMATCH','Cached observer image does not match its exact local platform identity')
    try {
      raw=await run(['run','--rm','--pull','never','--network','host','--read-only','--cap-drop','ALL','--pids-limit','32','--memory','128m','--security-opt','no-new-privileges','--workdir','/app','--env-file',database.envFile,'--mount',`type=bind,source=${script},target=/opt/release/pg-client.mjs,readonly`,'--entrypoint','node',database.clientImage,'/opt/release/pg-client.mjs'],{timeout:30000})
    } catch(error) {
      let output
      try {if((error.cause?.stdout?.length??0)<=1024*1024)output=JSON.parse(error.cause?.stdout??'')} catch {}
      if(output?.error?.code==='PG_CLIENT_FAILED')throw Object.assign(fault('PG_CLIENT_FAILED','Fixed read-only database observer failed',502),...(/^[A-Z0-9]{5}$/.test(output.error.sqlState??'')?[{sqlState:output.error.sqlState}]:[]))
      throw error
    }
  } else {
    if (database.transport && database.transport!=='local-container' || ![database.container,database.user,database.database].every(value=>/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(value??''))) throw fault('DATABASE_NOT_CONFIGURED','Trusted local PostgreSQL identity and qualified profiles are required')
    raw=await run(['exec','--user','postgres',database.container,'psql','--no-psqlrc','--quiet','--tuples-only','--no-align','--username',database.user,'--dbname',database.database,'--set','ON_ERROR_STOP=1','--set','VERBOSITY=sqlstate','--command',STATE_SQL])
  }

  return qualifyDatabaseEvidence(JSON.parse(raw.trim()),database)
}
export function assertLocalReadinessUrl(url,interfaces=networkInterfaces()) {
  if(url.protocol==='https:')return
  const address=url.hostname.replace(/^\[|\]$/g,'')
  const owned=Object.values(interfaces).flat().some(row=>row?.address===address)
  if(url.protocol!=='http:'||!isIP(address)||!(['127.0.0.1','::1'].includes(address)||owned))throw fault('INVALID_POLICY','Readiness requires HTTPS or an HTTP literal address proved to belong to this host')
}
export async function localControl(policy, action, op, { run = (args,options={})=>runDocker(args,{...options,binary:policy.dockerBinary??'/usr/bin/docker'}), fetcher = fetch,interfaces=networkInterfaces } = {}) {
  const local = policy.targets?.[op.target]
  if (!local) throw fault('UNKNOWN_TARGET','Target is not enabled on this host')
  if (action === 'state') return databaseEvidence(policy,run)
  if (action === 'barrier') {
    const state = await databaseEvidence(policy,run)
    const counters = ['liveWork','liveSession','liveAttempts','liveCapture','liveOutbox','prepared','otherClients']
    return { ...Object.fromEntries(counters.map(key => [key,state[key]])),fullVisibility:true,drained:counters.every(key => state[key] === 0) }
  }
  if (action === 'readiness') {
    const db = new DatabaseSync(join(policy.stateDirectory,'journal.sqlite'),{ readOnly:true })
    let manifest, direction
    try {
      const row = db.prepare('SELECT body,hash FROM manifests WHERE release_id=?').get(op.releaseId)
      if (!row || row.hash !== op.manifestHash) throw fault('MANIFEST_REQUIRED','Readiness requires a registered immutable release')
      manifest = JSON.parse(row.body)
      const state = db.prepare('SELECT body FROM node_state WHERE target=?').get(op.target)
      direction = op.direction ?? (state ? JSON.parse(state.body).appliedDirection : null) ?? 'forward'
    } finally { db.close() }
    const plan = manifest.targets[op.target].hostPlan, descriptor = direction==='source'?(plan.source??plan.recovery):direction === 'recovery' ? plan.recovery : plan
    for (const [service,spec] of Object.entries(local.services)) if (spec.role === 'web') {
      const ids = (await run(['ps','--all','--quiet','--filter',`label=com.docker.compose.project=${local.project}`,'--filter',`label=com.docker.compose.service=${service}`])).trim().split(/\s+/).filter(Boolean)
      if (ids.length !== 1 || !/^[a-f0-9]{12,64}$/.test(ids[0])) throw fault('READINESS_UNPROVEN','Expected one local Web container')
      const [container] = JSON.parse(await run(['container','inspect',ids[0]]))
      const identity=await inspectQualifiedImage(run,descriptor.images[service],undefined,{stateDirectory:policy.stateDirectory})
      if (!identity || container.Image !== identity.localImageId || !container.State.Running || container.State.Health?.Status !== 'healthy') throw fault('READINESS_UNPROVEN','Actual Web image or health is not qualified')
    }
    const url = new URL(local.readinessUrl)
    assertLocalReadinessUrl(url,interfaces())
    const response = await fetcher(url,{ redirect:'error',signal:AbortSignal.timeout(5000) })
    await response.body?.cancel()
    if (!response.ok) throw fault('READINESS_UNPROVEN','Actual Web/control readiness failed')
    return { ready:true,contract:descriptor.contract,manifestHash:op.manifestHash }
  }
  throw fault('UNSUPPORTED_CONTROL','The fixed helper only supports state, barrier and readiness')
}
async function main() {
  const [policyPath,action] = process.argv.slice(2)
  if (!policyPath || !['state','barrier','readiness'].includes(action)) throw Error('Fixed local-control usage: <policy.json> state|barrier|readiness')
  let input = ''
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 1024*1024) throw Error('Input exceeds limit') }
  const result = await localControl(JSON.parse(await readFile(policyPath,'utf8')),action,JSON.parse(input))
  process.stdout.write(JSON.stringify(result))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { process.stdout.write(JSON.stringify({ error:{ code:error.code ?? 'LOCAL_CONTROL_FAILED',message:error.code ? error.message : 'Trusted local evidence helper failed',...(error.sqlState ? { sqlState:error.sqlState } : {}) } })); process.exitCode = 1 })
