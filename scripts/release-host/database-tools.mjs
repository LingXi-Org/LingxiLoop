#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createReadStream, createWriteStream } from 'node:fs'
import { readFile, mkdir, open } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {inspectQualifiedImage} from './image-identity.mjs'
import { uploadArchive,observeArchive } from './archive.mjs'
import { databaseEvidence } from './local-control.mjs'
import {configurationFiles} from './configuration-files.mjs'
import { runDocker,runFixedHelper } from './adapter.mjs'
import {validateRuntimePatch,runtimePatchPlanHash,assertRuntimePatchResult} from './runtime-patch.mjs'
import { canonical, hash, fault } from './journal.mjs'

const COUNTS_SQL = `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='120s';
SELECT coalesce(jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'count',
 ((xpath('/row/count/text()',query_to_xml(format('SELECT count(*) AS count FROM %I.%I',schemaname,tablename),false,true,'')))[1]::text)::bigint)
 ORDER BY schemaname,tablename),'[]'::jsonb)::text FROM pg_tables
 WHERE schemaname NOT IN ('pg_catalog','information_schema') AND schemaname NOT LIKE 'pg_toast%' AND schemaname NOT LIKE 'pg_temp%'; COMMIT;`
const counters = ['liveWork','liveSession','liveAttempts','liveCapture','liveOutbox','prepared','otherClients']
function requireThat(condition,code,message) { if (!condition) throw fault(code,message) }
async function writeReceipt(path,value) {
  const file = await open(path,'wx',0o600)
  try { await file.writeFile(canonical(value)); await file.sync() } finally { await file.close() }
  const directory=await open(dirname(path),'r');try{await directory.sync()}finally{await directory.close()}
}
async function fileDigest(path) { const digest = createHash('sha256'); for await (const chunk of createReadStream(path)) digest.update(chunk); return `sha256:${digest.digest('hex')}` }
export async function dockerStream(args,{ inputFile,outputFile,timeout = 1800000,binary = '/usr/bin/docker' }) {
  const child = spawn(binary,args,{ shell:false,env:{ PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' },stdio:['pipe','pipe','ignore'] })
  const timer = setTimeout(() => child.kill('SIGKILL'),timeout)
  const completion = new Promise((resolve,reject) => { child.once('error',reject); child.once('close',code => code === 0 ? resolve() : reject(fault('DATABASE_SUBPROCESS_FAILED','Fixed database tool exited unsuccessfully'))) })
  const transfers = []
  if (inputFile) transfers.push(pipeline(createReadStream(inputFile),child.stdin)); else child.stdin.end()
  if (outputFile) transfers.push(pipeline(child.stdout,createWriteStream(outputFile,{ flags:'wx',mode:0o600 }))); else child.stdout.resume()
  try { await Promise.all([completion,...transfers]); if (outputFile) { const file = await open(outputFile,'r'); try { await file.sync() } finally { await file.close() } } }
  catch (error) { child.kill('SIGKILL'); throw error } finally { clearTimeout(timer) }
}
function registeredPlan(policy,op) {
  requireThat(policy.targets?.[op.target]?.databaseOwner === true,'DATABASE_OWNER_REQUIRED','Only the local database owner can run these phases')
  const db = new DatabaseSync(join(policy.stateDirectory,'journal.sqlite'),{ readOnly:true })
  try {
    const row = db.prepare('SELECT hash,body FROM manifests WHERE release_id=?').get(op.releaseId)
    requireThat(row?.hash === op.manifestHash,'MANIFEST_REQUIRED','Database action requires the registered immutable manifest')
    const plan = JSON.parse(row.body).targets?.[op.target]?.hostPlan
    requireThat(plan?.database && plan.mode === 'maintenance','DATABASE_PLAN_REQUIRED','Database action needs an explicit maintenance plan')
    validateRuntimePatch(plan.database)
    if(plan.database.runtimePatch)requireThat(op.target==='main-runtime-a','DATABASE_OWNER_REQUIRED','Runtime provenance CAS is restricted to the fixed main runtime A database owner')
    requireThat(canonical(op.parameters??{})==='{}','INVALID_DATABASE_PARAMETERS','Database actions accept no remote parameters')
    return plan
  } finally { db.close() }
}
async function tableCounts(policy,database,run) {
  const db = policy.database
  return JSON.parse((await run(['exec','--user','postgres',db.container,'psql','--no-psqlrc','--quiet','--tuples-only','--no-align','--username',db.user,'--dbname',database,'--set','ON_ERROR_STOP=1','--set','VERBOSITY=sqlstate','--command',COUNTS_SQL])).trim())
}
function sameSchemas(actual,expected) { return actual.nativeSchema === expected.nativeSchema && actual.productSchema === expected.productSchema }
function inventoryMatches(actual,migrations) { return actual.migrations?.length === migrations.length && actual.migrations.every((row,index) => row.version === migrations[index].version && row.checksum === migrations[index].checksum) }

/** All database destinations and argv come from trusted local policy. In particular stdin cannot select a dump path or database name. */
export async function databaseTool(policy,action,op,{ run = (args,options = {}) => runDocker(args,{ ...options,binary:policy.dockerBinary ?? '/usr/bin/docker' }),stream = (args,options) => dockerStream(args,{ ...options,binary:policy.dockerBinary ?? '/usr/bin/docker' }),archiveUpload = uploadArchive,archiveObserve = observeArchive,helper = runFixedHelper } = {}) {
  const plan = registeredPlan(policy,op), database = policy.database, local = policy.targets[op.target]
  const directory = join(policy.stateDirectory,op.releaseId,'database')
  await mkdir(directory,{ recursive:true,mode:0o700 })
  const dump = join(directory,'backup.dump'), backupFile = join(directory,'backup.json'), verifiedFile = join(directory,'restore-verified.json')
  const migrationContainer = `lingxi_migrate_${createHash('sha256').update(`${op.releaseId}:${op.manifestHash}`).digest('hex').slice(0,24)}`
  const isolated = `lingxi_verify_${createHash('sha256').update(`${op.releaseId}:${op.manifestHash}`).digest('hex').slice(0,24)}`
  const patch=plan.database.runtimePatch,patchIntentFile=join(directory,'runtime-patch-intent.json'),migrationIntentFile=join(directory,'runtime-patch-migration-intent.json')
  const readBackup = async () => {
    let receipt
    try { receipt=JSON.parse(await readFile(backupFile,'utf8')) } catch(error) { if(error.code!=='ENOENT')throw error;receipt=JSON.parse(await readFile(join(directory,'local-backup.json'),'utf8')) }
    requireThat(receipt.complete === true && receipt.manifestHash === op.manifestHash && receipt.dumpHash === await fileDigest(dump),'BACKUP_INVALID','Backup hash or immutable receipt is invalid')
    requireThat(policy.archive,'ARCHIVE_POLICY_REQUIRED','A confirmed immutable remote archive is required before database progression')
    const archived=await archiveObserve(policy,op,{dumpPath:dump,dumpHash:receipt.dumpHash})
    requireThat(archived.complete===true&&archived.dumpHash===receipt.dumpHash,'ARCHIVE_NOT_CONFIRMED','Remote backup archive identity is not confirmed')
    return {...receipt,archive:archived}
  }
  const assertDrained = async () => {
    const actual = await databaseEvidence(policy,run)
    requireThat(counters.every(key => actual[key] === 0),'DATABASE_WRITERS_ACTIVE','All old writers, leases and prepared transactions must be absent')
    return actual
  }
  if (action === 'backupObserve') return readBackup()
  if (action === 'backup') {
    const source = await assertDrained()
    requireThat(sameSchemas(source,plan.database.from),'DATABASE_SOURCE_CHANGED','Installed schemas no longer match the exact planned source')
    const counts = await tableCounts(policy,database.database,run)
    await writeReceipt(join(directory,'backup-intent.json'),{ manifestHash:op.manifestHash,source,countsHash:hash(counts) })
    await stream(['exec','--user','postgres',database.container,'pg_dump','--username',database.user,'--dbname',database.database,'--format=custom','--no-owner','--no-privileges'],{ outputFile:dump })
    const after = await assertDrained()
    requireThat(hash(after.migrations) === hash(source.migrations) && hash(await tableCounts(policy,database.database,run)) === hash(counts),'BACKUP_SOURCE_CHANGED','Committed source rows changed across the final maintenance snapshot')
    const receipt = { complete:true,manifestHash:op.manifestHash,dumpHash:await fileDigest(dump),source:{ nativeSchema:source.nativeSchema,productSchema:source.productSchema,migrationsHash:hash(source.migrations) },countsHash:hash(counts),rpo:'zero-committed-writes' }
    await writeReceipt(join(directory,'local-backup.json'),receipt)
    requireThat(policy.archive,'ARCHIVE_POLICY_REQUIRED','A confirmed immutable remote archive is required before database progression')
    const archive=await archiveUpload(policy,op,{dumpPath:dump,dumpHash:receipt.dumpHash})
    requireThat(archive.complete===true&&archive.dumpHash===receipt.dumpHash,'ARCHIVE_NOT_CONFIRMED','Remote backup archive identity is not confirmed')
    const archivedReceipt={...receipt,archive}
    await writeReceipt(backupFile,archivedReceipt)
    return archivedReceipt
  }
  if (action === 'restoreVerifyObserve') {
    const receipt = JSON.parse(await readFile(verifiedFile,'utf8'))
    try { const cleanup = JSON.parse(await readFile(join(directory,'restore-cleanup.json'),'utf8')); if (cleanup.error) receipt.cleanupErrors.push(cleanup.error) }
    catch (error) { if (error.code !== 'ENOENT') throw error; receipt.cleanupErrors.push({ code:'ISOLATED_DATABASE_CLEANUP_OUTCOME_UNKNOWN',message:'Restore is verified; temporary database cleanup outcome requires independent observation' }) }
    const backup = await readBackup()
    requireThat(receipt.complete === true && receipt.manifestHash === op.manifestHash && receipt.dumpHash === backup.dumpHash,'RESTORE_VERIFY_INVALID','Restore evidence does not match the exact backup')
    return receipt
  }
  if (action === 'restoreVerify') {
    const backup = await readBackup()
    await assertDrained()
    await writeReceipt(join(directory,'restore-intent.json'),{ manifestHash:op.manifestHash,isolated,dumpHash:backup.dumpHash })
    // No --if-not-exists: an orphaned previous restore is observed/quarantined, never blindly overwritten.
    await run(['exec','--user','postgres',database.container,'createdb','--username',database.user,'--template','template0',isolated])
    await stream(['exec','--interactive','--user','postgres',database.container,'pg_restore','--username',database.user,'--dbname',isolated,'--no-owner','--no-privileges','--exit-on-error'],{ inputFile:dump })
    const restored = await databaseEvidence({ ...policy,database:{ ...database,database:isolated } },run)
    const countsHash = hash(await tableCounts(policy,isolated,run))
    requireThat(sameSchemas(restored,backup.source) && hash(restored.migrations) === backup.source.migrationsHash && countsHash === backup.countsHash,'RESTORE_VERIFY_MISMATCH','Isolated restore ledger or all-table counts differ from the source')
    const receipt = { complete:true,manifestHash:op.manifestHash,dumpHash:backup.dumpHash,countsHash,restoredSchema:{ nativeSchema:restored.nativeSchema,productSchema:restored.productSchema },cleanupErrors:[] }
    // Other database plans retain independent cleanup errors; runtimePatch must
    // additionally prove completed cleanup and the exact read-only source below.
    if(!patch)await writeReceipt(verifiedFile,receipt)
    try { await run(['exec','--user','postgres',database.container,'dropdb','--username',database.user,isolated]) }
    catch { receipt.cleanupErrors.push({ code:'ISOLATED_DATABASE_CLEANUP_FAILED',message:'Verified temporary database remains for restricted deterministic GC' }) }
    await writeReceipt(join(directory,'restore-cleanup.json'),{ complete:receipt.cleanupErrors.length === 0,error:receipt.cleanupErrors[0] ?? null })
    if(patch){
      // An isolated restore/cleanup unknown must never be relabelled as a known
      // read-only source refusal. Only this completed-cleanup branch can do so.
      if(receipt.cleanupErrors.length)throw Object.assign(fault('ISOLATED_DATABASE_CLEANUP_OUTCOME_UNKNOWN','Isolated restore cleanup must be observed before runtime preflight'),{uncertain:true})
      requireThat(op.phase==='restore-verify' && !await readOptional(patchIntentFile) && !await readOptional(migrationIntentFile),'RUNTIME_PATCH_OUTCOME_UNRESOLVED','Source preflight requires the restore verification phase before any runtime or migration intent')
      try{
        await assertDrained()
        const proof=await patchCall(await migrationContext(),'observe')
        requireThat(proof.state==='source' && proof.complete===false,'DATABASE_SOURCE_CHANGED','Restore verification runtime preflight must prove the exact source')
        receipt.runtimePatchPreflight=proof
      }catch{
        // The qualified fixed observer is read-only. There has been no CAS or
        // migration intent, and all isolated restore effects above are known.
        throw Object.assign(fault('RUNTIME_PATCH_PREFLIGHT_REFUSED','Fixed read-only runtime source preflight refused before migration'),{outcomeKnown:true,uncertain:false})
      }
      await writeReceipt(verifiedFile,receipt)
    }
    return receipt
  }
  async function readOptional(path){try{return JSON.parse(await readFile(path,'utf8'))}catch(error){if(error.code==='ENOENT')return null;throw error}}
  async function migrationContext(){
    const migration=local.migration
    requireThat(migration && /^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(migration.service) && plan.images[migration.imageService],'MIGRATION_NOT_CONFIGURED','A fixed one-off migration service and qualified image are required')
    const files=configurationFiles(local,plan.configurationHash)
    const compose=['compose','--project-name',local.project,'--env-file',files.envFile,'--file',files.composeFile,'--file',join(policy.stateDirectory,op.releaseId,`${op.target}-forward.json`)]
    const config=JSON.parse(await run([...compose,'config','--format','json'])),spec=config.services?.[migration.service]
    const identity=await inspectQualifiedImage(run,plan.images[migration.imageService],undefined,{stateDirectory:policy.stateDirectory})
    requireThat(identity && spec && !spec.build && spec.image===identity.localImageId && spec.pull_policy==='never' && spec.restart==='no' && !spec.privileged && !(spec.volumes?.length) && canonical(spec.command)===canonical(['npm','run','db:migrate']),'MIGRATION_NOT_CONFIGURED','Migration service must be the fixed offline packaged migration command')
    const connection=new URL(spec.environment?.DATABASE_URL)
    requireThat(['postgres:','postgresql:'].includes(connection.protocol) && connection.hostname===database.migrationHostname && decodeURIComponent(connection.pathname.slice(1))===database.database && decodeURIComponent(connection.username)===database.user,'MIGRATION_DESTINATION_MISMATCH','The fixed migration environment does not address the independently verified database')
    return {migration,compose,identity}
  }
  async function patchCall(context,action){
    const args=[...context.compose,'run','--rm','--no-deps','--pull','never','--no-TTY','--interactive','--entrypoint','node',...(action==='apply'?['--env','LINGXIOS_SCHEMA_UPGRADE_DRAINED=true']:[]),context.migration.service,'--import','tsx','server/src/runtime-patch-bin.ts',action]
    let result
    try{result=await helper([policy.dockerBinary??'/usr/bin/docker',...args],patch,1800000)}catch{throw Object.assign(fault('RUNTIME_PATCH_OUTCOME_UNRESOLVED','Fixed runtime patch helper did not confirm the immutable provenance outcome'),{uncertain:true})}
    return assertRuntimePatchResult(result,patch,action)
  }
  const assertPatchTarget=async actual=>{
    requireThat(actual.runtime===patch.target.runtime && actual.schemaHash===patch.target.schemaHash && actual.protocolVersion===patch.target.protocol && sameSchemas(actual,plan.database.to) && canonical(actual.migrations)===canonical(patch.target.migrations),'RUNTIME_PATCH_OUTCOME_UNRESOLVED','Independent database evidence does not prove exact target runtime provenance')
  }
  if (action === 'migrateObserve') {
    await readBackup()
    let patchProof
    if(patch){
      const context=await migrationContext(),intent=await readOptional(patchIntentFile)
      requireThat(intent?.manifestHash===op.manifestHash && intent.generation===op.generation && intent.planHash===runtimePatchPlanHash(patch) && intent.localImageId===context.identity.localImageId,'RUNTIME_PATCH_OUTCOME_UNRESOLVED','Exact runtime patch intent and qualified target image are required')
      patchProof=await patchCall(context,'observe')
      requireThat(patchProof.complete===true,'RUNTIME_PATCH_OUTCOME_UNRESOLVED','Source provenance observation never authorizes replay of a runtime patch intent')
      const actual=await assertDrained();await assertPatchTarget(actual)
      const verified=JSON.parse(await readFile(verifiedFile,'utf8')),backup=await readBackup()
      requireThat(verified.complete===true && verified.manifestHash===op.manifestHash && verified.dumpHash===backup.dumpHash,'MIGRATION_BOUNDARY_INVALID','Runtime patch observation requires the exact verified backup')
      const migrationIntent=await readOptional(migrationIntentFile)
      if(!migrationIntent)return {complete:true,nativeSchema:14,productSchema:57,migrationsHash:hash(actual.migrations),runtimePatch:patchProof,migrationExecution:'not-attempted',equivalentPostcondition:'unchanged-product57-exact-target-provenance'}
      requireThat(migrationIntent.manifestHash===op.manifestHash && migrationIntent.generation===op.generation && migrationIntent.planHash===intent.planHash && migrationIntent.localImageId===intent.localImageId,'RUNTIME_PATCH_OUTCOME_UNRESOLVED','Migration intent does not match the exact runtime patch')
    }
    const [container] = JSON.parse(await run(['container','inspect',migrationContainer]))
    const migration = local.migration
    const identity=await inspectQualifiedImage(run,plan.images[migration?.imageService],undefined,{stateDirectory:policy.stateDirectory})
    requireThat(identity&&container?.Image === identity.localImageId && container.State?.Status === 'exited' && container.State.Running === false && container.State.ExitCode === 0, 'MIGRATION_OUTCOME_UNRESOLVED', 'A retained exact-image one-off with successful final exit is required to prove all migration side effects completed')
    const actual = await databaseEvidence(policy,run)
    requireThat(sameSchemas(actual,plan.database.to) && inventoryMatches(actual,plan.database.migrations),'MIGRATION_OUTCOME_UNRESOLVED','Installed schema/checksum ledger does not prove complete target migration')
    if(patch)await assertPatchTarget(actual)
    return { complete:true,nativeSchema:actual.nativeSchema,productSchema:actual.productSchema,migrationsHash:hash(actual.migrations),...(patch?{runtimePatch:patchProof,migrationExecution:'retained-oneoff-exit-zero'}:{}) }
  }
  if (action === 'migrate') {
    if(patch && await readOptional(patchIntentFile))return databaseTool(policy,'migrateObserve',op,{run,stream,archiveUpload,archiveObserve,helper})
    const source = await assertDrained(), backup = await readBackup(), verified = JSON.parse(await readFile(verifiedFile,'utf8'))
    requireThat(sameSchemas(source,plan.database.from) && verified.complete === true && (!patch || verified.manifestHash===op.manifestHash) && verified.dumpHash === backup.dumpHash,'MIGRATION_BOUNDARY_INVALID','Migration requires the exact drained source and verified final backup')
    requireThat(source.migrations.every((row,index) => row.version === plan.database.migrations[index]?.version && row.checksum === plan.database.migrations[index]?.checksum),'MIGRATION_CHECKSUM_CHANGED','The installed ledger is not an exact prefix of the requested target')
    const context=await migrationContext(),{migration,compose}=context
    if(patch){
      requireThat(source.runtime===patch.source.runtime && source.schemaHash===patch.source.schemaHash && source.protocolVersion===patch.source.protocol && canonical(source.migrations)===canonical(patch.source.migrations),'DATABASE_SOURCE_CHANGED','Runtime patch requires the exact named source provenance')
      const before=await patchCall(context,'observe')
      requireThat(before.state==='source' && before.complete===false,'DATABASE_SOURCE_CHANGED','Runtime patch must begin at the exact registered source')
      const intent={manifestHash:op.manifestHash,generation:op.generation,planHash:runtimePatchPlanHash(patch),localImageId:context.identity.localImageId}
      await writeReceipt(patchIntentFile,intent)
      await patchCall(context,'apply')
      requireThat((await patchCall(context,'observe')).complete===true,'RUNTIME_PATCH_OUTCOME_UNRESOLVED','Runtime CAS must be independently observed before the fixed migration command')
      await assertPatchTarget(await assertDrained())
      await writeReceipt(migrationIntentFile,intent)
    }
    await run([...compose,'run','--name',migrationContainer,'--no-deps','--pull','never','--env','LINGXIOS_SCHEMA_UPGRADE_DRAINED=true',migration.service],{ timeout:1800000 })
    return databaseTool(policy,'migrateObserve',op,{ run,stream,archiveUpload,archiveObserve,helper })
  }
  throw fault('UNSUPPORTED_DATABASE_ACTION','Only fixed backup, isolated restore verification and ledger-checked migration actions are supported')
}
async function main() {
  const [policyPath,action] = process.argv.slice(2)
  let input = ''
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 1024*1024) throw Error('Input exceeds limit') }
  process.stdout.write(JSON.stringify(await databaseTool(JSON.parse(await readFile(policyPath,'utf8')),action,JSON.parse(input))))
}
const knownReadOnlyFailures=new Set(['DATABASE_SOURCE_CHANGED','DATABASE_WRITERS_ACTIVE','BACKUP_INVALID','BACKUP_SOURCE_CHANGED','RESTORE_VERIFY_MISMATCH','RUNTIME_PATCH_PREFLIGHT_REFUSED','ARCHIVE_POLICY_REQUIRED','ARCHIVE_ENDPOINT_INVALID','ARCHIVE_TIMEOUT_INVALID','ARCHIVE_TOO_LARGE','LOCAL_BACKUP_HASH_MISMATCH','ARCHIVE_TOKEN_INVALID','ARCHIVE_IDENTITY_CONFLICT','ARCHIVE_UPLOAD_REJECTED','ARCHIVE_METADATA_REJECTED'])
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => {
  const known=['backup','restoreVerify'].includes(process.argv[3])&&knownReadOnlyFailures.has(error.code)&&error.uncertain!==true
  process.stdout.write(JSON.stringify({error:{code:error.code??'DATABASE_TOOL_FAILED',message:error.code?error.message:'Trusted database helper failed',...(error.sqlState?{sqlState:error.sqlState}:{}),...(known?{outcomeKnown:true,uncertain:false}:error.uncertain===true?{uncertain:true}:{})}}));process.exitCode=1
})
