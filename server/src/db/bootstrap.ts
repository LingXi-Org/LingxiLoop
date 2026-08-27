import { readFile } from 'node:fs/promises'
import type { PoolClient } from 'pg'
import { pool } from './pool.js'

const V1_SCHEMA_URL = new URL('./schema.sql', import.meta.url)

async function userRelationCount(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ count: string }>(`
    SELECT COUNT(*)::text AS count
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = current_schema()
       AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  `)
  return Number(rows[0]?.count ?? 0)
}

/**
 * Create the immutable LingxiLoop v1 schema in an empty PostgreSQL database.
 *
 * This is deliberately not a migration: an existing schema is rejected rather
 * than inspected, altered, backfilled, or upgraded. Development databases from
 * before v1 must be dropped and recreated explicitly by their owner.
 */
export async function bootstrapV1Schema(): Promise<void> {
  const client = await pool.connect()
  try {
    const existingRelations = await userRelationCount(client)
    if (existingRelations > 0) {
      throw new Error(
        `LingxiLoop v1 bootstrap requires an empty schema; found ${existingRelations} existing relation(s). Drop and recreate the database before bootstrapping.`,
      )
    }
    const schema = await readFile(V1_SCHEMA_URL, 'utf8')
    await client.query(schema)
  } finally {
    client.release()
  }
}

/** Read-only assertion used by integration tests; it never creates or alters schema. */
export async function assertV1SchemaReady(): Promise<void> {
  const { rows } = await pool.query<{ ready: boolean }>(`
    SELECT to_regclass('public.companies') IS NOT NULL
       AND to_regclass('public.conversations') IS NOT NULL
       AND to_regclass('public.agent_work_items') IS NOT NULL
       AND to_regclass('public.knowledge_sources') IS NOT NULL
       AND to_regclass('public.courses') IS NOT NULL
       AND to_regclass('public.llm_calls') IS NOT NULL AS ready
  `)
  if (rows[0]?.ready !== true) {
    throw new Error('LingxiLoop v1 schema is not initialized; run `npm run db:bootstrap` against an empty database first.')
  }
}
