// Source-state backup only. Default: local plan. Execute requires the exact saved
// plan and existing injected Komodo authorization. No target migration is run.
import { createHash, randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const root = fileURLToPath(new URL('../', import.meta.url))
const run = promisify(execFile)
const sha256 = value => createHash('sha256').update(value).digest('hex')
const sqlQuote = value => `'${String(value).replaceAll("'", "''")}'`
const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`
const origin = 'https://ops.christmas1314.xyz'
const prefix = 'MEMORY_BACKUP_'
// Pinned SOURCE release, independent of the eventual target package installed by
// the product. These are formal 3.5.6 registry/resource values, not target defaults.
const baseline = { runtime:'3.5.6',schema:12,protocol:11,productVersion:46,
  schemaHash:'e8c09fa33af0c073f57effa99aad7beae4f4737dd2966d6584519ec5d4aa1d1a',
  integrity:'sha512-fg3EvMwwgZLd9QZ5aTT8IcJrj/9vfy7OK/1BGUiEvwt6FS7WlhgyoycZmxFj+Q1yT8XXppGCmmK7F+JIjCJLpg==',
  tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.5.6/8678395c3eb40eeb99860a05b3f532704fcb1bcb' }
const maxResponse = 512 * 1024
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join() === [...keys].sort().join()
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b)
const git = async args => (await run('git',args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024})).stdout

async function sourceDescriptor(sourceSha) {
  const pkg = name => git(['show',`${sourceSha}:${name}`]).then(JSON.parse)
  const [manifest, server, lock, serverLock, tree] = await Promise.all([
    pkg('package.json'),pkg('server/package.json'),pkg('package-lock.json'),pkg('server/package-lock.json'),
    git(['ls-tree','--name-only',`${sourceSha}:server/src/db/migrations`]),
  ])
  const name='@lyyzka/lingxios', installed=lock.packages?.[`node_modules/${name}`]
  const other=serverLock.packages?.[`node_modules/${name}`]
  if ([manifest,server,lock.packages?.[''],serverLock.packages?.['']].some(p=>p?.dependencies?.[name]!==baseline.runtime)
    || installed?.version!==baseline.runtime || other?.version!==baseline.runtime
    || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(installed?.integrity ?? '')
    || installed.integrity!==other.integrity || installed.resolved!==other.resolved
    || installed.integrity!==baseline.integrity || installed.resolved!==baseline.tarball) throw new Error('Source must match formal 3.5.6/schema12/product46')
  const names=tree.trim().split('\n').sort()
  if(names.length!==baseline.productVersion || names.some((name,index)=>!new RegExp(`^${String(index+1).padStart(4,'0')}_[a-z0-9_]+\\.sql$`).test(name)))
    throw new Error('Source migration inventory mismatch')
  const migrations=await Promise.all(names.map(async filename=>({version:Number(filename.slice(0,4)),name:filename.slice(5,-4),
    checksum:sha256(await git(['show',`${sourceSha}:server/src/db/migrations/${filename}`]))})))
  return {sha:sourceSha,productVersion:baseline.productVersion,runtime:{runtime:baseline.runtime,schema:baseline.schema,
    protocol:baseline.protocol,schemaHash:baseline.schemaHash,integrity:installed.integrity,tarball:installed.resolved},migrations}
}

export async function buildMemoryBackupPlan({sourceSha,attempt,nonce=randomBytes(8).toString('hex')}) {
  if(!/^[a-f0-9]{40}$/.test(sourceSha ?? '') || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(attempt ?? '') || !/^[a-f0-9]{16}$/.test(nonce))
    throw new Error('Concrete source SHA, safe attempt and nonce required')
  const source=await sourceDescriptor(sourceSha)
  const plan={format:1,source,attempt,nonce,isolatedDatabase:`memory_verify_${sourceSha.slice(0,12)}_${nonce}`,
    backupDir:`/var/lib/postgresql/data/memory-upgrade-backups/${sourceSha}/${attempt}`,migrationRehearsal:'not-performed'}
  const command=renderCommand(plan)
  return {...plan,command,commandHash:sha256(command)}
}

export async function validateMemoryBackupPlan(plan) {
  if(!exactKeys(plan,['format','source','attempt','nonce','isolatedDatabase','backupDir','migrationRehearsal','command','commandHash']))
    throw new Error('Invalid reviewed plan')
  const expected=await buildMemoryBackupPlan({sourceSha:plan.source?.sha,attempt:plan.attempt,nonce:plan.nonce})
  if(!same(plan,expected)) throw new Error('Reviewed plan differs from exact source or command')
}

function renderCommand(plan) {
  const {source,isolatedDatabase,backupDir}=plan, runtime=source.runtime
  const assert=condition=>`SELECT 1/CASE WHEN (${condition}) THEN 1 ELSE 0 END;`
  const precondition=`${assert(`(SELECT jsonb_agg(jsonb_build_object('version',version,'name',name,'checksum',checksum) ORDER BY version) FROM public.schema_migrations)=${sqlQuote(JSON.stringify(source.migrations))}::jsonb`)}
${assert(`(SELECT count(*) FROM public.lingxios_installation)=1 AND EXISTS(SELECT 1 FROM public.lingxios_installation WHERE singleton AND runtime_version=${sqlQuote(runtime.runtime)} AND schema_version=${runtime.schema} AND protocol_version=${runtime.protocol} AND schema_sha256=${sqlQuote(runtime.schemaHash)})`)}
${assert(`(SELECT count(*) FROM lingxios.schema_version)=1 AND EXISTS(SELECT 1 FROM lingxios.schema_version WHERE singleton AND version=${runtime.schema})`)}
${assert(`NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','lingxios') AND c.relkind='f')`)}
`
  const counts=String.raw`SELECT format('SELECT json_build_array(%L,%L,count(*)) FROM %I.%I;',n.nspname,c.relname,n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','lingxios') AND c.relkind IN ('r','p') ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C"
\gexec
`
  const provenance=`SELECT jsonb_build_object('runtime',(SELECT jsonb_build_object('runtime',runtime_version,'schema',schema_version,'protocol',protocol_version,'schemaHash',schema_sha256) FROM public.lingxios_installation WHERE singleton),'actualSchema',(SELECT version FROM lingxios.schema_version WHERE singleton),'migrations',(SELECT jsonb_agg(jsonb_build_object('version',version,'name',name,'checksum',checksum) ORDER BY version) FROM public.schema_migrations));`
  const snapshot=String.raw`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL row_security=off;
SET LOCAL statement_timeout='10min';
SET LOCAL idle_in_transaction_session_timeout='25min';
SET LOCAL lock_timeout='10s';
\i :precondition_file
\o :snapshot_file
SELECT pg_export_snapshot();
\o :counts_file
\i :counts_query_file
\o :provenance_file
\i :provenance_query_file
\o :ready_file
SELECT 'ready';
\o /dev/null
`
  const files={'precondition.sql':precondition,'counts.sql':counts,'provenance.sql':provenance,'snapshot.sql':snapshot}
  const writes=Object.entries(files).map(([name,value])=>`printf '%s' ${quote(Buffer.from(value).toString('base64'))} | base64 -d > "$work/${name}"`).join('\n')
  const inner = `set -eu
set +x
test "$#" -eq 1
printf '%s' "$1" | grep -Eq '^[a-f0-9]{64}$'
umask 077
export LC_ALL=C
export PGPASSWORD="$POSTGRES_PASSWORD"
export PGCONNECT_TIMEOUT=15
export PGOPTIONS='-c statement_timeout=600000 -c lock_timeout=10000 -c row_security=off -c search_path=public'
backup_dir=${quote(backupDir)}
verify_db=${quote(isolatedDatabase)}
created=0
holder=''
fifo_open=0
work=''
stage=initialization
success=0
cleanup() {
  result=$?
  trap - EXIT HUP INT TERM
  set +e
  if [ "$fifo_open" = 1 ]; then exec 9>&-; fi
  if [ -n "$holder" ]; then kill "$holder" 2>/dev/null; wait "$holder" 2>/dev/null; fi
  if [ "$created" = 1 ]; then
    if [ "$verify_db" != ${quote(isolatedDatabase)} ] || [ "$verify_db" = "$POSTGRES_DB" ]; then
      result=1; stage=cleanup-guard
    elif ! timeout --foreground -k 10 60 dropdb -h postgres -U "$POSTGRES_USER" --maintenance-db=postgres "$verify_db" >/dev/null 2>&1; then
      result=1; stage=cleanup-database
    fi
  fi
  if [ -n "$work" ]; then rm -f "$work"/* 2>/dev/null; rmdir "$work" 2>/dev/null; fi
  if [ "$result" = 0 ] && [ "$success" = 1 ]; then
    if ! printf '{"complete":true,"isolatedDatabaseRemoved":true}\\n' > "$backup_dir/completion.json"; then
      printf '${prefix}FAILED_STAGE=completion-evidence\\n'; exit 1
    fi
    if ! mv "$backup_dir/verification.pending.json" "$backup_dir/verification.json"; then
      printf '${prefix}FAILED_STAGE=completion-evidence\\n'; exit 1
    fi
    printf '${prefix}RECEIPT='; cat "$backup_dir/verification.json"
    printf '${prefix}COMPLETE=1\\n'
  else
    printf '${prefix}FAILED_STAGE=%s\\n' "$stage"; result=1
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
exec 2>/dev/null
for utility in timeout mkfifo psql pg_dump pg_restore createdb dropdb sha256sum base64 cmp grep df awk paste cut mktemp mv; do command -v "$utility" >/dev/null; done
test -n "$POSTGRES_USER"; test -n "$POSTGRES_DB"; test "$verify_db" != "$POSTGRES_DB"
work=$(mktemp -d /tmp/memory-backup.XXXXXXXXXX)
${writes}
stage=reserve-attempt
mkdir -p ${quote(backupDir.slice(0,backupDir.lastIndexOf('/')))}
test "$(cd ${quote(backupDir.slice(0,backupDir.lastIndexOf('/')))} && pwd -P)" = ${quote(backupDir.slice(0,backupDir.lastIndexOf('/')))}
mkdir "$backup_dir"
printf '%s\\n' ${quote(JSON.stringify({source,attempt:plan.attempt,isolatedDatabase,migrationRehearsal:'not-performed'}))} > "$backup_dir/attempt.json"
stage=capacity-initial
db_bytes=$(timeout --foreground -k 10 60 psql -X -qAt -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c 'BEGIN READ ONLY; SELECT pg_database_size(current_database()); ROLLBACK;')
printf '%s' "$db_bytes" | grep -Eq '^[0-9]+$'
headroom() {
  phase=$1; factor=$2
  df -Pk /var/lib/postgresql/data > "$work/disk-free"
  free_kib=$(awk 'NR==2 {print $4}' "$work/disk-free")
  printf '%s' "$free_kib" | grep -Eq '^[0-9]+$'
  free_bytes=$((free_kib * 1024)); required_bytes=$((db_bytes * factor + 536870912))
  printf '{"phase":"%s","databaseBytes":%s,"freeBytes":%s,"requiredBytes":%s}\\n' "$phase" "$db_bytes" "$free_bytes" "$required_bytes" > "$backup_dir/capacity-$phase.json"
  test "$free_bytes" -ge "$required_bytes"
}
headroom initial 2
stage=snapshot
mkfifo "$work/snapshot-input"; exec 9<> "$work/snapshot-input"; fifo_open=1
timeout --foreground -k 10 2100 psql -X -qAt -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 \\
  -v precondition_file="$work/precondition.sql" -v snapshot_file="$work/snapshot-id" \\
  -v counts_file="$backup_dir/counts-before.jsonl" -v counts_query_file="$work/counts.sql" \\
  -v provenance_file="$backup_dir/provenance-before.json" -v provenance_query_file="$work/provenance.sql" \\
  -v ready_file="$work/ready" < "$work/snapshot-input" > /dev/null &
holder=$!
cat "$work/snapshot.sql" >&9
remaining=660
while [ ! -s "$work/ready" ]; do
  kill -0 "$holder"; test "$remaining" -gt 0; remaining=$((remaining-1)); sleep 1
done
test "$(cat "$work/ready")" = ready
snapshot=$(cat "$work/snapshot-id")
printf '%s' "$snapshot" | grep -Eq '^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$'
printf '${prefix}SNAPSHOT_READY=1\\n'
stage=dump
timeout --foreground -k 10 1080 pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --snapshot="$snapshot" --lock-wait-timeout=10s -f "$backup_dir/product.dump"
kill -0 "$holder"
printf 'ROLLBACK;\\n\\\\q\\n' >&9
exec 9>&-; fifo_open=0
wait "$holder"; holder=''
dump_hash=$(sha256sum "$backup_dir/product.dump" | cut -d ' ' -f 1)
printf '%s  product.dump\\n' "$dump_hash" > "$backup_dir/sha256.txt"
stage=capacity-restore
headroom restore 1
stage=create-isolated-database
timeout --foreground -k 10 60 createdb -h postgres -U "$POSTGRES_USER" --maintenance-db=postgres --template=template0 "$verify_db"
created=1
isolated() {
  test "$created" = 1; test "$verify_db" = ${quote(isolatedDatabase)}; test "$verify_db" != "$POSTGRES_DB"
  timeout --foreground -k 10 660 psql -X -qAt -h postgres -U "$POSTGRES_USER" -d "$verify_db" -v ON_ERROR_STOP=1 "$@"
}
stage=restore
timeout --foreground -k 10 1200 pg_restore -h postgres -U "$POSTGRES_USER" -d "$verify_db" --no-owner --no-privileges --exit-on-error "$backup_dir/product.dump"
stage=verify-restore
isolated -c 'BEGIN READ ONLY' -f "$work/precondition.sql" -c 'ROLLBACK' >/dev/null
isolated -c 'BEGIN READ ONLY' -f "$work/counts.sql" -c 'ROLLBACK' > "$backup_dir/counts-restored.jsonl"
isolated -c 'BEGIN READ ONLY' -f "$work/provenance.sql" -c 'ROLLBACK' > "$backup_dir/provenance-restored.json"
cmp -s "$backup_dir/counts-before.jsonl" "$backup_dir/counts-restored.jsonl"
cmp -s "$backup_dir/provenance-before.json" "$backup_dir/provenance-restored.json"
printf '{"source":%s,"attempt":%s,"commandHash":"%s","dumpSha256":"%s","restoreCountsEqual":true,"restoreProvenanceEqual":true,"isolatedDatabaseRemoved":true,"migrationRehearsal":"not-performed","countsBefore":[%s],"countsRestored":[%s],"capacity":[%s,%s]}\\n' \\
  ${quote(JSON.stringify(source))} ${quote(JSON.stringify(plan.attempt))} "$1" "$dump_hash" \\
  "$(paste -sd, "$backup_dir/counts-before.jsonl")" "$(paste -sd, "$backup_dir/counts-restored.jsonl")" \\
  "$(cat "$backup_dir/capacity-initial.json")" "$(cat "$backup_dir/capacity-restore.json")" > "$backup_dir/verification.pending.json"
success=1
`
  // A transport cancellation cannot stop a remote one-off service. Its own hard
  // ceiling includes a bounded grace period for dropping only the owned restore.
  // Only this outer timeout owns a process group. Inner --foreground timeouts
  // keep clients in that group so overall TERM interrupts the shell's wait and
  // reaches cleanup before KILL. Do not add --foreground to the outer timeout.
  return `exec timeout -k 75 3900 sh -ec ${quote(inner)} memory-backup "$1"`
}

export function parseMemoryBackupReceipt(plan,update) {
  const updateId=update?._id?.$oid
  if(!/^[a-f0-9]{24}$/.test(updateId ?? '') || update.status!=='Complete' || update.success!==true || !Array.isArray(update.logs))
    throw new Error('Backup receipt is not successful and complete')
  const output=update.logs.map(log=>typeof log.stdout==='string'?log.stdout:'').join('\n')
  const markers=name=>[...output.matchAll(new RegExp(`^${prefix}${name}=(.*)$`,'gm'))].map(m=>m[1])
  const completed=markers('COMPLETE'), receipts=markers('RECEIPT')
  if(completed.length!==1 || completed[0]!=='1' || receipts.length!==1 || markers('FAILED_STAGE').length)
    throw new Error('Backup receipt markers are incomplete or ambiguous')
  const data=JSON.parse(receipts[0])
  if(!exactKeys(data,['source','attempt','commandHash','dumpSha256','restoreCountsEqual','restoreProvenanceEqual',
    'isolatedDatabaseRemoved','migrationRehearsal','countsBefore','countsRestored','capacity'])
    || !same(data.source,plan.source) || data.attempt!==plan.attempt || data.commandHash!==plan.commandHash
    || !/^[a-f0-9]{64}$/.test(data.dumpSha256 ?? '') || data.restoreCountsEqual!==true
    || data.restoreProvenanceEqual!==true || data.isolatedDatabaseRemoved!==true || data.migrationRehearsal!=='not-performed')
    throw new Error('Invalid source backup receipt')
  const counts=data.countsBefore
  if(!Array.isArray(counts) || !counts.length || !same(counts,data.countsRestored)
    || counts.some(row=>!Array.isArray(row)||row.length!==3||!['public','lingxios'].includes(row[0])
      || typeof row[1]!=='string'||!row[1]||!Number.isSafeInteger(row[2])||row[2]<0)
    || new Set(counts.map(row=>JSON.stringify(row.slice(0,2)))).size!==counts.length
    || counts.find(row=>row[0]==='public'&&row[1]==='schema_migrations')?.[2]!==plan.source.productVersion
    || counts.find(row=>row[0]==='public'&&row[1]==='lingxios_installation')?.[2]!==1
    || counts.find(row=>row[0]==='lingxios'&&row[1]==='schema_version')?.[2]!==1)
    throw new Error('Invalid restore count evidence')
  if(!Array.isArray(data.capacity)||data.capacity.length!==2||data.capacity.some((item,i)=>
    !exactKeys(item,['phase','databaseBytes','freeBytes','requiredBytes'])||item.phase!==['initial','restore'][i]
    || ['databaseBytes','freeBytes','requiredBytes'].some(key=>!Number.isSafeInteger(item[key])||item[key]<0)
    || item.requiredBytes!==item.databaseBytes*(i===0?2:1)+536870912||item.freeBytes<item.requiredBytes)
    || data.capacity[0].databaseBytes!==data.capacity[1].databaseBytes) throw new Error('Invalid capacity evidence')
  return {status:'Complete',success:true,updateId,source:plan.source,attempt:plan.attempt,commandHash:plan.commandHash,
    backupDir:plan.backupDir,isolatedDatabase:plan.isolatedDatabase,isolatedDatabaseRemoved:true,
    dumpSha256:data.dumpSha256,restoreCountsEqual:true,restoreProvenanceEqual:true,migrationRehearsal:'not-performed',
    capacity:data.capacity,countsBefore:counts,countsRestored:data.countsRestored,verifiedAt:new Date().toISOString()}
}

async function responseJson(response) {
  if(!response.ok) throw new Error('Komodo request failed')
  const reader=response.body?.getReader(); if(!reader) throw new Error('Missing response')
  let size=0;const chunks=[]
  try {
    while(true) {const {done,value}=await reader.read();if(done)break;size+=value.byteLength
      if(size>maxResponse) {await reader.cancel();throw new Error('Oversized response')}; chunks.push(value)}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } finally {reader.releaseLock()}
}

export async function executeMemoryBackup({plan,apiKey,apiSecret,signal,onProgress=async()=>{}}) {
  await validateMemoryBackupPlan(plan)
  signal?.throwIfAborted()
  if(!apiKey||!apiSecret) throw new Error('Existing injected Komodo authorization required')
  let updateId,submitted=false
  const progress=()=>({status:'pending',sourceSha:plan.source.sha,attempt:plan.attempt,
    isolatedDatabase:plan.isolatedDatabase,commandHash:plan.commandHash,...(updateId?{updateId}:{})})
  const request=async(path,body)=>responseJson(await fetch(origin+path,{method:'POST',redirect:'error',
    headers:{'content-type':'application/json','x-api-key':apiKey,'x-api-secret':apiSecret},body:JSON.stringify(body),
    signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)}))
  try {
    await onProgress(progress()); signal?.throwIfAborted(); submitted=true
    let update=await request('/execute/RunStackService',{stack:'lingxiloop-core-state',service:'postgres',entrypoint:'sh',
      command:['-ec',plan.command,'memory-backup',plan.commandHash],user:'postgres',
      no_tty:true,no_deps:true,detach:false,service_ports:false,pull:false})
    updateId=update?._id?.$oid
    if(!/^[a-f0-9]{24}$/.test(updateId ?? '')) {updateId=undefined;throw new Error('Missing update id')}
    await onProgress(progress())
    const deadline=Date.now()+70*60000
    while(update.status!=='Complete'&&Date.now()<deadline) {
      await delay(2000,undefined,{signal}); signal?.throwIfAborted()
      update=await request('/read/GetUpdate',{id:updateId})
      if(update?._id?.$oid!==updateId)throw new Error('Update identity changed')
    }
    signal?.throwIfAborted()
    if(update.status==='Complete'&&update.success===false) {
      const logs=(update.logs ?? []).map(l=>typeof l.stdout==='string'?l.stdout:'').join('\n')
      const stage=/^MEMORY_BACKUP_FAILED_STAGE=([a-z-]{1,48})$/m.exec(logs)?.[1]
      return {status:'Complete',success:false,updateId,attempt:plan.attempt,isolatedDatabase:plan.isolatedDatabase,
        commandHash:plan.commandHash,...(stage?{failedStage:stage}:{}),migrationRehearsal:'not-performed'}
    }
    return parseMemoryBackupReceipt(plan,update)
  } catch {
    const evidence={...progress(),status:submitted?'uncertain':'not-submitted'}
    await onProgress(evidence).catch(()=>{})
    throw new Error(`Backup operation ${submitted?'outcome uncertain':'not submitted'}; updateId=${updateId ?? 'unknown'}; attempt=${plan.attempt}; isolatedDatabase=${plan.isolatedDatabase}`)
  }
}

async function main() {
  const args=process.argv.slice(2), value=flag=>{const index=args.indexOf(flag);return index<0?undefined:args[index+1]}
  if(args.includes('--help')) {
    console.log('Default/local: --source-sha <40-hex> --attempt <unique-id> --output <new-absolute-plan.json>\nExplicit execution: --execute --plan-file <reviewed-plan.json> --output <new-absolute-receipt.json>. Existing injected Komodo credentials only. Source backup/restore only; target migration is NOT performed.')
    return
  }
  const allowed=new Set(['--execute','--plan','--source-sha','--attempt','--output','--plan-file'])
  for(let i=0;i<args.length;i++) {
    if(!allowed.has(args[i])||args.indexOf(args[i])!==i)throw new Error('Unknown or duplicate argument')
    if(!['--execute','--plan'].includes(args[i])) {if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('Missing argument value');i++}
  }
  const output=value('--output')
  if(!output||!isAbsolute(output))throw new Error('An exclusive absolute output path is required')
  if(!args.includes('--execute')) {
    if(value('--plan-file'))throw new Error('Plan file requires explicit execute')
    const plan=await buildMemoryBackupPlan({sourceSha:value('--source-sha'),attempt:value('--attempt')})
    await writeFile(output,JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600})
    console.log(JSON.stringify({mode:'plan-only',sourceSha:plan.source.sha,attempt:plan.attempt,commandHash:plan.commandHash,migrationRehearsal:'not-performed'}));return
  }
  if(args.includes('--plan')||value('--source-sha')||value('--attempt')||!isAbsolute(value('--plan-file') ?? ''))throw new Error('Execute requires only a reviewed absolute plan file and new receipt path')
  const plan=JSON.parse(await readFile(value('--plan-file'),'utf8'))
  await validateMemoryBackupPlan(plan)
  if(!process.env.KOMODO_API_KEY||!process.env.KOMODO_API_SECRET)throw new Error('Existing authorization required')
  await writeFile(output,JSON.stringify({status:'pending',sourceSha:plan.source.sha,attempt:plan.attempt,isolatedDatabase:plan.isolatedDatabase,commandHash:plan.commandHash})+'\n',{flag:'wx',mode:0o600})
  const abort=new AbortController(), stop=()=>abort.abort()
  process.once('SIGINT',stop);process.once('SIGTERM',stop)
  try {
    const receipt=await executeMemoryBackup({plan,apiKey:process.env.KOMODO_API_KEY,apiSecret:process.env.KOMODO_API_SECRET,
      signal:abort.signal,onProgress:async value=>writeFile(output,JSON.stringify(value,null,2)+'\n',{mode:0o600})})
    await writeFile(output,JSON.stringify(receipt,null,2)+'\n',{mode:0o600})
    console.log(JSON.stringify({status:receipt.status,success:receipt.success,updateId:receipt.updateId,migrationRehearsal:'not-performed'}))
    if(!receipt.success)process.exitCode=1
  } finally {process.off('SIGINT',stop);process.off('SIGTERM',stop)}
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) main().catch(error=>{
  // Only fixed, non-secret diagnostic classes can be emitted.
  const message=error instanceof Error&&/^Backup operation (outcome uncertain|not submitted);/.test(error.message)
    ?error.message:'Backup preparation or verification failed; inspect the private plan/receipt and known update before retrying'
  console.error(message);process.exitCode=1
})
