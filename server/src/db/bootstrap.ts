import { readFile } from 'node:fs/promises'
import type { PoolClient } from 'pg'
import { pool } from './pool.js'

const V1_SCHEMA_URL = new URL('./schema.sql', import.meta.url)
const V1_SCHEMA_MARKER = 'LingxiLoop schema v1'

type Queryable = Pick<PoolClient, 'query'>

async function userRelationCount(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ count: string }>(`
    SELECT COUNT(*)::text AS count
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'public'
       AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  `)
  return Number(rows[0]?.count ?? 0)
}

async function schemaMarker(client: Queryable): Promise<string | null> {
  const { rows } = await client.query<{ marker: string | null }>(`
    SELECT obj_description('public'::regnamespace, 'pg_namespace') AS marker
  `)
  return rows[0]?.marker ?? null
}

async function v1SchemaReady(client: Queryable): Promise<boolean> {
  const { rows } = await client.query<{ ready: boolean }>(`
    SELECT to_regclass('public.companies') IS NOT NULL
       AND to_regclass('public.conversations') IS NOT NULL
       AND to_regclass('public.agent_work_items') IS NOT NULL
       AND to_regclass('public.knowledge_sources') IS NOT NULL
       AND to_regclass('public.courses') IS NOT NULL
       AND to_regclass('public.learning_objectives') IS NOT NULL
       AND to_regclass('public.learning_notification_deliveries') IS NOT NULL
       AND to_regclass('public.learning_project_teacher_agents') IS NOT NULL
       AND to_regclass('public.learning_course_teacher_rooms') IS NOT NULL
       AND to_regclass('public.canvas_assignment_reports') IS NOT NULL
       AND to_regclass('public.im_read_receipt_advances') IS NOT NULL
       AND to_regclass('public.llm_calls') IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='agent_work_items' AND column_name='execution_role'
       )
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='agent_os_approvals' AND column_name='scope'
       )
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='canvas_agent_assignments' AND column_name='verifies_assignment_id'
       ) AS ready
  `)
  return rows[0]?.ready === true
}

/**
 * Create the immutable LingxiLoop v1 schema in an empty PostgreSQL database.
 *
 * This is deliberately not a migration: only an empty schema or the exact
 * marked v1 schema is accepted. Nothing is altered, backfilled, or upgraded.
 * Development databases from before v1 must be dropped and recreated.
 */
export async function bootstrapV1Schema(): Promise<'created' | 'ready'> {
  const client = await pool.connect()
  try {
    const existingRelations = await userRelationCount(client)
    if (existingRelations > 0) {
      if ((await schemaMarker(client)) === V1_SCHEMA_MARKER) {
        if (!(await v1SchemaReady(client))) {
          throw new Error('LingxiLoop v1 schema marker exists, but required relations are missing.')
        }
        return 'ready'
      }
      throw new Error(
        `LingxiLoop v1 bootstrap requires an empty schema; found ${existingRelations} existing relation(s). Drop and recreate the database before bootstrapping.`,
      )
    }
    const schema = await readFile(V1_SCHEMA_URL, 'utf8')
    await client.query(schema)
    return 'created'
  } finally {
    client.release()
  }
}

/** Read-only assertion used by integration tests; it never creates or alters schema. */
export async function assertV1SchemaReady(): Promise<void> {
  if ((await schemaMarker(pool)) !== V1_SCHEMA_MARKER || !(await v1SchemaReady(pool))) {
    throw new Error('LingxiLoop v1 schema is not initialized; run `npm run db:bootstrap` against an empty database first.')
  }
}
