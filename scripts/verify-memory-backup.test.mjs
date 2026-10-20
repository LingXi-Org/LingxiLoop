import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
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
