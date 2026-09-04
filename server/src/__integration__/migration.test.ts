import assert from 'node:assert/strict'
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import test from 'node:test'
import { assertMigrationsCurrent, migrateDatabase } from '../db/migrate.js'

const baselineUrl = new URL('../db/migrations/0001_v1_baseline.sql', import.meta.url)
const legacyCleanupUrl = new URL('../db/migrations/0002_remove_legacy_identity.sql', import.meta.url)
const affinityUrl = new URL('../db/migrations/0003_agent_os_session_affinity.sql', import.meta.url)
const personalOwnerUrl = new URL('../db/migrations/0004_backfill_personal_owner_participants.sql', import.meta.url)
const lingxiOSResetUrl = new URL('../db/migrations/0005_lingxios_v2_reset.sql', import.meta.url)

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
    assert.deepEqual(await migrateDatabase(database), ['0001_v1_baseline', '0002_remove_legacy_identity', '0003_agent_os_session_affinity', '0004_backfill_personal_owner_participants', '0005_lingxios_v2_reset'])
    assert.deepEqual(await migrateDatabase(database), [])
    await assertMigrationsCurrent(database)
    const { rows } = await database.query('SELECT version,name FROM schema_migrations ORDER BY version')
    assert.deepEqual(rows, [
      { version: 1, name: 'v1_baseline' },
      { version: 2, name: 'remove_legacy_identity' },
      { version: 3, name: 'agent_os_session_affinity' },
      { version: 4, name: 'backfill_personal_owner_participants' },
      { version: 5, name: 'lingxios_v2_reset' },
    ])
  })
})

test('the affinity migration backfills the most recent worker without changing the Home epoch', async () => {
  await withMigrations(async (migrationsUrl, directory) => {
    await copyFile(legacyCleanupUrl, join(directory, '0002_remove_legacy_identity.sql'))
    await withDatabase(async (database) => {
      await migrateDatabase(database, migrationsUrl)
      await database.query(
        `INSERT INTO companies(id,name,slug,type,plan_id)
         VALUES('migration-company','Migration','migration-company','EDUCATION','plan-personal-free')`,
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

test('the LingxiOS v2 reset clears resumable runtime state and preserves durable history', async () => {
  await withMigrations(async (migrationsUrl, directory) => {
    await copyFile(legacyCleanupUrl, join(directory, '0002_remove_legacy_identity.sql'))
    await copyFile(affinityUrl, join(directory, '0003_agent_os_session_affinity.sql'))
    await copyFile(personalOwnerUrl, join(directory, '0004_backfill_personal_owner_participants.sql'))
    await withDatabase(async (database) => {
      await migrateDatabase(database, migrationsUrl)
      await database.query(`INSERT INTO users(id,email,display_name) VALUES('reset-user','reset@example.com','Reset User')`)
      await database.query(
        `INSERT INTO companies(id,name,slug,type,plan_id)
         VALUES('reset-company','Reset','reset-company','EDUCATION','plan-personal-free')`,
      )
      await database.query(
        `INSERT INTO conversations(id,kind,title,members,company_id)
         VALUES('reset-channel','group','Reset','[]'::jsonb,'reset-company')`,
      )
      await database.query(
        `INSERT INTO agent_work_items
           (id,company_id,agent_id,channel_id,trigger_client_msg_no,reason,status,lease_token_hash,leased_by,lease_started_at,lease_expires_at,cancel_requested_at,steer_inputs,preempt_requested_at,preempt_grace_expires_at)
         VALUES
           ('reset-active','reset-company','agent','reset-channel','trigger-active','message','leased','hash','worker',NOW(),NOW()+INTERVAL '1 hour',NOW(),'[{"id":"steer"}]'::jsonb,NOW(),NOW()+INTERVAL '1 minute'),
           ('reset-complete','reset-company','agent','reset-channel','trigger-complete','message','completed',NULL,NULL,NULL,NULL,NULL,'[]'::jsonb,NULL,NULL)`,
      )
      await database.query(
        `INSERT INTO agent_os_workers(worker_id) VALUES('worker');
         INSERT INTO agent_os_sessions(session_key,company_id,agent_id,channel_id) VALUES('reset-session','reset-company','agent','reset-channel');
         INSERT INTO agent_os_session_routes(session_key,worker_id) VALUES('reset-session','worker');
         INSERT INTO agent_os_session_leases(session_key,work_id,fence,expires_at) VALUES('reset-session','reset-active',1,NOW()+INTERVAL '1 hour')`,
      )
      await database.query(
        `INSERT INTO approvals
           (id,company_id,agent_id,channel_id,source,work_id,authorization_user_id,idempotency_key,action,run_id,summary,expires_at,status)
         VALUES('reset-approval','reset-company','agent','reset-channel','AGENT_OS','reset-active','reset-user','reset-key','chat.send','reset-run','Reset',NOW()+INTERVAL '1 hour','APPROVED')`,
      )
      await database.query(
        `INSERT INTO agent_host_actions(idempotency_key,work_id,run_id,cell_id,call_index,action,status)
         VALUES('reset-key','reset-active','reset-run','cell',0,'chat.send','awaiting_approval'),
               ('complete-key','reset-complete','complete-run','cell',0,'chat.send','succeeded');
         INSERT INTO agent_runs(id,agent_id,company_id,status) VALUES('reset-run','agent','reset-company','running');
         INSERT INTO agent_events(id,run_id,agent_id,company_id,kind,title) VALUES('reset-event','reset-run','agent','reset-company','run.started','started')`,
      )

      await copyFile(lingxiOSResetUrl, join(directory, '0005_lingxios_v2_reset.sql'))
      assert.deepEqual(await migrateDatabase(database, migrationsUrl), ['0005_lingxios_v2_reset'])
      const { rows: work } = await database.query(
        `SELECT id,status,lease_token_hash,leased_by,steer_inputs,preempt_requested_at FROM agent_work_items ORDER BY id`,
      )
      assert.deepEqual(work, [
        { id: 'reset-active', status: 'cancelled', lease_token_hash: null, leased_by: null, steer_inputs: [], preempt_requested_at: null },
        { id: 'reset-complete', status: 'completed', lease_token_hash: null, leased_by: null, steer_inputs: [], preempt_requested_at: null },
      ])
      const { rows: approvals } = await database.query(`SELECT status,continuation_status,cancel_reason FROM approvals WHERE id='reset-approval'`)
      assert.deepEqual(approvals, [{ status: 'CANCELLED', continuation_status: 'REJECTED', cancel_reason: 'LingxiOS v2 runtime reset' }])
      const { rows: actions } = await database.query(`SELECT idempotency_key,status FROM agent_host_actions ORDER BY idempotency_key`)
      assert.deepEqual(actions, [
        { idempotency_key: 'complete-key', status: 'succeeded' },
        { idempotency_key: 'reset-key', status: 'failed' },
      ])
      const { rows: runtimeState } = await database.query(
        `SELECT
          (SELECT COUNT(*)::int FROM agent_os_sessions) AS sessions,
          (SELECT COUNT(*)::int FROM agent_os_session_leases) AS leases,
          (SELECT COUNT(*)::int FROM agent_os_session_routes) AS routes,
          (SELECT COUNT(*)::int FROM agent_os_workers) AS workers,
          (SELECT COUNT(*)::int FROM agent_runs WHERE id='reset-run') AS runs,
          (SELECT COUNT(*)::int FROM agent_events WHERE id='reset-event') AS events`,
      )
      assert.deepEqual(runtimeState, [{ sessions: 0, leases: 0, routes: 0, workers: 0, runs: 1, events: 1 }])
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
        ['0001_v1_baseline', '0002_remove_legacy_identity', '0003_agent_os_session_affinity', '0004_backfill_personal_owner_participants', '0005_lingxios_v2_reset'],
        [],
      ])
      const { rows } = await database.query('SELECT COUNT(*)::int AS count FROM schema_migrations')
      assert.deepEqual(rows, [{ count: 5 }])
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
