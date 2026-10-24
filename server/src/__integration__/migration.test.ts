import assert from 'node:assert/strict'
import { copyFile, readFile, readdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import test from 'node:test'
import { packageResources, releaseVersions } from '@lyyzka/lingxios'
import { assertMigrationsCurrent, migrateDatabase } from '../db/migrate.js'
import { STARTER_TEAM } from '../modules/learning/preset.js'
import { TEACHER_PROMPT, TEACHER_PRESET_VERSION } from '../modules/learning/teacher-preset.js'

const baselineUrl = new URL('../db/migrations/0001_v1_baseline.sql', import.meta.url)
const legacyCleanupUrl = new URL('../db/migrations/0002_remove_legacy_identity.sql', import.meta.url)
const affinityUrl = new URL('../db/migrations/0003_agent_os_session_affinity.sql', import.meta.url)
const personalOwnerUrl = new URL('../db/migrations/0004_backfill_personal_owner_participants.sql', import.meta.url)

// Recorded first: issue-247-skill-delivery/FAILURE-MODEL.md. Native14,
// provenance DDL and the product ledger must share the 0050 transaction.
test('0050 upgrades only schema13, preserves historical SQL and rolls native/provenance/ledger back together', async () => {
  await withDatabase(async database => {
    await withMigrationRange(49, async url => { await migrateDatabase(database,url) })
    assert.deepEqual((await database.query('SELECT runtime_version,schema_version FROM lingxios_installation')).rows,
      [{ runtime_version: '3.5.8',schema_version: 13 }])
    const history = (await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows
    const installed = (await database.query('SELECT * FROM lingxios_installation')).rows
    // A product-ledger failure happens after packaged native016 has executed.
    await database.query(`CREATE FUNCTION reject_migration50() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.version=50 THEN RAISE EXCEPTION 'injected ledger failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_migration50 BEFORE INSERT ON schema_migrations FOR EACH ROW EXECUTE FUNCTION reject_migration50()`)
    await assert.rejects(migrateDatabase(database), /migration 50_skill_delivery failed/)
    assert.deepEqual((await database.query('SELECT * FROM lingxios_installation')).rows,installed)
    assert.deepEqual((await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows,history)
    assert.equal((await database.query('SELECT version FROM lingxios.schema_version')).rows[0].version,13)
    assert.equal((await database.query(`SELECT to_regclass('lingxios.agent_skill_activations') name`)).rows[0].name,null)
    assert.equal((await database.query(`SELECT count(*)::int n FROM information_schema.columns
      WHERE table_name='im_visualize_documents' AND column_name='request_version'`)).rows[0].n,0)
    await database.query('DROP TRIGGER reject_migration50 ON schema_migrations; DROP FUNCTION reject_migration50()')
    assert.deepEqual(await migrateDatabase(database), ['0050_skill_delivery','0051_public_text_reader','0052_run_trace_provenance','0053_conversation_repair_provenance','0054_run_presentation_contract','0055_case_covers'])
    assert.deepEqual((await database.query('SELECT * FROM schema_migrations WHERE version<=49 ORDER BY version')).rows,history)
    assert.equal((await database.query('SELECT version FROM lingxios.schema_version')).rows[0].version,14)
    assert.equal((await database.query(`SELECT to_regclass('lingxios.agent_skill_activations') name`)).rows[0].name,'lingxios.agent_skill_activations')
    assert.deepEqual((await database.query(`SELECT is_nullable,data_type FROM information_schema.columns
      WHERE table_name='im_visualize_documents' AND column_name='request_version'`)).rows,[{ is_nullable: 'YES',data_type: 'integer' }])
    assert.deepEqual(await migrateDatabase(database), [])
    await assertMigrationsCurrent(database)
  })
})

// Upgrade failures to guard: existing PRIVATE/PROJECT rows changing scope, automatic
// publication of legacy content, null project escaping the case-only constraint,
// a case/source crossing organizations, and replaying an already-applied migration.
test('0045 preserves existing sources and adds explicit organization-only case scope exactly once', async () => {
  await withDatabase(async database => {
    const directory = await mkdtemp(join(tmpdir(), 'lingxiloop-schema44-'))
    const source = new URL('../db/migrations/', import.meta.url)
    try {
      for (const file of await readdir(source)) if (Number(file.slice(0, 4)) <= 44) await copyFile(new URL(file, source), join(directory, file))
      await migrateDatabase(database, pathToFileURL(`${directory}${sep}`))
    } finally { await rm(directory, { recursive: true, force: true }) }
    await database.query(`
      INSERT INTO users(id,email,display_name) VALUES('case-upgrade-teacher','case-upgrade@example.test','Teacher');
      INSERT INTO companies(id,name,slug,type,plan_id) VALUES
        ('case-upgrade','School','case-upgrade','EDUCATION','plan-education'),
        ('case-other','Other','case-other','EDUCATION','plan-education');
      INSERT INTO projects(id,company_id,kind,name,created_by)
        VALUES('case-course','case-upgrade','INSTITUTIONAL_COURSE','Course','case-upgrade-teacher');
      INSERT INTO knowledge_sources(id,company_id,project_id,kind,title,visibility_scope,owner_user_id,created_by_user_id,created_via)
        SELECT 'case-existing-'||scope,'case-upgrade','case-course','text','Existing source',scope,'case-upgrade-teacher','case-upgrade-teacher','USER'
          FROM unnest(ARRAY['PROJECT','PRIVATE']) scope`)
    const before = (await database.query('SELECT * FROM knowledge_sources ORDER BY id')).rows
    assert.deepEqual(await migrateDatabase(database), ['0045_organization_cases','0046_visualize','0047_memory_continuity','0048_native_content_documents','0049_conversation_list_removals','0050_skill_delivery','0051_public_text_reader','0052_run_trace_provenance','0053_conversation_repair_provenance','0054_run_presentation_contract','0055_case_covers'])
    assert.deepEqual((await database.query('SELECT id,company_id,project_id,title,visibility_scope FROM knowledge_sources ORDER BY id')).rows,
      before.map(({ id, company_id, project_id, title, visibility_scope }) => ({ id, company_id, project_id, title, visibility_scope })))
    assert.equal((await database.query('SELECT COUNT(*)::int AS n FROM organization_cases')).rows[0].n, 0)
    await assert.rejects(database.query("UPDATE knowledge_sources SET project_id=NULL WHERE id='case-existing-PRIVATE'"), { code: '23514' })
    await database.query(`INSERT INTO organization_cases(id,company_id,created_by,draft)
      VALUES('case-upgrade-article','case-upgrade','case-upgrade-teacher','{"title":"Draft"}')`)
    const insertSource = (id: string, company: string, version: number | null) => database.query(`
      INSERT INTO knowledge_sources(id,company_id,kind,title,visibility_scope,owner_user_id,created_by_user_id,created_via,case_id,case_version)
      VALUES($1,$2,'text','Case','COMPANY_CASE','case-upgrade-teacher','case-upgrade-teacher','USER','case-upgrade-article',$3)`, [id, company, version])
    await assert.rejects(insertSource('case-null-version', 'case-upgrade', null), { code: '23514' })
    await assert.rejects(insertSource('case-wrong-company', 'case-other', 1), { code: '23503' })
    await insertSource('case-valid-source', 'case-upgrade', 1)
    await assert.rejects(database.query("UPDATE knowledge_sources SET visibility_scope='PROJECT' WHERE id='case-valid-source'"), { code: '23514' })
    await assert.rejects(database.query("UPDATE organization_cases SET status='published' WHERE id='case-upgrade-article'"), { code: '23514' })
    await assert.rejects(database.query(`INSERT INTO organization_case_images(storage_key,case_id,company_id,created_by)
      VALUES('case-image','case-upgrade-article','case-other','case-upgrade-teacher')`), { code: '23503' })
    assert.deepEqual(await migrateDatabase(database), [])
    await assertMigrationsCurrent(database)
  })
})

// 0044 must not backfill questions, rewrite existing product/runtime rows, lose
// accepted answers on replay, or commit partial DDL/history when its SQL fails.
async function withMigrationRange<T>(through: number, run: (url: URL, directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'lingxiloop-questionnaire-migration-'))
  const source = new URL('../db/migrations/', import.meta.url)
  try {
    for (const file of await readdir(source)) if (Number(file.slice(0, 4)) <= through) {
      await copyFile(new URL(file, source), join(directory, file))
    }
    return await run(pathToFileURL(`${directory}${sep}`), directory)
  } finally { await rm(directory, { recursive: true, force: true }) }
}

test('0044 preserves product and runtime rows, starts empty and retains accepted answers on replay', async () => {
  await withDatabase(async database => {
    await withMigrationRange(43, async url => { await migrateDatabase(database, url) })
    await database.query(`INSERT INTO users(id,email,display_name) VALUES('human44','human44@example.test','Preserved');
      INSERT INTO companies(id,name,slug,type,plan_id) VALUES('tenant44','Preserved','tenant44','EDUCATION','plan-education');
      INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status)
        VALUES('agent44','tenant44','agent','Preserved','A','#000','avail');
      INSERT INTO conversations(id,company_id,kind,title,members)
        VALUES('room44','tenant44','group','Preserved','["human44","agent44"]');
      INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id)
        VALUES('room44','tenant44','{"channelType":2,"members":["human44","agent44"]}','agent44');
      INSERT INTO lingxios.agent_work_items(id,tenant_id,agent_id,principal_id,session_id,kind,lane,trigger_ref,status,meta)
        VALUES('work44','tenant44','agent44','human44','session44','turn','interactive','request44','waiting','{"text":"Preserve waiting work"}');
      INSERT INTO lingxios.agent_os_sessions(session_key,tenant_id,agent_id,session_id,history,summary,compaction_epoch)
        VALUES('session44','tenant44','agent44','session44','[{"role":"user","content":"Preserve history"}]','Preserved summary',2)`)
    const snapshot = async () => {
      const tables = ['users', 'companies', 'participants', 'conversations', 'im_channel_bindings',
        'lingxios.agent_work_items', 'lingxios.agent_os_sessions']
      return Promise.all(tables.map(async table => (await database.query(`SELECT to_jsonb(row) AS data FROM ${table} row ORDER BY to_jsonb(row)::text`)).rows))
    }
    const before = await snapshot()
    const history = (await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows
    assert.deepEqual(await migrateDatabase(database), ['0044_questionnaire_wait', '0045_organization_cases','0046_visualize','0047_memory_continuity','0048_native_content_documents','0049_conversation_list_removals','0050_skill_delivery','0051_public_text_reader','0052_run_trace_provenance','0053_conversation_repair_provenance','0054_run_presentation_contract','0055_case_covers'])
    assert.deepEqual(await snapshot(), before)
    assert.deepEqual((await database.query('SELECT * FROM schema_migrations WHERE version<=43 ORDER BY version')).rows, history)
    assert.deepEqual((await database.query('SELECT * FROM im_questionnaires')).rows, [])
    const index = (await database.query("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='im_questionnaires_pending_submission'")).rows[0]?.indexdef
    assert.match(index, /submission_retry_at/)
    assert.match(index, /answers IS NOT NULL.*submitted_at IS NULL/)
    await database.query(`INSERT INTO im_questionnaires(company_id,channel_id,question_id,run_id,request_version,
      agent_id,principal_id,session_id,payload,delivered_at,answers,submission_nonce,submission_payload,submission_attempts)
      VALUES('tenant44','room44','question44','work44',1,'agent44','human44','session44','{"title":"Preserved question"}',
        NOW(),'[{"id":"choice","value":"yes"}]','nonce44','{"kind":"continue","nonce":"nonce44"}',12)`)
    const question = (await database.query('SELECT * FROM im_questionnaires')).rows
    const applied = (await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows
    assert.deepEqual(await migrateDatabase(database), [])
    assert.deepEqual((await database.query('SELECT * FROM im_questionnaires')).rows, question)
    assert.deepEqual((await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows, applied)
    assert.deepEqual(await snapshot(), before)
    await assertMigrationsCurrent(database)
  })
})

for (const start of [42, 43]) test(`0044 failure from ${start} rolls back only its transaction and retains committed 0043`, async () => {
  await withDatabase(async database => {
    await withMigrationRange(start, async url => { await migrateDatabase(database, url) })
    await database.query("INSERT INTO users(id,email,display_name) VALUES('rollback44','rollback44@example.test','Preserved')")
    const user = (await database.query("SELECT * FROM users WHERE id='rollback44'")).rows
    const history = (await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows
    await withMigrationRange(44, async (url, directory) => {
      const file = join(directory, '0044_questionnaire_wait.sql')
      await writeFile(file, `${await readFile(file, 'utf8')}\nUPDATE users SET display_name='Must roll back' WHERE id='rollback44';\nSELECT missing_questionnaire_migration_function();\n`)
      await assert.rejects(migrateDatabase(database, url), /migration 44_questionnaire_wait failed/)
    })
    assert.deepEqual((await database.query(`SELECT to_regclass('public.im_questionnaires') AS questions,
      to_regclass('public.im_questionnaires_pending_submission') AS pending_index`)).rows,
    [{ questions: null, pending_index: null }])
    assert.deepEqual((await database.query("SELECT * FROM users WHERE id='rollback44'")).rows, user)
    assert.deepEqual((await database.query('SELECT * FROM schema_migrations WHERE version<=$1 ORDER BY version', [start])).rows, history)
    assert.deepEqual((await database.query('SELECT version,name FROM schema_migrations WHERE version>=43 ORDER BY version')).rows,
      [{ version: 43, name: 'lingxios_3_5_0' }])
    assert.equal((await database.query('SELECT version FROM lingxios.schema_version')).rows[0].version, 12)
    assert.equal((await database.query('SELECT runtime_version FROM lingxios_installation')).rows[0].runtime_version, '3.5.6')
    await assert.rejects(assertMigrationsCurrent(database), /run `npm run db:migrate`/)
    assert.deepEqual(await migrateDatabase(database), ['0044_questionnaire_wait', '0045_organization_cases','0046_visualize','0047_memory_continuity','0048_native_content_documents','0049_conversation_list_removals','0050_skill_delivery','0051_public_text_reader','0052_run_trace_provenance','0053_conversation_repair_provenance','0054_run_presentation_contract','0055_case_covers'])
    assert.deepEqual(await migrateDatabase(database), [])
    await assertMigrationsCurrent(database)
  })
})

test('0044 failure during fresh cutover rolls back all product and runtime installation', async () => {
  await withDatabase(async database => {
    await withMigrationRange(44, async (url, directory) => {
      const file = join(directory, '0044_questionnaire_wait.sql')
      await writeFile(file, `${await readFile(file, 'utf8')}\nSELECT missing_questionnaire_migration_function();\n`)
      await assert.rejects(migrateDatabase(database, url), /migration 44_questionnaire_wait failed/)
    })
    assert.deepEqual((await database.query(`SELECT to_regclass('public.users') AS users,
      to_regclass('public.im_questionnaires') AS questions,
      to_regclass('public.im_questionnaires_pending_submission') AS pending_index,
      to_regclass('public.lingxios_installation') AS installation,
      to_regclass('lingxios.agent_work_items') AS work,
      (SELECT COUNT(*)::int FROM schema_migrations) AS history`)).rows,
    [{ users: null, questions: null, pending_index: null, installation: null, work: null, history: 0 }])
    assert.equal((await migrateDatabase(database)).length, 55)
    assert.deepEqual((await database.query('SELECT * FROM im_questionnaires')).rows, [])
    assert.deepEqual(await migrateDatabase(database), [])
    await assertMigrationsCurrent(database)
  })
})

test('0043 preserves schema-11 work without backfilling notices and applies the published upgrade exactly once', async () => {
  await withDatabase(async database => {
    const directory = await mkdtemp(join(tmpdir(),'lingxiloop-schema42-'))
    const source = new URL('../db/migrations/',import.meta.url)
    try {
      for (const file of await readdir(source)) if (Number(file.slice(0,4)) <= 42) await copyFile(new URL(file,source),join(directory,file))
      await migrateDatabase(database,pathToFileURL(`${directory}${sep}`))
    } finally { await rm(directory,{ recursive: true,force: true }) }
    assert.equal((await database.query('SELECT version FROM lingxios.schema_version')).rows[0].version,11)
    await database.query(`INSERT INTO lingxios.agent_work_items(id,tenant_id,agent_id,principal_id,session_id,kind,lane,trigger_ref,status,meta)
      VALUES('historical-failed','tenant','agent','human','session','turn','interactive','request','failed','{"text":"preserved request"}');
      INSERT INTO users(id,email,display_name) VALUES('preserved-43','preserved-43@example.test','Preserved')`)
    const before = (await database.query("SELECT id,status,meta,result_id FROM lingxios.agent_work_items WHERE id='historical-failed'")).rows
    assert.deepEqual(await migrateDatabase(database),['0043_lingxios_3_5_0','0044_questionnaire_wait','0045_organization_cases','0046_visualize','0047_memory_continuity','0048_native_content_documents','0049_conversation_list_removals','0050_skill_delivery','0051_public_text_reader','0052_run_trace_provenance','0053_conversation_repair_provenance','0054_run_presentation_contract','0055_case_covers'])
    assert.deepEqual((await database.query("SELECT id,status,meta,result_id FROM lingxios.agent_work_items WHERE id='historical-failed'")).rows,before)
    assert.equal((await database.query('SELECT COUNT(*)::int AS n FROM lingxios.agent_terminal_outbox')).rows[0].n,0)
    assert.equal((await database.query("SELECT id FROM users WHERE id='preserved-43'")).rows.length,1)
    assert.equal((await database.query('SELECT version FROM lingxios.schema_version')).rows[0].version,releaseVersions.schema)
    assert.deepEqual(await migrateDatabase(database),[])
    await assertMigrationsCurrent(database)
  })
})

test('0043 refuses an active worker and rolls back all upgrade metadata', async () => {
  await withDatabase(async database => {
    const directory = await mkdtemp(join(tmpdir(),'lingxiloop-active43-'))
    const source = new URL('../db/migrations/',import.meta.url)
    try {
      for (const file of await readdir(source)) if (Number(file.slice(0,4)) <= 42) await copyFile(new URL(file,source),join(directory,file))
      await migrateDatabase(database,pathToFileURL(`${directory}${sep}`))
    } finally { await rm(directory,{ recursive: true,force: true }) }
    await database.query(`INSERT INTO lingxios.agent_work_items(id,tenant_id,agent_id,session_id,kind,lane,trigger_ref,status,lease_expires_at)
      VALUES('active-43','tenant','agent','session','turn','interactive','request','leased',NOW()+INTERVAL '1 minute')`)
    const before = (await database.query('SELECT * FROM lingxios_installation')).rows
    await assert.rejects(migrateDatabase(database), error => error instanceof Error && error.cause instanceof Error
      && /requires drained (?:workers|Web background work and Workers)/.test(error.cause.message))
    assert.deepEqual((await database.query('SELECT * FROM lingxios_installation')).rows,before)
    assert.equal((await database.query('SELECT MAX(version) AS version FROM schema_migrations')).rows[0].version,42)
    assert.equal((await database.query("SELECT to_regclass('lingxios.agent_terminal_outbox') AS outbox")).rows[0].outbox,null)
    await database.query("UPDATE lingxios.agent_work_items SET status='cancelled' WHERE id='active-43'")
    assert.deepEqual(await migrateDatabase(database),['0043_lingxios_3_5_0','0044_questionnaire_wait','0045_organization_cases','0046_visualize','0047_memory_continuity','0048_native_content_documents','0049_conversation_list_removals','0050_skill_delivery','0051_public_text_reader','0052_run_trace_provenance','0053_conversation_repair_provenance','0054_run_presentation_contract','0055_case_covers'])
    assert.deepEqual(await migrateDatabase(database),[])
  })
})

test('a failed fresh cutover rolls back packaged schema installation and product history together', async () => {
  await withDatabase(async database => {
    const directory = await mkdtemp(join(tmpdir(),'lingxiloop-atomic-cutover-'))
    const source = new URL('../db/migrations/',import.meta.url)
    try {
      for (const file of await readdir(source)) await copyFile(new URL(file,source),join(directory,file))
      const failure = join(directory,'0011_closed_education.sql')
      await writeFile(failure,`${await readFile(failure,'utf8')}\nSELECT missing_cutover_function();\n`)
      await assert.rejects(migrateDatabase(database,pathToFileURL(`${directory}${sep}`)),/migration 11_closed_education failed/)
      assert.deepEqual((await database.query(`SELECT to_regclass('public.users') AS users,
        to_regclass('lingxios.agent_work_items') AS work,(SELECT COUNT(*)::int FROM schema_migrations) AS history`)).rows,
      [{ users: null,work: null,history: 0 }])
    } finally { await rm(directory,{ recursive: true,force: true }) }
    assert.equal((await migrateDatabase(database)).length,55)
    await assertMigrationsCurrent(database)
  })
})

async function migrateThrough39(database: Pool) {
  const directory = await mkdtemp(join(tmpdir(), 'lingxiloop-schema39-'))
  const source = new URL('../db/migrations/', import.meta.url)
  try {
    for (const file of await readdir(source)) if (Number(file.slice(0,4)) <= 39) await copyFile(new URL(file,source),join(directory,file))
    return await migrateDatabase(database,pathToFileURL(`${directory}${sep}`))
  } finally { await rm(directory,{ recursive:true,force:true }) }
}

// These upgrade fixtures rewind an already-current database to historical schemas.
async function restoreSchema38(database: Pool): Promise<void> {
  await database.query(`ALTER TABLE agent_run_bindings DROP COLUMN source_client_msg_no;
    ALTER TABLE canvas_agent_assignments DROP COLUMN request_client_msg_no;
    DROP INDEX agent_native_canvas_request;
    DELETE FROM schema_migrations WHERE version>=39;
    UPDATE lingxios_installation SET runtime_version='3.3.8'`)
}

async function restoreSchema31(database: Pool): Promise<void> {
  await restoreSchema38(database)
  await database.query(`DROP TABLE agent_public_tool_activity, course_forum_flags, course_forum_comments, course_forum_posts,
      im_ui_user_states, im_ui_revisions;
    DROP INDEX learning_evidence_submission_files;
    ALTER TABLE learning_attempts DROP COLUMN source, DROP COLUMN submitted_by_agent,
      DROP COLUMN agent_work_id, DROP COLUMN late, DROP COLUMN submission_sequence;
    DELETE FROM schema_migrations WHERE version>=33;
    ALTER TABLE knowledge_sources DROP COLUMN origin_attachment_id;
    CREATE UNIQUE INDEX idx_knowledge_sources_origin_message
      ON knowledge_sources(company_id,conversation_id,origin_client_msg_no)
      WHERE origin_client_msg_no IS NOT NULL AND conversation_id IS NOT NULL AND deleted_at IS NULL;
    ALTER TABLE lingxios_ingress_outbox DROP COLUMN knowledge_source_ids;
    ALTER TABLE agent_run_bindings DROP COLUMN message_protocol;
    DELETE FROM schema_migrations WHERE version=32`)
}

async function restoreSchema10(database: Pool, version: string): Promise<void> {
  await database.query(`DROP TRIGGER IF EXISTS agent_work_terminal_feedback ON lingxios.agent_work_items;
    DROP TRIGGER IF EXISTS agent_work_release_budget_hold ON lingxios.agent_work_items;
    DROP FUNCTION IF EXISTS lingxios.capture_terminal_feedback();
    DROP FUNCTION IF EXISTS lingxios.release_child_budget_hold();
    DROP TABLE IF EXISTS lingxios.agent_skill_activations,lingxios.agent_terminal_outbox,lingxios.agent_model_budget_holds,lingxios.agent_budget_denials;
    ALTER TABLE lingxios.agent_work_items DROP COLUMN IF EXISTS terminal_reason;
    ALTER TABLE lingxios.agent_model_budgets DROP COLUMN IF EXISTS child_admission,DROP COLUMN IF EXISTS cumulative_execution;
    DROP TABLE lingxios.agent_workspace_checkpoints;
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
    assert.deepEqual(await migrateDatabase(database), ['0001_v1_baseline', '0002_remove_legacy_identity', '0003_agent_os_session_affinity', '0004_backfill_personal_owner_participants', '0005_lingxios_v2_reset', '0006_observable_live_eval', '0007_install_lingxios', '0008_agent_os_execution', '0009_native_agent_tools', '0010_lingxios_native_runtime', '0011_closed_education', '0012_lingxios_3_2', '0013_native_collaboration', '0014_profile_avatars', '0015_lingxios_3_2_6', '0016_lingxios_3_2_7','0017_lingxios_3_2_8','0018_lingxios_3_2_9','0019_agent_read_receipts','0020_lingxios_3_2_10','0021_lingxios_3_2_11','0022_lingxios_3_2_12','0023_lingxios_3_2_13','0024_lingxios_3_3_0','0025_lingxios_3_3_1','0026_lingxios_3_3_2','0027_learning_collaboration','0028_lingxios_3_3_4','0029_lingxios_3_3_5','0030_lingxios_3_3_6','0031_agent_capabilities','0032_native_message_attachments','0033_interactive_ui','0034_retire_email_calendar','0035_course_forum','0036_public_run_activity','0037_forum_comment_attachments','0038_learning_submission_sequence','0039_native_memory_collaboration','0040_forum_assignment_convergence','0041_homework_mastery','0042_forum_submission_evidence','0043_lingxios_3_5_0','0044_questionnaire_wait','0045_organization_cases','0046_visualize','0047_memory_continuity','0048_native_content_documents','0049_conversation_list_removals','0050_skill_delivery','0051_public_text_reader','0052_run_trace_provenance','0053_conversation_repair_provenance','0054_run_presentation_contract','0055_case_covers'])
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
      { version: 29, name: 'lingxios_3_3_5' },
      { version: 30, name: 'lingxios_3_3_6' },
      { version: 31, name: 'agent_capabilities' },
      { version: 32, name: 'native_message_attachments' },
      { version: 33, name: 'interactive_ui' },
      { version: 34, name: 'retire_email_calendar' },
      { version: 35, name: 'course_forum' },
      { version: 36, name: 'public_run_activity' },
      { version: 37, name: 'forum_comment_attachments' },
      { version: 38, name: 'learning_submission_sequence' },
      { version: 39, name: 'native_memory_collaboration' },
      { version: 40, name: 'forum_assignment_convergence' },
      { version: 41, name: 'homework_mastery' },
      { version: 42, name: 'forum_submission_evidence' },
      { version: 43, name: 'lingxios_3_5_0' },
      { version: 44, name: 'questionnaire_wait' },
      { version: 45, name: 'organization_cases' },
      { version: 46, name: 'visualize' },
      { version: 47, name: 'memory_continuity' },
      { version: 48, name: 'native_content_documents' },
      { version: 49, name: 'conversation_list_removals' },
      { version: 50, name: 'skill_delivery' },
      { version: 51, name: 'public_text_reader' },
      { version: 52, name: 'run_trace_provenance' },
      { version: 53, name: 'conversation_repair_provenance' },
      { version: 54, name: 'run_presentation_contract' },
      { version: 55, name: 'case_covers' },
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

test('group mention upgrade preserves customized preset profiles and retires only handoff grants', async () => {
  await withDatabase(async database => {
    await migrateThrough39(database)
    await restoreSchema38(database)
    await database.query(`INSERT INTO companies(id,name,slug,type,plan_id) VALUES('mentions-upgrade','Upgrade','mentions-upgrade','EDUCATION','plan-education');
      INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,preset_key,capabilities,system_prompt,status)
        VALUES('custom-preset','mentions-upgrade','agent','My name','M','#123456','nova','["canvas","handoffs","documents"]','My custom instructions','avail')`)
    assert.deepEqual(await migrateDatabase(database), ['0039_native_memory_collaboration','0040_forum_assignment_convergence','0041_homework_mastery','0042_forum_submission_evidence','0043_lingxios_3_5_0','0044_questionnaire_wait','0045_organization_cases','0046_visualize','0047_memory_continuity','0048_native_content_documents','0049_conversation_list_removals','0050_skill_delivery','0051_public_text_reader','0052_run_trace_provenance','0053_conversation_repair_provenance','0054_run_presentation_contract','0055_case_covers'])
    assert.deepEqual((await database.query(`SELECT name,initial,avatar_bg,system_prompt,capabilities FROM participants WHERE id='custom-preset'`)).rows,
      [{ name: 'My name', initial: 'M', avatar_bg: '#123456', system_prompt: 'My custom instructions', capabilities: ['canvas','documents'] }])
    assert.deepEqual(await migrateDatabase(database), [])
    await assertMigrationsCurrent(database)
  })
})

test('interactive UI upgrade preserves product rows and adds empty scoped state once', async () => {
  await withDatabase(async database => {
    await migrateThrough39(database)
    await restoreSchema38(database)
    await database.query(`DROP TABLE agent_public_tool_activity, course_forum_flags, course_forum_comments, course_forum_posts,
      im_ui_user_states, im_ui_revisions;
    DROP INDEX learning_evidence_submission_files;
    ALTER TABLE learning_attempts DROP COLUMN source, DROP COLUMN submitted_by_agent,
      DROP COLUMN agent_work_id, DROP COLUMN late, DROP COLUMN submission_sequence;
      DELETE FROM schema_migrations WHERE version>=33;
      INSERT INTO users(id,email,display_name) VALUES('ui-upgrade','ui-upgrade@example.test','Preserved')`)
    assert.deepEqual(await migrateDatabase(database), ['0033_interactive_ui','0034_retire_email_calendar','0035_course_forum','0036_public_run_activity','0037_forum_comment_attachments','0038_learning_submission_sequence','0039_native_memory_collaboration','0040_forum_assignment_convergence','0041_homework_mastery','0042_forum_submission_evidence','0043_lingxios_3_5_0','0044_questionnaire_wait','0045_organization_cases','0046_visualize','0047_memory_continuity','0048_native_content_documents','0049_conversation_list_removals','0050_skill_delivery','0051_public_text_reader','0052_run_trace_provenance','0053_conversation_repair_provenance','0054_run_presentation_contract','0055_case_covers'])
    assert.deepEqual((await database.query("SELECT id FROM users WHERE id='ui-upgrade'")).rows, [{ id: 'ui-upgrade' }])
    assert.deepEqual((await database.query(`SELECT
      (SELECT COUNT(*)::int FROM im_ui_revisions) AS revisions,
      (SELECT COUNT(*)::int FROM im_ui_user_states) AS states`)).rows, [{ revisions: 0, states: 0 }])
    assert.deepEqual(await migrateDatabase(database), [])
    await assertMigrationsCurrent(database)
  })
})

test('collaboration upgrade preserves managed IDs, custom rooms and leaders while expanding default teams', async () => {
  await withDatabase(async database => {
    await migrateThrough39(database)
    const { ensureEducationPlan } = await import('../modules/entitlements/public.js')
    await ensureEducationPlan(database)
    await restoreSchema31(database)
    await database.query(`DELETE FROM schema_migrations WHERE version>=27;
      UPDATE lingxios_installation SET runtime_version='3.3.2';
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
    assert.deepEqual(await migrateDatabase(database),['0027_learning_collaboration','0028_lingxios_3_3_4','0029_lingxios_3_3_5','0030_lingxios_3_3_6','0031_agent_capabilities','0032_native_message_attachments','0033_interactive_ui','0034_retire_email_calendar','0035_course_forum','0036_public_run_activity','0037_forum_comment_attachments','0038_learning_submission_sequence','0039_native_memory_collaboration','0040_forum_assignment_convergence','0041_homework_mastery','0042_forum_submission_evidence','0043_lingxios_3_5_0','0044_questionnaire_wait','0045_organization_cases','0046_visualize','0047_memory_continuity','0048_native_content_documents','0049_conversation_list_removals','0050_skill_delivery','0051_public_text_reader','0052_run_trace_provenance','0053_conversation_repair_provenance','0054_run_presentation_contract','0055_case_covers'])
    for (const preset of STARTER_TEAM) {
      const agent = (await database.query('SELECT name,initial,role,system_prompt,capabilities FROM participants WHERE id=$1',[`old-${preset.presetKey}`])).rows[0]
      // 0039 updates only exact historical presets to public-message collaboration.
      assert.ok(agent.system_prompt.startsWith(`You are ${preset.name},`))
      assert.ok(agent.system_prompt.includes('Publish concrete @id assignments in your native final reply'))
      const {system_prompt: _prompt,...identityAndGrants}=agent
      assert.deepEqual(identityAndGrants,{ name: preset.name,initial: preset.initial,role: preset.role,capabilities: [...preset.capabilities].sort() })
    }
    assert.deepEqual((await database.query("SELECT name,system_prompt FROM participants WHERE id='custom-nova'")).rows,[{ name: 'Nova',system_prompt: 'custom prompt' }])
    assert.deepEqual((await database.query("SELECT name,initial,system_prompt FROM participants WHERE id='old-pulse'")).rows,
      [{ name: '望远',initial: '望',system_prompt: TEACHER_PROMPT }])
    assert.deepEqual((await database.query("SELECT preset_version FROM learning_project_teacher_agents WHERE agent_id='old-pulse'")).rows,
      [{ preset_version: TEACHER_PRESET_VERSION }])
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
    await migrateThrough39(database)
    await restoreSchema31(database)
    await database.query('DELETE FROM schema_migrations WHERE version>=$1',[version === '3.2.4' ? 15 : version === '3.2.6' ? 16 : version === '3.2.8' ? 18 : version === '3.2.9' ? 20 : version === '3.2.10' ? 21 : version === '3.2.11' ? 22 : 23])
    await restoreSchema10(database, version)
    await database.query("INSERT INTO users(id,email,display_name) VALUES('preserved-user','preserved@example.test','Preserved')")
    assert.deepEqual(await migrateDatabase(database),[...version === '3.2.4' ? ['0015_lingxios_3_2_6'] : [],
      ...['3.2.4','3.2.6'].includes(version) ? ['0016_lingxios_3_2_7','0017_lingxios_3_2_8'] : [],
      ...!['3.2.9','3.2.10','3.2.11','3.2.12'].includes(version) ? ['0018_lingxios_3_2_9','0019_agent_read_receipts'] : [],
      ...!['3.2.10','3.2.11','3.2.12'].includes(version) ? ['0020_lingxios_3_2_10'] : [],
      ...!['3.2.11','3.2.12'].includes(version) ? ['0021_lingxios_3_2_11'] : [],
      ...version !== '3.2.12' ? ['0022_lingxios_3_2_12'] : [],'0023_lingxios_3_2_13','0024_lingxios_3_3_0','0025_lingxios_3_3_1','0026_lingxios_3_3_2','0027_learning_collaboration','0028_lingxios_3_3_4','0029_lingxios_3_3_5','0030_lingxios_3_3_6','0031_agent_capabilities','0032_native_message_attachments','0033_interactive_ui','0034_retire_email_calendar','0035_course_forum','0036_public_run_activity','0037_forum_comment_attachments','0038_learning_submission_sequence','0039_native_memory_collaboration','0040_forum_assignment_convergence','0041_homework_mastery','0042_forum_submission_evidence','0043_lingxios_3_5_0','0044_questionnaire_wait','0045_organization_cases','0046_visualize','0047_memory_continuity','0048_native_content_documents','0049_conversation_list_removals','0050_skill_delivery','0051_public_text_reader','0052_run_trace_provenance','0053_conversation_repair_provenance','0054_run_presentation_contract','0055_case_covers'])
    assert.deepEqual(await migrateDatabase(database),[])
    await assertMigrationsCurrent(database)
    assert.deepEqual((await database.query('SELECT schema_version,protocol_version FROM lingxios_installation')).rows,
      [{ schema_version: releaseVersions.schema, protocol_version: releaseVersions.controlPlane }])
    assert.deepEqual((await database.query("SELECT id FROM users WHERE id='preserved-user'")).rows,[{ id: 'preserved-user' }])
  })
})

test('read receipt upgrade preserves human receipts and accepts only same-tenant participants', async () => {
  await withDatabase(async database => {
    await migrateThrough39(database)
    const { ensureEducationPlan } = await import('../modules/entitlements/public.js')
    await ensureEducationPlan(database)
    await restoreSchema31(database)
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
    assert.deepEqual(await migrateDatabase(database), ['0019_agent_read_receipts','0020_lingxios_3_2_10','0021_lingxios_3_2_11','0022_lingxios_3_2_12','0023_lingxios_3_2_13','0024_lingxios_3_3_0','0025_lingxios_3_3_1','0026_lingxios_3_3_2','0027_learning_collaboration','0028_lingxios_3_3_4','0029_lingxios_3_3_5','0030_lingxios_3_3_6','0031_agent_capabilities','0032_native_message_attachments','0033_interactive_ui','0034_retire_email_calendar','0035_course_forum','0036_public_run_activity','0037_forum_comment_attachments','0038_learning_submission_sequence','0039_native_memory_collaboration','0040_forum_assignment_convergence','0041_homework_mastery','0042_forum_submission_evidence','0043_lingxios_3_5_0','0044_questionnaire_wait','0045_organization_cases','0046_visualize','0047_memory_continuity','0048_native_content_documents','0049_conversation_list_removals','0050_skill_delivery','0051_public_text_reader','0052_run_trace_provenance','0053_conversation_repair_provenance','0054_run_presentation_contract','0055_case_covers'])
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
    await migrateThrough39(database)
    await restoreSchema31(database)
    await database.query('DELETE FROM schema_migrations WHERE version>=24')
    await restoreSchema10(database, '3.2.13')
    await database.query("INSERT INTO users(id,email,display_name) VALUES('upgrade-user','upgrade@example.test','Preserved')")
    await assert.rejects(assertMigrationsCurrent(database), /run `npm run db:migrate`/)
    assert.deepEqual(await migrateDatabase(database), ['0024_lingxios_3_3_0','0025_lingxios_3_3_1','0026_lingxios_3_3_2','0027_learning_collaboration','0028_lingxios_3_3_4','0029_lingxios_3_3_5','0030_lingxios_3_3_6','0031_agent_capabilities','0032_native_message_attachments','0033_interactive_ui','0034_retire_email_calendar','0035_course_forum','0036_public_run_activity','0037_forum_comment_attachments','0038_learning_submission_sequence','0039_native_memory_collaboration','0040_forum_assignment_convergence','0041_homework_mastery','0042_forum_submission_evidence','0043_lingxios_3_5_0','0044_questionnaire_wait','0045_organization_cases','0046_visualize','0047_memory_continuity','0048_native_content_documents','0049_conversation_list_removals','0050_skill_delivery','0051_public_text_reader','0052_run_trace_provenance','0053_conversation_repair_provenance','0054_run_presentation_contract','0055_case_covers'])
    assert.deepEqual(await migrateDatabase(database), [])
    await assertMigrationsCurrent(database)
    assert.deepEqual((await database.query(`SELECT to_regclass('lingxios.agent_workspace_checkpoints') AS checkpoints,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='lingxios' AND table_name='agent_steps'
        AND column_name='workspace_checkpoint') AS step_checkpoint`)).rows,
    [{ checkpoints: 'lingxios.agent_workspace_checkpoints', step_checkpoint: true }])
    assert.deepEqual((await database.query("SELECT id FROM users WHERE id='upgrade-user'")).rows, [{ id: 'upgrade-user' }])
  })
})

for (const [version, pending] of [['3.3.0', 25], ['3.3.1', 26], ['3.3.2', 28], ['3.3.4', 29], ['3.3.5', 30]] as const) test(`${version} registers the runtime fixes without altering sessions or accepting an unverified schema`, async () => {
  await withDatabase(async database => {
    await migrateThrough39(database)
    await restoreSchema31(database)
    await database.query('DELETE FROM schema_migrations WHERE version >= $1', [pending])
    await database.query('UPDATE lingxios_installation SET runtime_version=$1', [version])
    await database.query(`
      INSERT INTO users(id,email,display_name) VALUES('patch-user','patch@example.test','Preserved');
      INSERT INTO lingxios.agent_os_sessions(session_key,tenant_id,agent_id,session_id,history,summary,compaction_epoch)
        VALUES('patch-session','patch-tenant','patch-agent','patch-room','[{"role":"user","content":"Preserve history"}]','Earlier summary',2)`)
    const installation = (await database.query('SELECT * FROM lingxios_installation')).rows
    const sessions = (await database.query('SELECT * FROM lingxios.agent_os_sessions')).rows
    await database.query("UPDATE lingxios_installation SET schema_sha256=repeat('0',64)")
    await assert.rejects(migrateDatabase(database), /migration (?:25_lingxios_3_3_1|26_lingxios_3_3_2|28_lingxios_3_3_4|29_lingxios_3_3_5|30_lingxios_3_3_6) failed/)
    assert.deepEqual((await database.query('SELECT version FROM schema_migrations WHERE version >= $1', [pending])).rows, [])
    assert.deepEqual((await database.query('SELECT runtime_version FROM lingxios_installation')).rows, [{ runtime_version: version }])
    await database.query('UPDATE lingxios_installation SET schema_sha256=$1', [installation[0].schema_sha256])
    const schemaBefore = (await database.query(`SELECT table_name,column_name,data_type FROM information_schema.columns
      WHERE table_schema='lingxios' ORDER BY table_name,ordinal_position`)).rows
    await assert.rejects(assertMigrationsCurrent(database), /run `npm run db:migrate`/)
    assert.deepEqual(await migrateDatabase(database), [...pending === 25 ? ['0025_lingxios_3_3_1'] : [], ...pending <= 26 ? ['0026_lingxios_3_3_2','0027_learning_collaboration'] : [], ...pending <= 28 ? ['0028_lingxios_3_3_4'] : [], ...pending <= 29 ? ['0029_lingxios_3_3_5'] : [],'0030_lingxios_3_3_6','0031_agent_capabilities','0032_native_message_attachments','0033_interactive_ui','0034_retire_email_calendar','0035_course_forum','0036_public_run_activity','0037_forum_comment_attachments','0038_learning_submission_sequence','0039_native_memory_collaboration','0040_forum_assignment_convergence','0041_homework_mastery','0042_forum_submission_evidence','0043_lingxios_3_5_0','0044_questionnaire_wait','0045_organization_cases','0046_visualize','0047_memory_continuity','0048_native_content_documents','0049_conversation_list_removals','0050_skill_delivery','0051_public_text_reader','0052_run_trace_provenance','0053_conversation_repair_provenance','0054_run_presentation_contract','0055_case_covers'])
    assert.deepEqual(await migrateDatabase(database), [])
    await assertMigrationsCurrent(database)
    assert.deepEqual((await database.query('SELECT runtime_version,schema_version,protocol_version,schema_sha256 FROM lingxios_installation')).rows,
      [{ runtime_version: releaseVersions.runtime, schema_version: releaseVersions.schema, protocol_version: releaseVersions.controlPlane,
        schema_sha256: createHash('sha256').update(await readFile(packageResources().schema)).digest('hex') }])
    const schemaAfter = (await database.query(`SELECT table_name,column_name,data_type FROM information_schema.columns
      WHERE table_schema='lingxios' ORDER BY table_name,ordinal_position`)).rows
    for (const column of schemaBefore) assert.ok(schemaAfter.some(after => after.table_name === column.table_name
      && after.column_name === column.column_name && after.data_type === column.data_type), `preserves ${column.table_name}.${column.column_name}`)
    assert.deepEqual((await database.query("SELECT id FROM users WHERE id='patch-user'")).rows, [{ id: 'patch-user' }])
    assert.deepEqual((await database.query('SELECT * FROM lingxios.agent_os_sessions')).rows, sessions)
  })
})

test('a historical recorded runtime patch repairs a stale LingxiOS schema before serving', async () => {
  await withMigrationRange(28, async migrationsUrl => {
    await withDatabase(async database => {
      await migrateDatabase(database, migrationsUrl)
      const fields='runtime_version,schema_version,protocol_version,schema_sha256'
      const installed=(await database.query(`SELECT ${fields} FROM lingxios_installation`)).rows
      const history=(await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows
      assert.equal(history.at(-1).version,28)
      await restoreSchema10(database, '3.3.4')
      await assert.rejects(assertMigrationsCurrent(database,migrationsUrl),/package\/schema mismatch/)
      assert.deepEqual(await migrateDatabase(database,migrationsUrl),[])
      await assertMigrationsCurrent(database,migrationsUrl)
      assert.deepEqual((await database.query(`SELECT ${fields} FROM lingxios_installation`)).rows,installed)
      assert.deepEqual((await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows,history)
      assert.equal((await database.query('SELECT version FROM lingxios.schema_version')).rows[0].version,11)
    })
  })
})

test('a recorded reader upgrade rejects damaged native state without changing provenance or history', async () => {
  await withDatabase(async database => {
    await migrateDatabase(database)
    await restoreSchema10(database, '3.3.4')
    const installed=(await database.query('SELECT * FROM lingxios_installation')).rows
    const history=(await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows
    const native=(await database.query('SELECT * FROM lingxios.schema_version')).rows
    assert.equal(history.at(-1).version,55)
    assert.equal(native[0].version,10)
    for(const operation of [()=>migrateDatabase(database),()=>assertMigrationsCurrent(database)]){
      await assert.rejects(operation,/package\/schema mismatch/)
      assert.deepEqual((await database.query('SELECT * FROM lingxios_installation')).rows,installed)
      assert.deepEqual((await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows,history)
      assert.deepEqual((await database.query('SELECT * FROM lingxios.schema_version')).rows,native)
    }
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
        ['0001_v1_baseline', '0002_remove_legacy_identity', '0003_agent_os_session_affinity', '0004_backfill_personal_owner_participants', '0005_lingxios_v2_reset', '0006_observable_live_eval', '0007_install_lingxios', '0008_agent_os_execution', '0009_native_agent_tools', '0010_lingxios_native_runtime', '0011_closed_education', '0012_lingxios_3_2', '0013_native_collaboration', '0014_profile_avatars', '0015_lingxios_3_2_6', '0016_lingxios_3_2_7','0017_lingxios_3_2_8','0018_lingxios_3_2_9','0019_agent_read_receipts','0020_lingxios_3_2_10','0021_lingxios_3_2_11','0022_lingxios_3_2_12','0023_lingxios_3_2_13','0024_lingxios_3_3_0','0025_lingxios_3_3_1','0026_lingxios_3_3_2','0027_learning_collaboration','0028_lingxios_3_3_4','0029_lingxios_3_3_5','0030_lingxios_3_3_6','0031_agent_capabilities','0032_native_message_attachments','0033_interactive_ui','0034_retire_email_calendar','0035_course_forum','0036_public_run_activity','0037_forum_comment_attachments','0038_learning_submission_sequence','0039_native_memory_collaboration','0040_forum_assignment_convergence','0041_homework_mastery','0042_forum_submission_evidence','0043_lingxios_3_5_0','0044_questionnaire_wait','0045_organization_cases','0046_visualize','0047_memory_continuity','0048_native_content_documents','0049_conversation_list_removals','0050_skill_delivery','0051_public_text_reader','0052_run_trace_provenance','0053_conversation_repair_provenance','0054_run_presentation_contract','0055_case_covers'],
        [],
      ])
      const { rows } = await database.query('SELECT COUNT(*)::int AS count FROM schema_migrations')
      assert.deepEqual(rows, [{ count: 55 }])
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


test('capability backfill preserves teacher grants, custom prompts and later revocations', async () => {
  await withDatabase(async database => {
    await migrateThrough39(database)
    await restoreSchema31(database)
    await database.query(`DELETE FROM schema_migrations WHERE version=31;
      INSERT INTO companies(id,name,slug,type,plan_id) VALUES('grants','Grants','grants','EDUCATION','plan-education');
      INSERT INTO projects(id,company_id,kind,name) VALUES('grant-project','grants','TEACHING','Course');
      INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status,capabilities,system_prompt)
      VALUES('ordinary','grants','agent','Ordinary','O','#000','avail','["documents"]','custom persona'),
        ('teacher','grants','agent','Teacher','T','#000','avail','["teacher_admin","knowledge"]','teacher persona');
      INSERT INTO learning_project_teacher_agents(project_id,company_id,agent_id) VALUES('grant-project','grants','teacher');`)
    assert.deepEqual(await migrateDatabase(database), ['0031_agent_capabilities','0032_native_message_attachments','0033_interactive_ui','0034_retire_email_calendar','0035_course_forum','0036_public_run_activity','0037_forum_comment_attachments','0038_learning_submission_sequence','0039_native_memory_collaboration','0040_forum_assignment_convergence','0041_homework_mastery','0042_forum_submission_evidence','0043_lingxios_3_5_0','0044_questionnaire_wait','0045_organization_cases','0046_visualize','0047_memory_continuity','0048_native_content_documents','0049_conversation_list_removals','0050_skill_delivery','0051_public_text_reader','0052_run_trace_provenance','0053_conversation_repair_provenance','0054_run_presentation_contract','0055_case_covers'])
    const read = async () => (await database.query('SELECT id,capabilities,system_prompt FROM participants WHERE company_id=$1 ORDER BY id', ['grants'])).rows
    const rows = await read()
    assert.equal(rows[0].system_prompt, 'custom persona')
    assert.deepEqual(rows[0].capabilities, [...STARTER_TEAM[0].capabilities].sort())
    assert.deepEqual(rows[1], { id: 'teacher', capabilities: ['teacher_admin','knowledge'], system_prompt: TEACHER_PROMPT })
    await database.query(`UPDATE participants SET capabilities='["documents"]' WHERE id='ordinary'`)
    assert.deepEqual(await migrateDatabase(database), [])
    assert.deepEqual((await read())[0].capabilities, ['documents'])
  })
})

// Populated upgrade exercises author/sequence/content preservation and restricted unmapped files.
test('forum convergence preserves complete submission history and rolls back ambiguous assignments', async () => {
  await withDatabase(async database => {
    await migrateThrough39(database)
    await database.query(`INSERT INTO users(id,email,display_name) VALUES ('teacher','teacher@migration.test','Teacher'),('student','student@migration.test','Student');
      INSERT INTO companies(id,name,slug,type,status,plan_id) VALUES('forum-migrate','Forum migration','forum-migrate','EDUCATION','ACTIVE','plan-education');
      INSERT INTO company_memberships(company_id,user_id,role) VALUES('forum-migrate','teacher','TEACHER'),('forum-migrate','student','STUDENT');
      INSERT INTO company_membership_periods(id,membership_id,role)
        SELECT 'period-'||user_id,id,role FROM company_memberships WHERE company_id='forum-migrate';
      UPDATE company_memberships SET period_id='period-'||user_id WHERE company_id='forum-migrate';
      INSERT INTO projects(id,company_id,name,kind,status,created_by,plan_id) VALUES('forum-project','forum-migrate','Forum','TEACHING','ACTIVE','teacher','plan-education');
      INSERT INTO project_memberships(company_id,project_id,user_id,role) VALUES('forum-migrate','forum-project','teacher','TEACHER'),('forum-migrate','forum-project','student','STUDENT');
      INSERT INTO courses(id,company_id,project_id,created_by) VALUES('forum-course','forum-migrate','forum-project','teacher');
      INSERT INTO learning_activities(id,company_id,project_id,title,instructions,kind,status,created_by,published_by,published_at,due_at) VALUES
        ('assignment','forum-migrate','forum-project','Original assignment','Original instructions','PRACTICE','PUBLISHED','teacher','teacher','2026-01-01','2026-01-02'),
        ('unmapped-draft','forum-migrate','forum-project','Unmapped draft','Private historical draft','PRACTICE','DRAFT','retired-agent',NULL,NULL,NULL),
        ('ambiguous','forum-migrate','forum-project','Ambiguous author','Fix before migration','PRACTICE','PUBLISHED','retired-agent','retired-agent',NOW(),NULL);
      INSERT INTO evidence_records(id,company_id,project_id,level,derivation,kind,subject_user_id,data,created_by_type,created_by_id)
        VALUES ('e1','forum-migrate','forum-project','L1','OBSERVED','learning_submission','student','{"answer":"Original answer","links":["https://example.test/answer"],"attachments":[{"key":"legacy/private.txt","name":"private.txt"}]}','USER','student'),
        ('e2','forum-migrate','forum-project','L2','COMPUTED','learning_submission','student','{"answer":"Generated answer","attachments":[{"key":"legacy/generated.txt","name":"generated.txt"}]}','AGENT','retired-agent'),
        ('e3','forum-migrate','forum-project','L1','OBSERVED','learning_submission','student','{"answer":"Unmapped","attachments":[{"key":"legacy/unmapped.txt","name":"unmapped.txt"}]}','USER','student');
      INSERT INTO learning_attempts(id,company_id,project_id,learner_id,activity_id,evidence_id,source,assistance,submitted_by_agent,agent_work_id,late,client_submission_id,submitted_at)
        VALUES ('s1','forum-migrate','forum-project','student','assignment','e1','STUDENT_ORIGINAL','NONE',NULL,NULL,TRUE,'original-key','2026-01-04'),
        ('s2','forum-migrate','forum-project','student','assignment','e2','AGENT_GENERATED','GUIDED','retired-agent','work-original',TRUE,'generated-key','2026-01-03'),
        ('s3','forum-migrate','forum-project','student','unmapped-draft','e3','STUDENT_ORIGINAL','NONE',NULL,NULL,FALSE,'archived-key','2026-01-03');
      INSERT INTO learning_evaluations(id,company_id,project_id,attempt_id,demonstrated_level,confidence,feedback,evaluator_id,evaluator_kind,status,reviewed_by)
        VALUES ('f1','forum-migrate','forum-project','s1',2,0.8,'Original feedback','teacher','TEACHER','ACCEPTED','teacher');
      INSERT INTO course_forum_comments(id,company_id,project_id,target_type,target_id,author_user_id,body)
        VALUES ('comment','forum-migrate','forum-project','activity','assignment','student','Existing discussion')`)
    const original = (await database.query('SELECT id,submission_sequence,submitted_at FROM learning_attempts WHERE activity_id=\'assignment\' ORDER BY submission_sequence')).rows
    await assert.rejects(migrateDatabase(database), /migration 40_forum_assignment_convergence failed/)
    assert.equal((await database.query("SELECT to_regclass('course_forum_retirement_archive') AS archive")).rows[0].archive,null)
    assert.equal((await database.query('SELECT COUNT(*)::int AS count FROM learning_attempts')).rows[0].count,3)
    await database.query("UPDATE learning_activities SET published_by='teacher' WHERE id='ambiguous'")
    assert.deepEqual(await migrateDatabase(database),['0040_forum_assignment_convergence','0041_homework_mastery','0042_forum_submission_evidence','0043_lingxios_3_5_0','0044_questionnaire_wait','0045_organization_cases','0046_visualize','0047_memory_continuity','0048_native_content_documents','0049_conversation_list_removals','0050_skill_delivery','0051_public_text_reader','0052_run_trace_provenance','0053_conversation_repair_provenance','0054_run_presentation_contract','0055_case_covers'])
    assert.deepEqual(await migrateDatabase(database),[])
    assert.deepEqual((await database.query('SELECT id,submission_sequence,submitted_at FROM course_forum_submissions ORDER BY submission_sequence')).rows,original)
    const posts = (await database.query("SELECT author_user_id,body,due_at::text FROM course_forum_posts WHERE id='assignment'")).rows[0]
    assert.equal(posts.author_user_id,'teacher'); assert.equal(posts.body,'Original instructions'); assert.match(posts.due_at,/2026-01-02/)
    const submissions = (await database.query('SELECT * FROM course_forum_submissions ORDER BY submission_sequence')).rows
    assert.deepEqual(submissions[0].attachments,[{key:'legacy/private.txt',name:'private.txt'}])
    assert.equal(submissions[0].answer,'Original answer');assert.equal(submissions[0].client_submission_id,'original-key')
    assert.equal(submissions[1].source,'AGENT_GENERATED');assert.equal(submissions[1].agent_work_id,'work-original')
    assert.equal(submissions[1].legacy_record.evidence.data.answer,'Generated answer')
    assert.equal((await database.query("SELECT body FROM course_forum_feedback WHERE id='f1'")).rows[0].body,'Original feedback')
    assert.equal((await database.query("SELECT target_type FROM course_forum_comments WHERE id='comment'")).rows[0].target_type,'post')
    assert.equal((await database.query("SELECT COUNT(*)::int AS count FROM course_forum_retirement_archive WHERE source_table='learning_attempts'")).rows[0].count,3)
    assert.equal((await database.query("SELECT COUNT(*)::int AS count FROM course_forum_retirement_files WHERE storage_key='legacy/unmapped.txt'")).rows[0].count,1)
    for(const table of ['learning_activities','learning_attempts','learning_evaluations','learning_missions','learning_cases','learning_states','learning_knowledge_units']) {
      assert.equal((await database.query('SELECT to_regclass($1) AS name',[table])).rows[0].name,null)
    }
  })
})

// 0046 failure model: erasing old OpenUI messages/state, mutating ledger/durable
// history, partially applying new tables, or replaying DDL on a current database.
test('0046 retains legacy OpenUI data and migration history while adding empty Visualize tables exactly once', async () => {
  await withDatabase(async database => {
    await withMigrationRange(45, async url => { await migrateDatabase(database, url) })
    await database.query(`INSERT INTO users(id,email,display_name) VALUES('user46','user46@example.test','Preserved');
      INSERT INTO companies(id,name,slug,type,plan_id) VALUES('tenant46','Preserved','tenant46','EDUCATION','plan-education');
      INSERT INTO company_memberships(company_id,user_id,role,is_admin) VALUES('tenant46','user46','TEACHER',TRUE);
      INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status) VALUES('agent46','tenant46','agent','Preserved','A','#000','avail');
      INSERT INTO conversations(id,company_id,kind,title,members) VALUES('room46','tenant46','group','Preserved','["user46","agent46"]');
      INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id) VALUES('room46','tenant46','{"channelType":2,"members":["user46","agent46"]}','agent46');
      INSERT INTO agent_run_bindings(run_id,company_id,conversation_id,session_id,agent_id,principal_id,message_protocol) VALUES('run46','tenant46','room46','room46','agent46','user46',2);
      INSERT INTO im_ui_revisions(company_id,channel_id,ui_id,revision,base_revision,native_message_id,run_id,agent_id,result_id,fence,client_nonce,source_hash)
        VALUES('tenant46','room46','old-ui',1,0,'old-native','run46','agent46','result46',1,'nonce46',repeat('a',64));
      INSERT INTO im_ui_user_states(company_id,channel_id,ui_id,user_id,revision,state,version) VALUES('tenant46','room46','old-ui','user46',1,'{"angle":30}',1)`)
    const retained = async () => Promise.all(['im_ui_revisions','im_ui_user_states','agent_run_bindings','im_send_acceptances','llm_calls']
      .map(async table => (await database.query(`SELECT to_jsonb(row)-'presentation_version' AS data FROM ${table} row ORDER BY to_jsonb(row)::text`)).rows))
    const before = await retained(), history = (await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows
    assert.deepEqual(await migrateDatabase(database), ['0046_visualize','0047_memory_continuity','0048_native_content_documents','0049_conversation_list_removals','0050_skill_delivery','0051_public_text_reader','0052_run_trace_provenance','0053_conversation_repair_provenance','0054_run_presentation_contract','0055_case_covers'])
    assert.deepEqual(await retained(), before)
    assert.deepEqual((await database.query('SELECT * FROM schema_migrations WHERE version<=45 ORDER BY version')).rows, history)
    assert.deepEqual((await database.query(`SELECT (SELECT count(*)::int FROM im_visualize_documents) documents,
      (SELECT count(*)::int FROM im_visualize_states) states, (SELECT count(*)::int FROM im_visualize_pages) pages`)).rows, [{documents: 0, states: 0, pages: 0}])
    assert.deepEqual(await migrateDatabase(database), [])
    assert.deepEqual(await retained(), before)
    await assertMigrationsCurrent(database)
  })
})

test('0047 preserves legacy memory and epochs, drains Web capture, and supports safe pre-activation rollback',async()=>{
  await withDatabase(async database=>{
    await withMigrationRange(46,async url=>{await migrateDatabase(database,url)})
    assert.equal((await database.query('SELECT version FROM lingxios.schema_version')).rows[0].version,12)
    await database.query(`INSERT INTO lingxios.agent_work_items(id,tenant_id,agent_id,principal_id,session_id,kind,lane,trigger_ref)
      VALUES('capture47','t','a','u','s','turn','interactive','source');
      INSERT INTO lingxios.agent_results(id,work_id,request_version,fence,home_epoch,message) VALUES('result47','capture47',1,1,1,'{}');
      INSERT INTO lingxios.agent_memory_capture(result_id,claim_token,claim_until) VALUES('result47','test-claim',NOW()+INTERVAL '5 minutes');
      INSERT INTO lingxios.agent_memory_scopes(tenant_id,scope_type,scope_id,epoch,forgotten_at) VALUES('t','learner','im-memory:legacy',3,NOW());
      INSERT INTO lingxios.agent_memories(tenant_id,id,scope_type,scope_id,path,title,description,body,search_text,kind,origin,source_refs)
      VALUES('t','legacy47','learner','im-memory:legacy','legacy.md','Retained','Legacy note','synthetic retained fact','retained','observation','explicit','[{"authorId":"u","sourceRef":"settings"}]')`)
    const before=(await database.query('SELECT * FROM lingxios.agent_memories')).rows
    const epoch=(await database.query('SELECT * FROM lingxios.agent_memory_scopes')).rows
    await assert.rejects(withMigrationRange(49, async url => migrateDatabase(database,url)),error=>error instanceof Error && error.cause instanceof Error && /capture is still active/.test(error.cause.message))
    assert.equal((await database.query('SELECT MAX(version) AS version FROM schema_migrations')).rows[0].version,46)
    assert.equal((await database.query('SELECT version FROM lingxios.schema_version')).rows[0].version,12)
    await database.query("UPDATE lingxios.agent_memory_capture SET claim_until=NULL WHERE result_id='result47'")
    assert.deepEqual(await withMigrationRange(49, async url => migrateDatabase(database,url)),['0047_memory_continuity','0048_native_content_documents','0049_conversation_list_removals'])
    assert.deepEqual((await database.query('SELECT * FROM lingxios.agent_memories')).rows,before)
    assert.deepEqual((await database.query('SELECT * FROM lingxios.agent_memory_scopes')).rows,epoch)
    assert.deepEqual(await withMigrationRange(49, async url => migrateDatabase(database,url)),[])
    const rollback=await readFile(packageResources().rollback015,'utf8')
    await database.query(rollback);await database.query(rollback)
    assert.equal((await database.query('SELECT version FROM lingxios.schema_version')).rows[0].version,12)
    assert.deepEqual(await withMigrationRange(49, async url => migrateDatabase(database,url)),[])
    assert.equal((await database.query('SELECT version FROM lingxios.schema_version')).rows[0].version,13)
    await database.query("UPDATE lingxios.agent_memories SET scope_id='stable-memory:proof',version=2 WHERE id='legacy47'")
    const client=await database.connect()
    try {await assert.rejects(client.query(rollback),/continuity is activated/);await client.query('ROLLBACK')} finally {client.release()}
    assert.equal((await database.query('SELECT version FROM lingxios.schema_version')).rows[0].version,13)
    assert.equal((await database.query("SELECT count(*)::int AS n FROM lingxios.agent_memories WHERE id='legacy47'")).rows[0].n,1)
    await withMigrationRange(49, async url => assertMigrationsCurrent(database,url))
  })
})

// Combined release: real 0047/native015 must precede 0048. A failed 0048 must
// preserve the committed schema13 upgrade and old content, then replay once.
test('0048 preserves old native content on schema13 and rolls back only its failed transaction', async () => {
  await withDatabase(async database => {
    await withMigrationRange(47, async url => { await migrateDatabase(database, url) })
    assert.equal((await database.query('SELECT version FROM lingxios.schema_version')).rows[0].version, 13)
    const installation = (await database.query('SELECT * FROM lingxios_installation')).rows
    const history = (await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows
    await database.query(`INSERT INTO users(id,email,display_name) VALUES('author48','author48@example.test','Preserved');
      INSERT INTO companies(id,name,slug,type,plan_id) VALUES('tenant48','Preserved','tenant48','EDUCATION','plan-education');
      INSERT INTO projects(id,company_id,kind,name,created_by)
        VALUES('project48','tenant48','TEACHING','Preserved','author48');
      INSERT INTO courses(id,company_id,project_id,created_by) VALUES('course48','tenant48','project48','author48');
      INSERT INTO course_forum_posts(id,company_id,project_id,author_user_id,kind,title,body)
        VALUES('post48','tenant48','project48','author48','share','Preserved','Literal **old** body');
      INSERT INTO homeworks(id,company_id,project_id,course_id,created_by,title,instructions,criteria,visible_hash)
        VALUES('homework48','tenant48','project48','course48','author48','Preserved','Old instructions',
          '["First **literal** criterion","Second criterion"]','preserved-hash')`)
    const snapshot = async () => ({
      post: (await database.query("SELECT to_jsonb(row) AS data FROM course_forum_posts row WHERE id='post48'")).rows[0].data,
      homework: (await database.query("SELECT to_jsonb(row) AS data FROM homeworks row WHERE id='homework48'")).rows[0].data,
    })
    const before = await snapshot()
    await withMigrationRange(48, async (url, directory) => {
      const file = join(directory, '0048_native_content_documents.sql')
      await writeFile(file, `${await readFile(file, 'utf8')}\nUPDATE course_forum_posts SET body='Must roll back' WHERE id='post48';\nSELECT missing_native_content_migration_function();\n`)
      await assert.rejects(migrateDatabase(database, url), /migration 48_native_content_documents failed/)
    })
    assert.deepEqual(await snapshot(), before)
    assert.deepEqual((await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows, history)
    assert.deepEqual((await database.query('SELECT * FROM lingxios_installation')).rows, installation)
    assert.deepEqual(await withMigrationRange(49, async url => migrateDatabase(database,url)), ['0048_native_content_documents','0049_conversation_list_removals'])
    const after = await snapshot()
    for (const table of ['post', 'homework'] as const) {
      assert.deepEqual(Object.fromEntries(Object.keys(before[table]).map(key => [key, after[table][key]])), before[table])
      assert.equal(after[table].editor_document, null)
    }
    assert.equal(after.homework.criteria_document, null)
    const columns = [
      ['course_forum_posts', 'editor_document'], ['course_forum_comments', 'editor_document'],
      ['course_forum_submissions', 'editor_document'], ['course_forum_feedback', 'editor_document'],
      ['course_forum_feedback', 'attachments'], ['course_forum_feedback', 'links'],
      ['homeworks', 'editor_document'], ['homeworks', 'criteria_document'],
      ['homework_teacher_decisions', 'editor_document'], ['homework_teacher_decisions', 'attachments'],
      ['homework_teacher_decisions', 'links'],
    ]
    for (const [table, column] of columns) {
      assert.deepEqual((await database.query(`SELECT is_nullable,data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1 AND column_name=$2`, [table, column])).rows,
      [{ is_nullable: 'YES', data_type: 'jsonb' }])
    }
    const sql = await readFile(new URL('../db/migrations/0048_native_content_documents.sql', import.meta.url))
    assert.equal((await database.query('SELECT checksum FROM schema_migrations WHERE version=48')).rows[0].checksum,
      createHash('sha256').update(sql).digest('hex'))
    assert.deepEqual(await withMigrationRange(49, async url => migrateDatabase(database,url)), [])
    assert.deepEqual(await snapshot(), after)
    assert.deepEqual((await database.query('SELECT * FROM lingxios_installation')).rows, installation)
    await withMigrationRange(49, async url => assertMigrationsCurrent(database,url))
  })
})

// Failure model: upgrade rewrites conversation data, removals cross tenant/project
// scope, or a failed migration leaves partial DDL/ledger state behind.
test('0049 adds reversible per-user removals without rewriting conversations', async () => {
  await withDatabase(async database => {
    await withMigrationRange(48, async url => { await migrateDatabase(database, url) })
    await database.query(`INSERT INTO users(id,email,display_name) VALUES('user49','user49@example.test','Preserved');
      INSERT INTO companies(id,name,slug,type,plan_id) VALUES('company49','Preserved','company49','EDUCATION','plan-education');
      INSERT INTO projects(id,company_id,kind,name,created_by) VALUES('project49','company49','TEACHING','Preserved','user49');
      INSERT INTO conversations(id,company_id,project_id,kind,title,members)
        VALUES('room49','company49','project49','direct','Preserved','["user49"]')`)
    const before = (await database.query("SELECT * FROM conversations WHERE id='room49'")).rows
    await withMigrationRange(49, async (url, directory) => {
      const file = join(directory, '0049_conversation_list_removals.sql')
      await writeFile(file, `${await readFile(file, 'utf8')}\nSELECT missing_removal_migration_function();\n`)
      await assert.rejects(migrateDatabase(database, url), /migration 49_conversation_list_removals failed/)
    })
    assert.equal((await database.query("SELECT to_regclass('public.conversation_list_removals') AS name")).rows[0].name, null)
    assert.deepEqual(await migrateDatabase(database), ['0049_conversation_list_removals','0050_skill_delivery','0051_public_text_reader','0052_run_trace_provenance','0053_conversation_repair_provenance','0054_run_presentation_contract','0055_case_covers'])
    assert.deepEqual((await database.query("SELECT * FROM conversations WHERE id='room49'")).rows, before)
    await database.query(`INSERT INTO conversation_list_removals(user_id,conversation_id,company_id,project_id)
      VALUES('user49','room49','company49','project49')`)
    await assert.rejects(database.query(`UPDATE conversation_list_removals SET company_id='other-company'
      WHERE user_id='user49' AND conversation_id='room49'`), { code: '23503' })
    assert.deepEqual(await migrateDatabase(database), [])
    assert.equal((await database.query('SELECT COUNT(*)::int AS count FROM conversation_list_removals')).rows[0].count, 1)
  })
})
