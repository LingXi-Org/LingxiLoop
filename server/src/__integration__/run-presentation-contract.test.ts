import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { Pool } from 'pg'
import { createLingxiOS } from '@lyyzka/lingxios'
import { assertMigrationsCurrent, migrateDatabase } from '../db/migrate.js'
import { bindProductRun, readRunPresentationVersion, inheritedRunPresentationVersion } from '../agent-runtime/identity.js'
import { RunStreamProjection, readRunProjection } from '../agent-runtime/assistant-transport.js'
import { activityAnnotation } from '../../../src/lib/runActivity.js'

// Failure model: docs/evidence/issue-304/PRODUCT54-FAILURE-MODEL.md.
test('product54 migration and persisted host purpose preserve old/new/retry/tenant boundaries', { timeout: 90000 }, async () => {
  const source = new URL(process.env.INTEGRATION_DATABASE_URL!), name = `presentation54_${randomUUID().replaceAll('-', '')}_test`
  const adminUrl = new URL(source); adminUrl.pathname = '/postgres'
  const target = new URL(source); target.pathname = `/${name}`
  const admin = new Pool({ connectionString: adminUrl.toString(),max: 1 })
  await admin.query(`CREATE DATABASE ${name}`)
  const database = new Pool({ connectionString: target.toString(),max: 4 })
  const directory = await mkdtemp(join(tmpdir(), 'presentation53-')), oldUrl = pathToFileURL(`${directory}${sep}`)
  let api: Awaited<ReturnType<typeof createLingxiOS>> | undefined
  try {
    const migrations = new URL('../db/migrations/', import.meta.url)
    for (const file of await readdir(migrations)) if (Number(file.slice(0,4)) <= 53) await copyFile(new URL(file,migrations),join(directory,file))
    await migrateDatabase(database,oldUrl)
    await database.query(`INSERT INTO users(id,email,display_name) VALUES('human54','human54@example.test','Synthetic');
      INSERT INTO companies(id,name,slug,type,plan_id) VALUES('tenant54','Synthetic','tenant54','EDUCATION','plan-education');
      INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status) VALUES('agent54','tenant54','agent','Synthetic','A','#000','avail');
      INSERT INTO conversations(id,company_id,kind,title,members) VALUES('room54','tenant54','group','Synthetic','["human54","agent54"]');
      INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES('room54','tenant54','{"channelType":2,"members":["human54","agent54"]}');
      INSERT INTO agent_run_bindings(run_id,company_id,conversation_id,session_id,agent_id,principal_id,message_protocol)
        VALUES('old','tenant54','room54','session','agent54','human54',2)`)
    api = await createLingxiOS({ database,background: { role: 'passive' } })
    await api.conversations.sync({ tenantId: 'tenant54',conversationId: 'room54',version: 1,kind: 'group',owner: { id: 'human54',kind: 'participant' },
      participants: [{ id: 'human54',kind: 'human',capabilities: ['read','execute','control'] },{ id: 'agent54',kind: 'agent',capabilities: ['read','execute','speak'] }] })
    const input = (messageId: string) => ({ tenantId: 'tenant54',conversationId: 'room54',policyVersion: 1,messageId,version: 1,
      author: { id: 'human54',kind: 'human' as const },text: 'Synthetic request',mentions: ['agent54'] })
    const legacyAdmission = await api.conversations.ingest(input('legacy'))
    assert.equal(legacyAdmission.deduplicated,false)
    const history = (await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows
    const native = (await database.query('SELECT * FROM lingxios_installation')).rows
    await database.query(`CREATE FUNCTION reject54() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.version=54 THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject54 BEFORE INSERT ON schema_migrations FOR EACH ROW EXECUTE FUNCTION reject54()`)
    await assert.rejects(migrateDatabase(database),/migration 54_run_presentation_contract failed/)
    assert.equal((await database.query("SELECT 1 FROM information_schema.columns WHERE table_name='agent_run_bindings' AND column_name='presentation_version'")).rowCount,0)
    assert.deepEqual((await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows,history)
    await database.query('DROP TRIGGER reject54 ON schema_migrations; DROP FUNCTION reject54()')
    assert.deepEqual(await migrateDatabase(database),['0054_run_presentation_contract','0055_case_covers'])
    assert.deepEqual(await migrateDatabase(database),[])
    await assertMigrationsCurrent(database)
    await assert.rejects(assertMigrationsCurrent(database,oldUrl),/applied migration 54 has no matching file/)
    assert.deepEqual((await database.query('SELECT * FROM lingxios_installation')).rows,native)
    assert.deepEqual((await database.query('SELECT * FROM schema_migrations WHERE version<=53 ORDER BY version')).rows,history)
    assert.deepEqual((await database.query("SELECT is_nullable,column_default FROM information_schema.columns WHERE table_name='agent_run_bindings' AND column_name='presentation_version'")).rows,[{ is_nullable: 'YES',column_default: null }])
    const identity = { tenantId: 'tenant54',agentId: 'agent54',principalId: 'human54',sessionId: 'session',runId: 'old' }
    assert.equal(await readRunPresentationVersion(identity,database),undefined)
    await bindProductRun(database,identity,'room54',false,undefined,1)
    assert.equal(await readRunPresentationVersion(identity,database),undefined,'old NULL is immutable even if retried as new')
    const fresh = { ...identity,runId: 'fresh' }
    await bindProductRun(database,fresh,'room54',false,'source',1)
    await bindProductRun(database,fresh,'room54',false,'source')
    assert.equal(await readRunPresentationVersion(fresh,database),1)
    for (const changed of [{ tenantId: 'other' },{ principalId: 'other' },{ agentId: 'other' },{ sessionId: 'other' },{ threadId: 'other' }]) {
      assert.equal(await readRunPresentationVersion({ ...fresh,...changed },database),undefined)
      await assert.rejects(bindProductRun(database,{ ...fresh,...changed },'room54',false,'source',1),/binding changed/)
    }
    // Crash after ingest or context creating an unmarked binding first: retries stay conservative.
    const gap = { ...identity,runId: 'gap' }
    await bindProductRun(database,gap,'room54')
    await bindProductRun(database,gap,'room54',false,undefined,1)
    assert.equal(await readRunPresentationVersion(gap,database),undefined)
    const child = { id: 'child',tenantId: 'tenant54',principalId: 'human54',meta: { parentWorkId: 'fresh',rootWorkId: 'fresh' } }
    assert.equal(await inheritedRunPresentationVersion(database,child,'room54'),1)
    assert.equal(await inheritedRunPresentationVersion(database,{ ...child,principalId: 'other' },'room54'),undefined)
    assert.equal(await inheritedRunPresentationVersion(database,{ ...child,meta: { parentWorkId: 'old' } },'room54'),undefined)
    assert.equal(await inheritedRunPresentationVersion(database,child,'other-room'),undefined)
    const retryLegacy = await api.conversations.ingest(input('legacy'))
    assert.equal(retryLegacy.deduplicated,true)
    const actualNew = await api.conversations.ingest(input('new'))
    assert.equal(actualNew.deduplicated,false)
    const recordedAgent = await api.conversations.ingest({ ...input('recorded-agent'),author: { id: 'agent54',kind: 'agent' } })
    assert.equal(recordedAgent.reason,'agent_message')
    assert.deepEqual(recordedAgent.runs,[],'recordSentMessage has no trusted causedBy and cannot admit work')
    // Simulate process loss after successful native admission, before product bind.
    await api.conversations.ingest(input('crash'))
    const retryCrash = await api.conversations.ingest(input('crash'))
    assert.equal(retryCrash.deduplicated,true)
    // The existing routine API accepts the host transaction: admission and marker
    // either commit together or both disappear, unlike the IM callback gap.
    const job = { id: 'routine54',tenantId: 'tenant54',agentId: 'agent54',sessionId: 'routine54',principalId: 'human54',
      kind: 'routine',lane: 'background' as const,text: 'Synthetic routine',meta: { conversationId: 'room54' } }
    const jobIdentity = { ...identity,runId: job.id,sessionId: job.id }
    const transaction = await database.connect()
    try {
      await transaction.query('BEGIN')
      const admitted = await api.enqueueJob(job,transaction)
      assert.equal(admitted.deduplicated,false)
      await bindProductRun(transaction,jobIdentity,'room54',false,undefined,1)
      assert.equal(await readRunPresentationVersion(jobIdentity,transaction),1)
      await transaction.query('ROLLBACK')
      assert.equal(await api.readRun(jobIdentity),null)
      assert.equal(await readRunPresentationVersion(jobIdentity,database),undefined)
      await transaction.query('BEGIN')
      assert.equal((await api.enqueueJob(job,transaction)).deduplicated,false)
      await bindProductRun(transaction,jobIdentity,'room54',false,undefined,1)
      await transaction.query('COMMIT')
      assert.equal(await readRunPresentationVersion(jobIdentity,database),1)
    } finally { await transaction.query('ROLLBACK'); transaction.release() }
    for (const receipt of [retryLegacy,actualNew,retryCrash]) {
      const current = receipt.runs[0]; assert.ok(current)
      await bindProductRun(database,current,'room54',false,undefined,receipt.deduplicated ? undefined : 1)
      const version = await readRunPresentationVersion(current,database)
      const make = () => new RunStreamProjection(current.runId,true,current,version)
      const live = make()
      const state = await api.readRunState(current); assert.ok(state)
      live.advance({ type: 'state',state })
      for (let index=0; index<100; index++) {
        const events = [
          { runId: current.runId,seq: index*2+1,kind: 'tool.started' as const,stage: 'started' as const,visibility: 'user' as const,data: { toolCallId: `host:${index}`,name: 'memory.read' } },
          { runId: current.runId,seq: index*2+2,kind: 'tool.completed' as const,stage: 'completed' as const,visibility: 'user' as const,data: { toolCallId: `host:${index}`,result: { status: 'completed',value: { document: { id: `m${index}`,description: 'Public preference',version: 1,status: 'active',body: 'PRIVATE' } } } } },
        ]
        for (const event of events) {
          live.advance({ type: 'event',event })
          await database.query(`INSERT INTO lingxios.agent_run_events(run_id,tenant_id,agent_id,seq,kind,stage,visibility,data)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,[current.runId,current.tenantId,current.agentId,event.seq,event.kind,event.stage,event.visibility,JSON.stringify(event.data)])
        }
      }
      const replay = await readRunProjection(api,current,true,undefined,database)
      const reconnect = await readRunProjection(api,current,true,undefined,database)
      assert.deepEqual(replay.snapshot.message.content,live.snapshot.message.content)
      assert.deepEqual(reconnect.snapshot.message.content,replay.snapshot.message.content)
      const page = replay.activityPage(0)
      assert.equal(page.message.content.length,40)
      assert.equal(page.total,100)
      assert.equal(page.nextOffset,40)
      assert.deepEqual(reconnect.activityPage(40),replay.activityPage(40))
      for (const part of page.message.content) assert.equal(activityAnnotation(part)?.purpose,version === 1 ? 'process' : undefined)
      assert.doesNotMatch(JSON.stringify(page),/PRIVATE/)
    }
    await assert.rejects(database.query("UPDATE agent_run_bindings SET presentation_version=2 WHERE run_id='fresh'"),{ code: '23514' })
  } finally {
    await api?.stop(); await database.end(); await admin.query(`DROP DATABASE ${name}`); await admin.end(); await rm(directory,{ recursive: true,force: true })
  }
})
