import { readFile } from 'node:fs/promises'
import type { PoolClient } from 'pg'
import { pool } from './pool.js'

const V1_SCHEMA_URL = new URL('./schema.sql', import.meta.url)
const V1_SCHEMA_MARKER = 'LingxiLoop schema v1'

type Queryable = Pick<PoolClient, 'query'>

const REQUIRED_V1_RELATIONS = [
  'agent_action_executions', 'agent_approvals', 'agent_autonomy',
  'agent_autonomy_rules', 'agent_climate', 'agent_events', 'agent_handoffs',
  'agent_host_actions', 'agent_log', 'agent_memory_evidence',
  'agent_os_approvals', 'agent_os_session_leases', 'agent_os_sessions',
  'agent_routine_runs', 'agent_routines', 'agent_runs', 'agent_tasks',
  'agent_triages', 'agent_work_items', 'agent_workspace', 'app_settings',
  'audit_events', 'board_card_comments', 'board_cards', 'board_columns',
  'board_mention_reads', 'boards', 'calendar_dispatches', 'calendar_events',
  'calendar_reminders', 'canvas_activity', 'canvas_agent_assignments',
  'canvas_assignment_dependencies', 'canvas_assignment_reports',
  'canvas_comments', 'canvas_frames', 'canvas_presence', 'canvases', 'companies',
  'company_invitations', 'company_members', 'convene_sessions',
  'convene_transcript', 'convening_info', 'conversation_counters',
  'conversation_mutes', 'conversation_reads', 'conversation_source_exclusions',
  'conversations', 'course_invitation_acceptances', 'course_invitations',
  'course_members', 'courses', 'document_mention_deliveries', 'document_mentions', 'document_snapshots',
  'document_updates', 'documents', 'email_attachments', 'email_contacts',
  'email_messages', 'eval_cases', 'eval_runs', 'eval_stage_results',
  'im_channel_bindings', 'im_poll_votes', 'im_polls',
  'im_read_receipt_advances', 'im_send_acceptances', 'knowledge_insight_bindings',
  'knowledge_note_bindings', 'knowledge_notebook_bindings',
  'knowledge_source_chat_sessions', 'knowledge_source_jobs', 'knowledge_sources',
  'learning_activities', 'learning_attempts', 'learning_course_rooms',
  'learning_course_teacher_rooms', 'learning_evaluations', 'learning_mastery',
  'learning_mastery_events', 'learning_mission_steps', 'learning_missions',
  'learning_notification_deliveries', 'learning_notification_preferences',
  'learning_effects',
  'learning_objective_dependencies', 'learning_objectives',
  'learning_project_teacher_agents', 'llm_calls', 'message_reactions', 'messages',
  'participants', 'poll_votes', 'project_visits', 'projects', 'sessions',
  'tool_calls', 'user_identities', 'user_preferences', 'users', 'waitlist',
  'ws_tickets', 'wukong_webhook_receipts',
] as const

const REQUIRED_V1_COLUMNS = [
  ['agent_work_items', 'execution_role'],
  ['agent_os_approvals', 'scope'],
  ['canvas_agent_assignments', 'verifies_assignment_id'],
  ['llm_calls', 'company_id'],
  ['llm_calls', 'purpose'],
  ['llm_calls', 'status'],
  ['message_reactions', 'company_id'],
  ['agent_climate', 'company_id'],
  ['calendar_events', 'project_id'],
  ['document_mention_deliveries', 'recipients'],
  ['document_mention_deliveries', 'status'],
  ['im_polls', 'published_revision'],
  ['im_polls', 'request_fingerprint'],
] as const

const REQUIRED_V1_NOT_NULL_COLUMNS = [
  ['message_reactions', 'company_id', null],
  ['agent_climate', 'company_id', null],
  ['calendar_events', 'project_id', null],
  ['document_mention_deliveries', 'recipients', null],
  ['document_mention_deliveries', 'status', "'queued'::text"],
] as const

const REQUIRED_V1_PRIMARY_KEYS = [
  ['agent_climate', ['company_id', 'agent_id', 'about_id']],
] as const

const REQUIRED_V1_CONSTRAINTS = [
  ['llm_calls', 'llm_calls_pkey', 'p'],
  ['llm_calls', 'llm_calls_company_id_fkey', 'f'],
  ['llm_calls', 'llm_calls_source_check', 'c'],
  ['llm_calls', 'llm_calls_status_check', 'c'],
  ['llm_calls', 'llm_calls_tokens_check', 'c'],
  ['participants', 'participants_agent_bloub_only', 'c'],
  ['document_mention_deliveries', 'document_mention_deliveries_recipients_check', 'c'],
  ['document_mention_deliveries', 'document_mention_deliveries_status_check', 'c'],
] as const

const REQUIRED_V1_INDEXES = [
  'idx_llm_calls_company_created',
  'idx_llm_calls_run_created',
  'idx_document_mention_deliveries_due',
  'idx_document_mention_deliveries_company',
  'uniq_email_messages_smtp_id',
] as const

const REQUIRED_V1_INDEX_DEFINITIONS = [
  [
    'uniq_email_messages_smtp_id',
    'CREATE UNIQUE INDEX uniq_email_messages_smtp_id ON public.email_messages USING btree (company_id, lower(smtp_message_id)) WHERE (smtp_message_id IS NOT NULL)',
  ],
] as const

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
  const { rows: relationRows } = await client.query<{ name: string }>(
    `SELECT name FROM unnest($1::text[]) AS required(name)
      WHERE to_regclass('public.' || required.name) IS NULL`,
    [REQUIRED_V1_RELATIONS],
  )
  if (relationRows.length > 0) return false
  const tables = REQUIRED_V1_COLUMNS.map(([table]) => table)
  const columns = REQUIRED_V1_COLUMNS.map(([, column]) => column)
  const { rows: columnRows } = await client.query<{ table_name: string; column_name: string }>(
    `SELECT required.table_name, required.column_name
       FROM unnest($1::text[], $2::text[]) AS required(table_name, column_name)
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns actual
         WHERE actual.table_schema='public'
           AND actual.table_name=required.table_name
           AND actual.column_name=required.column_name
      )`,
    [tables, columns],
  )
  if (columnRows.length > 0) return false
  for (const [tableName, columnName, expectedDefault] of REQUIRED_V1_NOT_NULL_COLUMNS) {
    const { rows } = await client.query<{ is_nullable: string; column_default: string | null }>(
      `SELECT is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [tableName, columnName],
    )
    if (rows[0]?.is_nullable !== 'NO' || rows[0].column_default !== expectedDefault) return false
  }
  for (const [tableName, expectedColumns] of REQUIRED_V1_PRIMARY_KEYS) {
    const { rows } = await client.query<{ columns: string[] }>(
      `SELECT json_agg(key_column.column_name ORDER BY key_column.ordinal_position) AS columns
         FROM information_schema.table_constraints constraint_info
         JOIN information_schema.key_column_usage key_column
           ON key_column.constraint_schema = constraint_info.constraint_schema
          AND key_column.constraint_name = constraint_info.constraint_name
        WHERE constraint_info.table_schema = 'public'
          AND constraint_info.table_name = $1
          AND constraint_info.constraint_type = 'PRIMARY KEY'`,
      [tableName],
    )
    if (JSON.stringify(rows[0]?.columns ?? []) !== JSON.stringify(expectedColumns)) return false
  }
  const constraintTables = REQUIRED_V1_CONSTRAINTS.map(([table]) => table)
  const constraintNames = REQUIRED_V1_CONSTRAINTS.map(([, name]) => name)
  const constraintTypes = REQUIRED_V1_CONSTRAINTS.map(([, , type]) => type)
  const { rows: constraintRows } = await client.query<{ name: string }>(
    `SELECT required.name
       FROM unnest($1::text[], $2::text[], $3::text[]) AS required(table_name, name, constraint_type)
      WHERE NOT EXISTS (
        SELECT 1
          FROM pg_constraint actual
          JOIN pg_class owning_table ON owning_table.oid=actual.conrelid
          JOIN pg_namespace owning_schema ON owning_schema.oid=owning_table.relnamespace
         WHERE owning_schema.nspname='public'
           AND owning_table.relname=required.table_name
           AND actual.conname=required.name
           AND actual.contype=required.constraint_type::"char"
      )`,
    [constraintTables, constraintNames, constraintTypes],
  )
  if (constraintRows.length > 0) return false
  const { rows: indexRows } = await client.query<{ name: string }>(
    `SELECT required.name FROM unnest($1::text[]) AS required(name)
      WHERE to_regclass('public.' || required.name) IS NULL`,
    [REQUIRED_V1_INDEXES],
  )
  if (indexRows.length > 0) return false
  for (const [indexName, expectedDefinition] of REQUIRED_V1_INDEX_DEFINITIONS) {
    const { rows } = await client.query<{ definition: string | null }>(
      `SELECT pg_get_indexdef(to_regclass('public.' || $1)) AS definition`,
      [indexName],
    )
    const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() ?? ''
    if (normalize(rows[0]?.definition) !== normalize(expectedDefinition)) return false
  }
  return true
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
          throw new Error(
            'LingxiLoop v1 schema marker exists, but required V1 objects are missing or invalid. Drop and recreate the database from the current schema.sql.',
          )
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
