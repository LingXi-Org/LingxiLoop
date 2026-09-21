import assert from 'node:assert/strict'
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import test from 'node:test'
import { releaseVersions } from '@lyyzka/lingxios'
import { assertMigrationsCurrent, migrateDatabase } from '../db/migrate.js'
import { STARTER_TEAM } from '../modules/learning/preset.js'
import { TEACHER_PROMPT } from '../modules/learning/teacher-preset.js'

const baselineUrl = new URL('../db/migrations/0001_v1_baseline.sql', import.meta.url)
const legacyCleanupUrl = new URL('../db/migrations/0002_remove_legacy_identity.sql', import.meta.url)
const affinityUrl = new URL('../db/migrations/0003_agent_os_session_affinity.sql', import.meta.url)
const personalOwnerUrl = new URL('../db/migrations/0004_backfill_personal_owner_participants.sql', import.meta.url)

async function restoreSchema10(database: Pool, version: string): Promise<void> {
  await database.query(`DROP TABLE lingxios.agent_workspace_checkpoints;
    ALTER TABLE lingxios.agent_steps DROP COLUMN workspace_checkpoint;
    UPDATE lingxios.schema_version SET version=10 WHERE singleton`)
  await database.query(`UPDATE lingxios_installation SET runtime_version=$1,schema_version=10,protocol_version=$2,
    schema_sha256='94f58c7133a39a9a847f5829b6946292a105bc92e573c5e8c04e7699aeb80072'`,
    [version, version === '3.2.13' ? 10 : 9])
}

async function withDatabase(run: (database: Pool, connectionString: string) => Promise<void>): Promise<void> {
  const source = new URL(process.env.INTEGRATION_DATABASE_URL!)
  const databaseName = `lingxiloop_migration_${randomUUID().replaceAll('-', '')}`
  const adminUrl = new URL(source)
  adminUrl.pathname = '/postgres'
  const targetUrl = new URL(source)
  targetUrl.pathname = `/${databaseName}`
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 })
  await admin.query(`CREATE DATABASE ${databaseName}`)
  const database = new Pool({ connectionString: targetUrl.toString(), max: 4 })
  try {
    await run(database, targetUrl.toString())
  } finally {
    await database.end()
    await admin.query(`DROP DATABASE ${databaseName}`)
    await admin.end()
  }
}

async function withMigrations(run: (url: URL, directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'lingxiloop-migrations-'))
  await copyFile(baselineUrl, join(directory, '0001_v1_baseline.sql'))
  try {
    await run(pathToFileURL(`${directory}${sep}`), directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('an empty database reaches the latest schema once and repeated migration is a no-op', async () => {
  await withDatabase(async (database) => {
    assert.deepEqual(await migrateDatabase(database), ['0001_v1_baseline', '0002_remove_legacy_identity', '0003_agent_os_session_affinity', '0004_backfill_personal_owner_participants', '0005_lingxios_v2_reset', '0006_observable_live_eval', '0007_install_lingxios', '0008_agent_os_execution', '0009_native_agent_tools', '0010_lingxios_native_runtime', '0011_closed_education', '0012_lingxios_3_2', '0013_native_collaboration', '0014_profile_avatars', '0015_lingxios_3_2_6', '0016_lingxios_3_2_7','0017_lingxios_3_2_8','0018_lingxios_3_2_9','0019_agent_read_receipts','0020_lingxios_3_2_10','0021_lingxios_3_2_11','0022_lingxios_3_2_12','0023_lingxios_3_2_13','0024_lingxios_3_3_0','0025_lingxios_3_3_1','0026_lingxios_3_3_2','0027_learning_collaboration','0028_lingxios_3_3_4'])
    assert.deepEqual(await migrateDatabase(database), [])
    await assertMigrationsCurrent(database)
    const { rows } = await database.query('SELECT version,name FROM schema_migrations ORDER BY version')
    assert.deepEqual(rows, [
      { version: 1, name: 'v1_baseline' },
      { version: 2, name: 'remove_legacy_identity' },
      { version: 3, name: 'agent_os_session_affinity' },
      { version: 4, name: 'backfill_personal_owner_participants' },
      { version: 5, name: 'lingxios_v2_reset' },
      { version: 6, name: 'observable_live_eval' },
      { version: 7, name: 'install_lingxios' },
      { version: 8, name: 'agent_os_execution' },
      { version: 9, name: 'native_agent_tools' },
      { version: 10, name: 'lingxios_native_runtime' },
      { version: 11, name: 'closed_education' },
      { version: 12, name: 'lingxios_3_2' },
      { version: 13, name: 'native_collaboration' },
      { version: 14, name: 'profile_avatars' },
      { version: 15, name: 'lingxios_3_2_6' },
      { version: 16, name: 'lingxios_3_2_7' },
      { version: 17, name: 'lingxios_3_2_8' },
      { version: 18, name: 'lingxios_3_2_9' },
      { version: 19, name: 'agent_read_receipts' },
      { version: 20, name: 'lingxios_3_2_10' },
      { version: 21, name: 'lingxios_3_2_11' },
      { version: 22, name: 'lingxios_3_2_12' },
      { version: 23, name: 'lingxios_3_2_13' },
      { version: 24, name: 'lingxios_3_3_0' },
      { version: 25, name: 'lingxios_3_3_1' },
      { version: 26, name: 'lingxios_3_3_2' },
      { version: 27, name: 'learning_collaboration' },
      { version: 28, name: 'lingxios_3_3_4' },
    ])
    const { rows: evalSchema } = await database.query(`SELECT
      to_regclass('public.eval_jobs') AS jobs,
      to_regclass('public.eval_gate_policies') AS policies,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='eval_cases' AND column_name='scenario_key') AS scenario_key`)
    assert.deepEqual(evalSchema, [{ jobs: 'eval_jobs', policies: 'eval_gate_policies', scenario_key: true }])
    const { rows: runtimeSchema } = await database.query(`SELECT
      (SELECT version FROM lingxios.schema_version WHERE singleton) AS version,
      to_regclass('public.approvals') AS legacy_approvals, to_regclass('public.agent_work_items') AS legacy_queue,
      to_regclass('lingxios.agent_conversations') AS conversations,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='lingxios'
        AND table_name='agent_work_items' AND column_name='strategy_snapshot') AS strategy_snapshot`)
    assert.deepEqual(runtimeSchema, [{ version: releaseVersions.schema, legacy_approvals: null, legacy_queue: null,
      conversations: 'lingxios.agent_conversations', strategy_snapshot: true }])
    await database.query("UPDATE lingxios_installation SET schema_sha256=repeat('0',64)")
    await assert.rejects(assertMigrationsCurrent(database), /package\/schema mismatch/)

  })
})

test('collaboration upgrade preserves managed IDs, custom rooms and leaders while expanding default teams', async () => {
  await withDatabase(async database => {
    await migrateDatabase(database)
    const { ensureEducationPlan } = await import('../modules/entitlements/public.js')
    await ensureEducationPlan(database)
    await database.query(`DELETE FROM schema_migrations WHERE version>=27;
      INSERT INTO users(id,email,display_name) VALUES('upgrade-owner','collaboration@example.test','Teacher');
      INSERT INTO companies(id,name,slug,type,plan_id) VALUES('collab-upgrade','Upgrade','collab-upgrade','EDUCATION','plan-education');
      INSERT INTO projects(id,company_id,kind,name,created_by) VALUES('upgrade-project','collab-upgrade','INSTITUTIONAL_COURSE','Course','upgrade-owner');
      INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,preset_key,capabilities,system_prompt,status)
        SELECT 'old-'||key,'collab-upgrade','agent',key,'X','#000',key,'[]'::jsonb,'old prompt','avail'
        FROM unnest(ARRAY['nova','sage','milo','trace','scout','forge']) AS key;
      INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,system_prompt,status)
        VALUES('custom-nova','collab-upgrade','agent','Nova','N','#000','custom prompt','avail'),
              ('old-pulse','collab-upgrade','agent','Pulse · Course','P','#000','old teacher prompt','avail');
      INSERT INTO learning_project_teacher_agents(project_id,company_id,agent_id,preset_version)
        VALUES('upgrade-project','collab-upgrade','old-pulse',2);
      INSERT INTO conversations(id,company_id,project_id,kind,title,members,leader_id,preset_key)
        VALUES('old-study','collab-upgrade','upgrade-project','group','Study','["upgrade-owner","old-nova"]','old-nova','room:study-room'),
              ('old-lab','collab-upgrade','upgrade-project','group','Lab','["upgrade-owner","old-forge"]','old-forge','room:lab'),
              ('course-study','collab-upgrade','upgrade-project','group','Course room','["upgrade-owner","old-nova"]','old-nova',NULL),
              ('custom-room','collab-upgrade','upgrade-project','group','Custom','["upgrade-owner","old-sage"]','old-sage',NULL);
      INSERT INTO courses(id,company_id,project_id,created_by,study_room_conversation_id)
        VALUES('upgrade-course','collab-upgrade','upgrade-project','upgrade-owner','course-study');
      INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id)
        SELECT id,company_id,jsonb_build_object('members',members,'channelType',2),leader_id FROM conversations WHERE company_id='collab-upgrade'`)
    assert.deepEqual(await migrateDatabase(database),['0027_learning_collaboration','0028_lingxios_3_3_4'])
    for (const preset of STARTER_TEAM) {
      const agent = (await database.query('SELECT name,initial,role,system_prompt,capabilities FROM participants WHERE id=$1',[`old-${preset.presetKey}`])).rows[0]
      assert.deepEqual(agent,{ name: preset.name,initial: preset.initial,role: preset.role,system_prompt: preset.systemPrompt,capabilities: preset.capabilities })
    }
    assert.deepEqual((await database.query("SELECT name,system_prompt FROM participants WHERE id='custom-nova'")).rows,[{ name: 'Nova',system_prompt: 'custom prompt' }])
    assert.deepEqual((await database.query("SELECT name,initial,system_prompt FROM participants WHERE id='old-pulse'")).rows,
      [{ name: '望远',initial: '望',system_prompt: TEACHER_PROMPT }])
    for (const room of (await database.query(`SELECT room.id,room.members,room.leader_id,channel.profile->'members' AS im_members
      FROM conversations room JOIN im_channel_bindings channel ON channel.channel_id=room.id WHERE room.company_id='collab-upgrade'`)).rows) {
      assert.deepEqual(room.im_members,room.members)
      assert.equal(room.leader_id,room.id === 'old-lab' ? 'old-forge' : room.id === 'custom-room' ? 'old-sage' : 'old-nova')
      assert.deepEqual(new Set(room.members),new Set(room.id === 'custom-room' ? ['upgrade-owner','old-sage'] : ['upgrade-owner',...STARTER_TEAM.map(agent => `old-${agent.presetKey}`)]))
    }
    assert.deepEqual(await migrateDatabase(database),[])
    await assertMigrationsCurrent(database)
  })
})

test('earlier 3.2 versions upgrade only runtime registration and preserve existing data', async () => {
  for (const version of ['3.2.4','3.2.6','3.2.8','3.2.9','3.2.10','3.2.11','3.2.12']) await withDatabase(async database => {
    await migrateDatabase(database)
    await database.query('DELETE FROM schema_migrations WHERE version>=$1',[version === '3.2.4' ? 15 : version === '3.2.6' ? 16 : version === '3.2.8' ? 18 : version === '3.2.9' ? 20 : version === '3.2.10' ? 21 : version === '3.2.11' ? 22 : 23])
    await restoreSchema10(database, version)
    await database.query("INSERT INTO users(id,email,display_name) VALUES('preserved-user','preserved@example.test','Preserved')")
    assert.deepEqual(await migrateDatabase(database),[...version === '3.2.4' ? ['0015_lingxios_3_2_6'] : [],
      ...['3.2.4','3.2.6'].includes(version) ? ['0016_lingxios_3_2_7','0017_lingxios_3_2_8'] : [],
      ...!['3.2.9','3.2.10','3.2.11','3.2.12'].includes(version) ? ['0018_lingxios_3_2_9','0019_agent_read_receipts'] : [],
      ...!['3.2.10','3.2.11','3.2.12'].includes(version) ? ['0020_lingxios_3_2_10'] : [],
      ...!['3.2.11','3.2.12'].includes(version) ? ['0021_lingxios_3_2_11'] : [],
      ...version !== '3.2.12' ? ['0022_lingxios_3_2_12'] : [],'0023_lingxios_3_2_13','0024_lingxios_3_3_0','0025_lingxios_3_3_1','0026_lingxios_3_3_2','0027_learning_collaboration','0028_lingxios_3_3_4'])
    assert.deepEqual(await migrateDatabase(database),[])
    await assertMigrationsCurrent(database)
    assert.deepEqual((await database.query('SELECT schema_version,protocol_version FROM lingxios_installation')).rows,
      [{ schema_version: releaseVersions.schema, protocol_version: releaseVersions.controlPlane }])
    assert.deepEqual((await database.query("SELECT id FROM users WHERE id='preserved-user'")).rows,[{ id: 'preserved-user' }])
  })
})

test('read receipt upgrade preserves human receipts and accepts only same-tenant participants', async () => {
  await withDatabase(async database => {
    await migrateDatabase(database)
    const { ensureEducationPlan } = await import('../modules/entitlements/public.js')
    await ensureEducationPlan(database)
    await database.query(`ALTER TABLE im_read_receipt_advances DROP CONSTRAINT im_read_receipt_reader_company_fkey,
      ADD CONSTRAINT im_read_receipt_reader_company_fkey FOREIGN KEY (company_id,reader_id)
      REFERENCES company_memberships(company_id,user_id) ON DELETE CASCADE;
      DELETE FROM schema_migrations WHERE version>=19;
      UPDATE lingxios_installation SET runtime_version='3.3.0';
      INSERT INTO users(id,email,display_name) VALUES('reader','reader@example.test','Reader');
      INSERT INTO companies(id,name,slug,type,plan_id) VALUES('receipt-tenant','Receipts','receipts','EDUCATION','plan-education'),('other-tenant','Other','other','EDUCATION','plan-education');
      INSERT INTO company_memberships(company_id,user_id,role) VALUES('receipt-tenant','reader','TEACHER');
      INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status)
        VALUES('reader','receipt-tenant','human','Reader','R','#000','avail'),
          ('agent-reader','receipt-tenant','agent','Agent','A','#000','avail'),
          ('foreign-agent','other-tenant','agent','Other','O','#000','avail');
      INSERT INTO conversations(id,company_id,kind,title,members)
        VALUES('receipt-room','receipt-tenant','group','Receipts','["reader","agent-reader"]');
      INSERT INTO im_read_receipt_advances(company_id,channel_id,reader_id,previous_read_seq,read_through_seq)
        VALUES('receipt-tenant','receipt-room','reader',0,1)`)
    assert.deepEqual(await migrateDatabase(database), ['0019_agent_read_receipts','0020_lingxios_3_2_10','0021_lingxios_3_2_11','0022_lingxios_3_2_12','0023_lingxios_3_2_13','0024_lingxios_3_3_0','0025_lingxios_3_3_1','0026_lingxios_3_3_2','0027_learning_collaboration','0028_lingxios_3_3_4'])
    const { appendReadReceiptAdvance } = await import('../im/read-receipts-repository.js')
    await appendReadReceiptAdvance(database, { companyId: 'receipt-tenant', channelId: 'receipt-room', readerId: 'agent-reader', readThroughSeq: 2 })
    assert.deepEqual((await database.query('SELECT reader_id,read_through_seq::int FROM im_read_receipt_advances ORDER BY reader_id')).rows,
      [{ reader_id: 'agent-reader', read_through_seq: 2 }, { reader_id: 'reader', read_through_seq: 1 }])
    await assert.rejects(appendReadReceiptAdvance(database, { companyId: 'receipt-tenant', channelId: 'receipt-room', readerId: 'foreign-agent', readThroughSeq: 2 }),
      { code: '23503' })
    assert.deepEqual(await migrateDatabase(database), [])
  })
})

test('3.2.13 upgrades the workspace schema transactionally and repeats without changing product data', async () => {
  await withDatabase(async database => {
    await migrateDatabase(database)
    await database.query('DELETE FROM schema_migrations WHERE version>=24')
    await restoreSchema10(database, '3.2.13')
    await database.query("INSERT INTO users(id,email,display_name) VALUES('upgrade-user','upgrade@example.test','Preserved')")
    await assert.rejects(assertMigrationsCurrent(database), /run `npm run db:migrate`/)
    assert.deepEqual(await migrateDatabase(database), ['0024_lingxios_3_3_0','0025_lingxios_3_3_1','0026_lingxios_3_3_2','0027_learning_collaboration','0028_lingxios_3_3_4'])
    assert.deepEqual(await migrateDatabase(database), [])
    await assertMigrationsCurrent(database)
    assert.deepEqual((await database.query(`SELECT to_regclass('lingxios.agent_workspace_checkpoints') AS checkpoints,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='lingxios' AND table_name='agent_steps'
        AND column_name='workspace_checkpoint') AS step_checkpoint`)).rows,
    [{ checkpoints: 'lingxios.agent_workspace_checkpoints', step_checkpoint: true }])
    assert.deepEqual((await database.query("SELECT id FROM users WHERE id='upgrade-user'")).rows, [{ id: 'upgrade-user' }])
  })
})

for (const [version, pending] of [['3.3.0', 25], ['3.3.1', 26], ['3.3.2', 28]] as const) test(`${version} registers the runtime fixes without altering sessions or accepting an unverified schema`, async () => {
  await withDatabase(async database => {
    await migrateDatabase(database)
    await database.query('DELETE FROM schema_migrations WHERE version >= $1', [pending])
    await database.query('UPDATE lingxios_installation SET runtime_version=$1', [version])
    await database.query(`
      INSERT INTO users(id,email,display_name) VALUES('patch-user','patch@example.test','Preserved');
      INSERT INTO lingxios.agent_os_sessions(session_key,tenant_id,agent_id,session_id,history,summary,compaction_epoch)
        VALUES('patch-session','patch-tenant','patch-agent','patch-room','[{"role":"user","content":"Preserve history"}]','Earlier summary',2)`)
    const installation = (await database.query('SELECT * FROM lingxios_installation')).rows
    const sessions = (await database.query('SELECT * FROM lingxios.agent_os_sessions')).rows
    await database.query("UPDATE lingxios_installation SET schema_sha256=repeat('0',64)")
    await assert.rejects(migrateDatabase(database), /migration (?:25_lingxios_3_3_1|26_lingxios_3_3_2|28_lingxios_3_3_4) failed/)
    assert.deepEqual((await database.query('SELECT version FROM schema_migrations WHERE version >= $1', [pending])).rows, [])
    assert.deepEqual((await database.query('SELECT runtime_version FROM lingxios_installation')).rows, [{ runtime_version: version }])
    await database.query('UPDATE lingxios_installation SET schema_sha256=$1', [installation[0].schema_sha256])
    const schemaBefore = (await database.query(`SELECT table_name,column_name,data_type FROM information_schema.columns
      WHERE table_schema='lingxios' ORDER BY table_name,ordinal_position`)).rows
    await assert.rejects(assertMigrationsCurrent(database), /run `npm run db:migrate`/)
    assert.deepEqual(await migrateDatabase(database), [...pending === 25 ? ['0025_lingxios_3_3_1'] : [], ...pending <= 26 ? ['0026_lingxios_3_3_2','0027_learning_collaboration'] : [],'0028_lingxios_3_3_4'])
    assert.deepEqual(await migrateDatabase(database), [])
    await assertMigrationsCurrent(database)
    assert.deepEqual((await database.query('SELECT runtime_version,schema_version,protocol_version,schema_sha256 FROM lingxios_installation')).rows,
      [{ runtime_version: '3.3.4', schema_version: 11, protocol_version: 11, schema_sha256: installation[0].schema_sha256 }])
    assert.deepEqual((await database.query(`SELECT table_name,column_name,data_type FROM information_schema.columns
      WHERE table_schema='lingxios' ORDER BY table_name,ordinal_position`)).rows, schemaBefore)
    assert.deepEqual((await database.query("SELECT id FROM users WHERE id='patch-user'")).rows, [{ id: 'patch-user' }])
    assert.deepEqual((await database.query('SELECT * FROM lingxios.agent_os_sessions')).rows, sessions)
  })
})

test('the affinity migration backfills the most recent worker without changing the Home epoch', async () => {
  await withMigrations(async (migrationsUrl, directory) => {
    await copyFile(legacyCleanupUrl, join(directory, '0002_remove_legacy_identity.sql'))
    await withDatabase(async (database) => {
      await migrateDatabase(database, migrationsUrl)
      await database.query(
        `INSERT INTO companies(id,name,slug,type,plan_id)
         VALUES('migration-company','Migration','migration-company','EDUCATION','plan-education')`,
      )
      const sessionKey = 'migration-company:agent:channel:thread'
      await database.query(
        `INSERT INTO agent_os_sessions(session_key,company_id,agent_id,channel_id,thread_root_client_msg_no)
         VALUES($1,'migration-company','agent','channel','thread')`,
        [sessionKey],
      )
      await database.query(
        `INSERT INTO agent_work_items
           (id,company_id,agent_id,channel_id,thread_root_client_msg_no,trigger_client_msg_no,reason,status,leased_by,updated_at)
         VALUES
           ('migration-work-old','migration-company','agent','channel','thread','trigger-old','message','completed','agent-os-a',NOW()-INTERVAL '1 day'),
           ('migration-work-new','migration-company','agent','channel','thread','trigger-new','message','completed','agent-os-b',NOW())`,
      )
      await copyFile(affinityUrl, join(directory, '0003_agent_os_session_affinity.sql'))
      assert.deepEqual(await migrateDatabase(database, migrationsUrl), ['0003_agent_os_session_affinity'])
      const { rows } = await database.query(
        `SELECT session_key,worker_id,home_epoch FROM agent_os_session_routes`,
      )
      assert.deepEqual(rows, [{ session_key: sessionKey, worker_id: 'agent-os-b', home_epoch: '1' }])
    })
  })
})

test('native installation rejects old run data before historical reset migrations can change it', async () => {
  await withMigrations(async (migrationsUrl, directory) => {
    await copyFile(legacyCleanupUrl, join(directory, '0002_remove_legacy_identity.sql'))
    await copyFile(affinityUrl, join(directory, '0003_agent_os_session_affinity.sql'))
    await copyFile(personalOwnerUrl, join(directory, '0004_backfill_personal_owner_participants.sql'))
    await withDatabase(async database => {
      await migrateDatabase(database, migrationsUrl)
      await database.query(`INSERT INTO companies(id,name,slug,type,plan_id) VALUES('tenant','Test','test','EDUCATION','plan-education')`)
      await database.query(`INSERT INTO agent_work_items(id,company_id,agent_id,channel_id,trigger_client_msg_no,reason,status)
        VALUES('old-run','tenant','agent','room','old-message','message','leased')`)
      await assert.rejects(migrateDatabase(database), /requires an empty retired runtime/)
      assert.deepEqual((await database.query("SELECT id,status FROM agent_work_items")).rows, [{ id: 'old-run', status: 'leased' }])
      assert.deepEqual((await database.query('SELECT MAX(version) AS version FROM schema_migrations')).rows, [{ version: 4 }])
      assert.deepEqual((await database.query("SELECT to_regclass('lingxios.agent_work_items') AS queue")).rows, [{ queue: null }])
    })
  })
})

test('a non-empty database without migration history is rejected without mutation', async () => {
  await withDatabase(async (database) => {
    await database.query('CREATE TABLE legacy_data(id integer PRIMARY KEY)')
    await assert.rejects(migrateDatabase(database), /require an empty untracked public schema/)
    const { rows } = await database.query(`SELECT to_regclass('public.schema_migrations') AS migrations`)
    assert.deepEqual(rows, [{ migrations: null }])
  })
})

test('editing an applied migration is rejected by checksum', async () => {
  await withMigrations(async (migrationsUrl, directory) => {
    await withDatabase(async (database) => {
      await migrateDatabase(database, migrationsUrl)
      await writeFile(join(directory, '0001_v1_baseline.sql'), '-- changed after application\n')
      await assert.rejects(migrateDatabase(database, migrationsUrl), /checksum mismatch/)
    })
  })
})

test('a failed migration rolls back its DDL and history row', async () => {
  await withMigrations(async (migrationsUrl, directory) => {
    await withDatabase(async (database) => {
      await migrateDatabase(database, migrationsUrl)
      await writeFile(
        join(directory, '0002_failed_change.sql'),
        'CREATE TABLE should_rollback(id integer); SELECT missing_function();\n',
      )
      await assert.rejects(migrateDatabase(database, migrationsUrl), /migration 2_failed_change failed/)
      const { rows } = await database.query(
        `SELECT to_regclass('public.should_rollback') AS failed_table, COUNT(*)::int AS applied FROM schema_migrations`,
      )
      assert.deepEqual(rows, [{ failed_table: null, applied: 1 }])
    })
  })
})

test('concurrent migrators serialize and apply each migration once', async () => {
  await withDatabase(async (database, connectionString) => {
    const second = new Pool({ connectionString, max: 1 })
    try {
      const results = await Promise.all([migrateDatabase(database), migrateDatabase(second)])
      assert.deepEqual(results.map((result) => [...result]).sort((a, b) => b.length - a.length), [
        ['0001_v1_baseline', '0002_remove_legacy_identity', '0003_agent_os_session_affinity', '0004_backfill_personal_owner_participants', '0005_lingxios_v2_reset', '0006_observable_live_eval', '0007_install_lingxios', '0008_agent_os_execution', '0009_native_agent_tools', '0010_lingxios_native_runtime', '0011_closed_education', '0012_lingxios_3_2', '0013_native_collaboration', '0014_profile_avatars', '0015_lingxios_3_2_6', '0016_lingxios_3_2_7','0017_lingxios_3_2_8','0018_lingxios_3_2_9','0019_agent_read_receipts','0020_lingxios_3_2_10','0021_lingxios_3_2_11','0022_lingxios_3_2_12','0023_lingxios_3_2_13','0024_lingxios_3_3_0','0025_lingxios_3_3_1','0026_lingxios_3_3_2','0027_learning_collaboration','0028_lingxios_3_3_4'],
        [],
      ])
      const { rows } = await database.query('SELECT COUNT(*)::int AS count FROM schema_migrations')
    assert.deepEqual(rows, [{ count: 28 }])
    } finally {
      await second.end()
    }
  })
})

test('runtime readiness rejects pending migrations', async () => {
  await withMigrations(async (migrationsUrl, directory) => {
    await withDatabase(async (database) => {
      await migrateDatabase(database, migrationsUrl)
      await writeFile(join(directory, '0002_pending.sql'), 'SELECT 1;\n')
      await assert.rejects(assertMigrationsCurrent(database, migrationsUrl), /run `npm run db:migrate`/)
    })
  })
})

test('runtime readiness rejects a missing native collaboration table', async () => {
  await withDatabase(async database => {
    await migrateDatabase(database)
    await database.query('DROP TABLE lingxios.agent_memory_capture')
    await assert.rejects(assertMigrationsCurrent(database), /missing required tables/)
  })
})
