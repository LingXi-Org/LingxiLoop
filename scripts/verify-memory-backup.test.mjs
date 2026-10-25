import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { buildMemoryBackupPlan, validateMemoryBackupPlan, parseMemoryBackupReceipt, executeMemoryBackup } from './verify-memory-backup.mjs'

const sourceSha = '2ea8615c17c9ed11b769c83c699719dc01c11ee4'
const hash = value => createHash('sha256').update(value).digest('hex')
const fixture = () => buildMemoryBackupPlan({ sourceSha,attempt: 'synthetic-unit',nonce: '0123456789abcdef' })

test('planning binds exact source and contains no candidate migration or remote call', async () => {
  const original = globalThis.fetch; globalThis.fetch = () => assert.fail('planning used network')
  try {
    const plan = await fixture()
    assert.equal(plan.source.productVersion,46); assert.equal(plan.source.runtime.runtime,'3.5.6')
    assert.equal(plan.source.runtime.schema,12); assert.equal(plan.source.migrations.length,46)
    assert.equal(plan.migrationRehearsal,'not-performed')
    assert.equal(plan.commandHash,hash(plan.command))
    assert.match(plan.command,/^exec timeout -k 75 3900 sh -ec /)
    const decoded = [...plan.command.matchAll(/[A-Za-z0-9+/=]{100,}/g)].map(match=>Buffer.from(match[0],'base64').toString()).join('\n')
    assert.match(decoded,/REPEATABLE READ READ ONLY/); assert.match(plan.command,/--snapshot=/)
    assert.match(plan.command,/--no-owner --no-privileges --exit-on-error/)
    assert.ok(plan.command.includes('pwd -P'), 'backup parent must resolve to its reviewed original-volume path')
    assert.ok(!plan.command.includes('INSERT INTO public.schema_migrations'))
    assert.ok(!plan.command.includes('im_visualize_'))
    await validateMemoryBackupPlan(plan)
  } finally { globalThis.fetch = original }
})

test('malformed identities and altered source or command fail before any remote call', async () => {
  for (const args of [{sourceSha:'main',attempt:'test'}, {sourceSha,attempt:'../unsafe'}, {sourceSha,attempt:'test',nonce:'x'}])
    await assert.rejects(buildMemoryBackupPlan(args))
  const plan = await fixture()
  for (const changed of [{...plan,command:plan.command+'\ntrue'}, {...plan,source:{...plan.source,productVersion:45}},
    {...plan,isolatedDatabase:'postgres'}, {...plan,backupDir:'/tmp/unowned'}]) await assert.rejects(validateMemoryBackupPlan(changed))
})

function completed(plan) {
  const counts = [['lingxios','schema_version',1],['public','lingxios_installation',1],['public','schema_migrations',46]]
  const receipt = {source:plan.source,commandHash:plan.commandHash,attempt:plan.attempt,
    dumpSha256:'a'.repeat(64),restoreCountsEqual:true,restoreProvenanceEqual:true,
    isolatedDatabaseRemoved:true,migrationRehearsal:'not-performed',countsBefore:counts,countsRestored:counts,
    capacity:[{phase:'initial',databaseBytes:100,freeBytes:600000000,requiredBytes:536871112},
      {phase:'restore',databaseBytes:100,freeBytes:600000000,requiredBytes:536871012}]}
  return { _id:{$oid:'a'.repeat(24)},status:'Complete',success:true,
    logs:[{stdout:`MEMORY_BACKUP_RECEIPT=${JSON.stringify(receipt)}\nMEMORY_BACKUP_COMPLETE=1\n`,stderr:'SECRET'}] }
}

test('receipt parser requires terminal success, consistent counts, and no duplicate markers', async () => {
  const plan=await fixture(), update=completed(plan)
  const result=parseMemoryBackupReceipt(plan,update)
  assert.equal(result.updateId,'a'.repeat(24)); assert.equal(result.migrationRehearsal,'not-performed')
  assert.ok(!JSON.stringify(result).includes('SECRET'))
  for(const changed of [{...update,status:'InProgress'},{...update,success:false},
    {...update,logs:[{stdout:update.logs[0].stdout+'MEMORY_BACKUP_COMPLETE=1\n'}]}])
    assert.throws(()=>parseMemoryBackupReceipt(plan,changed))
  const bad=completed(plan); bad.logs[0].stdout=bad.logs[0].stdout.replace('"restoreCountsEqual":true','"restoreCountsEqual":false')
  assert.throws(()=>parseMemoryBackupReceipt(plan,bad))
})

test('execution uses only reviewed fixed service operation and persists its update id', async () => {
  const plan=await fixture(), calls=[], receipts=[], original=globalThis.fetch
  globalThis.fetch=async (url,options)=>{calls.push({url:String(url),options});return Response.json(completed(plan))}
  try {
    const result=await executeMemoryBackup({plan,apiKey:'fixture-key',apiSecret:'fixture-secret',onProgress:async p=>receipts.push(p)})
    assert.equal(calls.length,1); assert.equal(calls[0].url,'https://ops.christmas1314.xyz/execute/RunStackService')
    const body=JSON.parse(calls[0].options.body)
    assert.deepEqual({...body,command:[]},{stack:'lingxiloop-core-state',service:'postgres',entrypoint:'sh',command:[],
      user:'postgres',no_tty:true,no_deps:true,detach:false,service_ports:false,pull:false})
    assert.equal(calls[0].options.redirect,'error'); assert.ok(receipts.some(p=>p.updateId===result.updateId))
    assert.ok(!JSON.stringify(result).includes('fixture-secret'))
  } finally {globalThis.fetch=original}
})

test('lost execute acknowledgement remains uncertain and is never retried', async () => {
  const plan=await fixture(), original=globalThis.fetch; let calls=0
  globalThis.fetch=async()=>{calls++; throw new Error('SECRET payload')}
  try {
    await assert.rejects(executeMemoryBackup({plan,apiKey:'fixture',apiSecret:'fixture'}), error=>
      /outcome uncertain/.test(error.message)&&!error.message.includes('SECRET')&&error.message.includes(plan.attempt))
    assert.equal(calls,1)
  } finally {globalThis.fetch=original}
})

test('pre-abort sends no request; cancellation after acceptance preserves update id without resubmission', async () => {
  const plan=await fixture(), original=globalThis.fetch, abort=new AbortController(); let calls=0
  abort.abort()
  globalThis.fetch=async()=>{calls++;return Response.json(completed(plan))}
  try { await assert.rejects(executeMemoryBackup({plan,apiKey:'fixture',apiSecret:'fixture',signal:abort.signal})); assert.equal(calls,0) }
  finally {globalThis.fetch=original}
  const during=new AbortController()
  globalThis.fetch=async()=>{calls++;return Response.json({...completed(plan),status:'InProgress'})}
  try {
    await assert.rejects(executeMemoryBackup({plan,apiKey:'fixture',apiSecret:'fixture',signal:during.signal,
      onProgress:async p=>{if(p.updateId)during.abort()}}),error=>/outcome uncertain/.test(error.message)&&error.message.includes('a'.repeat(24)))
    assert.equal(calls,1)
  } finally {globalThis.fetch=original}
})

test('overall timeout reaches the generated inner timeout group before killing cleanup', {timeout:5000}, async () => {
  const plan=await fixture(), directory=await mkdtemp(join(tmpdir(),'memory-backup-deadline-'))
  const marker=join(directory,'events')
  // Preserve the actual generated modes, shorten only durations and replace the
  // database command with a harmless child. This failed before --foreground.
  const outer=/^exec (timeout(?: --foreground)?) -k 75 3900 sh -ec /.exec(plan.command)?.[1]
  const inner=/stage=restore\n(timeout(?: --foreground)?) -k 10 1200 pg_restore /.exec(plan.command)?.[1]
  assert.ok(outer); assert.ok(inner)
  const command=`trap 'printf "cleanup\\n" >> "$MARKER"' EXIT
trap 'exit 1' HUP INT TERM
${inner} -k .1 2 sh -ec 'printf "%s" "$$" > "$MARKER.pid"; printf "child-start\\n" >> "$MARKER"; sleep 1; printf "child-finish\\n" >> "$MARKER"'
`
  try {
    const result=await new Promise((resolve,reject)=>{
      const child=spawn('sh',['-ec',`${outer} -k .1 .2 sh -ec "$1"`,'deadline-test',command],
        {env:{...process.env,MARKER:marker},stdio:'ignore'})
      child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}))
    })
    assert.notEqual(result.code,0)
    await delay(1100)
    const events=(await readFile(marker,'utf8')).trim().split('\n')
    assert.deepEqual(events,['child-start','cleanup'],'child must stop and cleanup must run after overall TERM')
    const pid=Number(await readFile(marker+'.pid','utf8'))
    const state=await readFile(`/proc/${pid}/stat`,'utf8').then(value=>/^\d+ \(.+\) (\S)/.exec(value)?.[1],error=>{
      if(error.code==='ENOENT')return 'absent';throw error
    })
    assert.ok(['absent','Z','X'].includes(state),'the child must no longer be executable')
  } finally {await rm(directory,{recursive:true,force:true})}
})

test('native13/product49 backup profile derives exact formal source and preserves snapshot/restore command',async()=>{
 const plan=await buildMemoryBackupPlan({sourceSha:'cf4a299bcfb44d7e7ed74a250ea1404588a4e901',profile:'native13-product49',attempt:'synthetic-native14',nonce:'0123456789abcdef'})
 assert.equal(plan.format,2);assert.equal(plan.profile,'native13-product49');assert.equal(plan.source.productVersion,49);assert.equal(plan.source.runtime.schema,13);assert.equal(plan.source.runtime.runtime,'3.5.8')
 assert.equal(plan.source.migrations.length,49);assert.match(plan.command,/--snapshot=/);assert.match(plan.command,/pg_restore/);await validateMemoryBackupPlan(plan)
 await assert.rejects(buildMemoryBackupPlan({sourceSha,profile:'native13-product49',attempt:'wrong-source'}))
 await assert.rejects(buildMemoryBackupPlan({sourceSha,profile:'arbitrary',attempt:'wrong-profile'}))
})
test('native13 backup exact Stack/operation and fresh terminal required; unknown read stops without retry',async()=>{
 const plan=await buildMemoryBackupPlan({sourceSha:'cf4a299bcfb44d7e7ed74a250ea1404588a4e901',profile:'native13-product49',attempt:'synthetic-native14',nonce:'0123456789abcdef'})
 for(const fault of [undefined,'wrong-target','wrong-operation','lost-reread','reread-time','reread-success']){
  const calls=[],original=globalThis.fetch
  globalThis.fetch=async(url)=>{
   const op=String(url).split('/').at(-1);calls.push(op)
   if(op==='GetStack')return Response.json({_id:{$oid:'b'.repeat(24)}})
   if(op==='GetUpdate'&&fault==='lost-reread')throw Error('SECRET')
   const u=completed(plan);u.logs[0].stdout=u.logs[0].stdout.replaceAll('["public","schema_migrations",46]','["public","schema_migrations",49]')
   return Response.json({...u,success:!(op==='GetUpdate'&&fault==='reread-success'),start_ts:100,end_ts:op==='GetUpdate'&&fault==='reread-time'?201:200,operation:fault==='wrong-operation'?'DeployStack':'RunStackService',target:{type:'Stack',id:(fault==='wrong-target'?'c':'b').repeat(24)}})
  }
  try{
   if(fault)await assert.rejects(executeMemoryBackup({plan,apiKey:'fixture',apiSecret:'fixture'}),e=>e.uncertain===true&&!e.message.includes('SECRET'))
   else {const r=await executeMemoryBackup({plan,apiKey:'fixture',apiSecret:'fixture'});assert.equal(r.success,true);assert.deepEqual(calls,['GetStack','RunStackService','GetUpdate'])}
   assert.equal(calls.filter(x=>x==='RunStackService').length,1)
  }finally{globalThis.fetch=original}
 }
})

test('native13 backup refuses undocumented nonterminal status without a poll or retry',async()=>{
 const plan=await buildMemoryBackupPlan({sourceSha:'cf4a299bcfb44d7e7ed74a250ea1404588a4e901',profile:'native13-product49',attempt:'synthetic-status',nonce:'0123456789abcdef'})
 const calls=[],original=globalThis.fetch,abort=new AbortController();let timer
 // The deadline protects a mistaken native poll, not offline Git validation.
 globalThis.fetch=async url=>{const op=String(url).split('/').at(-1);calls.push(op);if(op==='RunStackService')timer=setTimeout(()=>abort.abort(),1000);return Response.json(op==='GetStack'?{_id:{$oid:'b'.repeat(24)}}:{...completed(plan),operation:'RunStackService',target:{type:'Stack',id:'b'.repeat(24)},status:'Unknown'})}
 try{await assert.rejects(executeMemoryBackup({plan,apiKey:'fixture',apiSecret:'fixture',signal:abort.signal}),e=>e.uncertain===true);assert.equal(abort.signal.aborted,false);assert.deepEqual(calls,['GetStack','RunStackService'])}
 finally{clearTimeout(timer);globalThis.fetch=original}
})

test('source-bound backup contracts run in the existing deployment CI job with historical fixtures available',async()=>{
 const ci=await readFile(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8')
 assert.match(ci,/run: node --test [^\n]*scripts\/verify-memory-backup\.test\.mjs/)
 assert.match(ci,/fetch-depth: \$\{\{ matrix\.component == 'deploy-contract' && '0' \|\| '1' \}\}/)
})

test('native13 backup binds guarded Core identity before submission',async()=>{
 const plan=await buildMemoryBackupPlan({sourceSha:'cf4a299bcfb44d7e7ed74a250ea1404588a4e901',profile:'native13-product49',attempt:'synthetic-core',nonce:'0123456789abcdef'})
 const calls=[],original=globalThis.fetch
 globalThis.fetch=async url=>{const op=String(url).split('/').at(-1);calls.push(op);return Response.json(op==='GetStack'?{_id:{$oid:'b'.repeat(24)}}:{...completed(plan),operation:'RunStackService',target:{type:'Stack',id:'b'.repeat(24)}})}
 try{await assert.rejects(executeMemoryBackup({plan,apiKey:'fixture',apiSecret:'fixture',expectedStackId:'c'.repeat(24)}),e=>e.uncertain===false);assert.deepEqual(calls,['GetStack'])}
 finally{globalThis.fetch=original}
})

test('cover55 source backup pins formal3.8.12 and full54 while preserving the snapshot/isolated restore interface',async()=>{
 const original=globalThis.fetch;globalThis.fetch=()=>assert.fail('offline backup planning used network');
 try{
  const plan=await buildMemoryBackupPlan({sourceSha:'213fb25312c81dfdeff12dea072d433c4de92f7a',profile:'native14-product54',attempt:'synthetic-cover55-unit',nonce:'0123456789abcdef'});
  assert.equal(plan.format,2);assert.equal(plan.source.productVersion,54);assert.equal(plan.source.runtime.runtime,'3.8.12');assert.equal(plan.source.runtime.schema,14);assert.equal(plan.source.migrations.length,54);
  assert.match(plan.command,/--snapshot=/);assert.match(plan.command,/--no-owner --no-privileges --exit-on-error/);assert.doesNotMatch(plan.command,/migrate-bin/);
  const decoded=[...plan.command.matchAll(/[A-Za-z0-9+/=]{100,}/g)].map(m=>Buffer.from(m[0],'base64').toString()).join('\n');assert.match(decoded,/REPEATABLE READ READ ONLY/);assert.match(decoded,/runtime_version='3.8.12'/);
  await validateMemoryBackupPlan(plan);
  const changed=structuredClone(plan);changed.source.migrations[0].checksum='0'.repeat(64);await assert.rejects(validateMemoryBackupPlan(changed));
  const update=completed(plan);update.logs[0].stdout=update.logs[0].stdout.replaceAll('["public","schema_migrations",46]','["public","schema_migrations",54]');assert.equal(parseMemoryBackupReceipt(plan,update).source.productVersion,54);
  update.logs[0].stdout=update.logs[0].stdout.replace('"restoreProvenanceEqual":true','"restoreProvenanceEqual":false');assert.throws(()=>parseMemoryBackupReceipt(plan,update));
  await assert.rejects(buildMemoryBackupPlan({sourceSha,profile:'native14-product54',attempt:'synthetic-wrong-runtime'}));
 }finally{globalThis.fetch=original}
});

test('homework56 source backup binds exact formal3.8.12 full55 and verifies the restored55 receipt',async()=>{
 const original=globalThis.fetch;globalThis.fetch=()=>assert.fail('offline backup planning used network');
 try{
  const plan=await buildMemoryBackupPlan({sourceSha:'9116dcb05eba30c76c81511e64ac9026730e6135',profile:'native14-product55',attempt:'synthetic-homework56-unit',nonce:'0123456789abcdef'});
  assert.equal(plan.format,2);assert.equal(plan.profile,'native14-product55');assert.equal(plan.source.productVersion,55);assert.equal(plan.source.migrations.length,55);assert.equal(plan.source.runtime.runtime,'3.8.12');assert.equal(plan.source.runtime.schema,14);assert.equal(plan.source.runtime.protocol,11);
  assert.match(plan.command,/--snapshot=/);assert.match(plan.command,/--no-owner --no-privileges --exit-on-error/);assert.doesNotMatch(plan.command,/migrate-bin/);await validateMemoryBackupPlan(plan);
  const changed=structuredClone(plan);changed.source.migrations[54].checksum='0'.repeat(64);await assert.rejects(validateMemoryBackupPlan(changed));
  const update=completed(plan);update.logs[0].stdout=update.logs[0].stdout.replaceAll('["public","schema_migrations",46]','["public","schema_migrations",55]');assert.equal(parseMemoryBackupReceipt(plan,update).source.productVersion,55);
  update.logs[0].stdout=update.logs[0].stdout.replace('"restoreProvenanceEqual":true','"restoreProvenanceEqual":false');assert.throws(()=>parseMemoryBackupReceipt(plan,update));
  await assert.rejects(buildMemoryBackupPlan({sourceSha:'213fb25312c81dfdeff12dea072d433c4de92f7a',profile:'native14-product55',attempt:'synthetic-wrong-product'}));
 }finally{globalThis.fetch=original}
});


test('soft57 source backup restores exact formal3.8.12 product56 without a target migration',async()=>{
 const original=globalThis.fetch;globalThis.fetch=()=>assert.fail('offline source56 backup used network');
 try{const plan=await buildMemoryBackupPlan({sourceSha:'192f110e56659cb2a6ce40f1ca52200ea1c00064',profile:'native14-product56',attempt:'synthetic-soft57-unit',nonce:'0123456789abcdef'});assert.equal(plan.profile,'native14-product56');assert.equal(plan.source.productVersion,56);assert.equal(plan.source.migrations.length,56);assert.equal(plan.source.runtime.runtime,'3.8.12');assert.equal(plan.source.runtime.schema,14);assert.equal(plan.source.runtime.protocol,11);assert.match(plan.command,/--snapshot=/);assert.doesNotMatch(plan.command,/migrate-bin/);await validateMemoryBackupPlan(plan);const changed=structuredClone(plan);changed.source.migrations[55].checksum='0'.repeat(64);await assert.rejects(validateMemoryBackupPlan(changed));const update=completed(plan);update.logs[0].stdout=update.logs[0].stdout.replaceAll('["public","schema_migrations",46]','["public","schema_migrations",56]');assert.equal(parseMemoryBackupReceipt(plan,update).source.productVersion,56);await assert.rejects(buildMemoryBackupPlan({sourceSha:'9116dcb05eba30c76c81511e64ac9026730e6135',profile:'native14-product56',attempt:'synthetic-wrong-source'}));}finally{globalThis.fetch=original}
});
