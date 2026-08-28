/**
 * Helpers shared by integration tests. Imported by every *.test.ts in
 * this directory.
 *
 * Lifecycle: each test file is a separate `node:test` invocation, so the
 * module-load side effects in env.ts / pool.ts / redis.ts run once per
 * file. The runner (server/run-integration-tests.mjs) has already
 * swapped DATABASE_URL to INTEGRATION_DATABASE_URL before spawning, so
 * the pool here lands on the test DB.
 *
 * Isolation strategy: TRUNCATE between tests rather than transaction
 * rollback. Rollback would break SKIP LOCKED tests (the retry worker
 * uses its own connection / transaction lifecycle that we must not
 * subsume).
 */
import { createHmac, randomUUID } from 'node:crypto'
import { assertV1SchemaReady } from '../db/bootstrap.js'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { _setWukongClientForTests, WukongClient } from '../im/wukong.js'
import { installStorageProvider, type Storage, type StorageObject } from '../storage.js'

const storageObjects = new Map<string, { body: Buffer; mime: string; modifiedAt: number }>()
const integrationStorage: Storage = {
  mode: 'r2',
  async put(key, body, mime) {
    storageObjects.set(key, { body: Buffer.from(body), mime, modifiedAt: Date.now() })
    return this.publicUrl(key)
  },
  async presignPut(key) {
    return {
      uploadUrl: `https://storage.test.invalid/upload/${encodeURIComponent(key)}`,
      publicUrl: await this.publicUrl(key),
    }
  },
  async publicUrl(key) {
    return `https://storage.test.invalid/${key}`
  },
  async readObject(key) {
    const object = storageObjects.get(key)
    if (!object) throw new Error(`integration storage object not found: ${key}`)
    return Buffer.from(object.body)
  },
  async listObjectsByPrefix(prefix): Promise<StorageObject[]> {
    return [...storageObjects.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => ({
        key,
        sizeBytes: value.body.byteLength,
        lastModifiedMs: value.modifiedAt,
      }))
  },
  async deleteObject(key) {
    return storageObjects.delete(key)
  },
}
installStorageProvider(integrationStorage)

let schemaReady: Promise<void> | null = null

/** Assert the externally bootstrapped v1 schema exactly once per test process. */
export function ensureSchemaOnce(): Promise<void> {
  if (!schemaReady) schemaReady = assertV1SchemaReady()
  return schemaReady
}

/** Tables we wipe between tests. Keeping the list explicit makes fixture
 *  ownership visible; one statement lets PostgreSQL resolve dependencies and
 *  perform a single durability sync instead of one sync per table. */
const TABLES_TO_WIPE: readonly string[] = [
  'eval_stage_results',
  'eval_cases',
  'eval_runs',
  'course_invitation_acceptances',
  'course_invitations',
  'learning_notification_deliveries',
  'learning_notification_preferences',
  'learning_mastery_events',
  'learning_mastery',
  'learning_evaluations',
  'learning_attempts',
  'learning_mission_steps',
  'learning_missions',
  'learning_activities',
  'learning_objective_dependencies',
  'learning_objectives',
  'learning_course_rooms',
  'learning_course_teacher_rooms',
  'learning_project_teacher_agents',
  'course_members',
  'courses',
  'agent_host_actions',
  'agent_os_approvals',
  'agent_os_session_leases',
  'agent_work_items',
  'agent_os_sessions',
  'agent_memory_evidence',
  'im_send_acceptances',
  'im_read_receipt_advances',
  'im_poll_votes',
  'im_polls',
  'wukong_webhook_receipts',
  'im_channel_bindings',
  'canvas_activity',
  'canvas_assignment_reports',
  'canvas_assignment_dependencies',
  'canvas_agent_assignments',
  'canvas_comments',
  'canvas_presence',
  'canvas_frames',
  'canvases',
  'agent_approvals',
  'agent_handoffs',
  'agent_action_executions',
  'document_mentions',
  'document_snapshots',
  'document_updates',
  'documents',
  'board_mention_reads',
  'board_card_comments',
  'board_cards',
  'board_columns',
  'boards',
  'calendar_reminders',
  'calendar_dispatches',
  'calendar_events',
  'email_attachments',
  'email_messages',
  'email_contacts',
  'message_reactions',
  'conversation_reads',
  'conversation_counters',
  'messages',
  'conversations',
  'agent_climate',
  'agent_workspace',
  'llm_calls',
  'agent_runs',
  'agent_events',
  'agent_tasks',
  'agent_log',
  'company_invitations',
  'company_members',
  'participants',
  'users',
  'companies',
]

/** Wipe every test table. Call from beforeEach. The check at the top
 *  refuses to run if DATABASE_URL doesn't include the substring "test"
 *  — last line of defense against a misconfigured runner pointing at a
 *  real DB. */
export async function resetAllTables(): Promise<void> {
  if (!/test/i.test(env.DATABASE_URL)) {
    throw new Error(`refusing to TRUNCATE — DATABASE_URL doesn't look like a test DB: ${env.DATABASE_URL}`)
  }
  await ensureSchemaOnce()
  storageObjects.clear()
  await pool.query(`TRUNCATE TABLE ${TABLES_TO_WIPE.join(', ')} CASCADE`)
}

/** Compute the HMAC signature the inbound webhook expects. Mirrors the
 *  cloudflare worker's `hmacHex` exactly so a test payload looks like
 *  it came off the wire. */
export function signInboundPayload(body: string): string {
  const secret = env.EMAIL_INBOUND_HMAC_SECRET
  if (!secret) throw new Error('EMAIL_INBOUND_HMAC_SECRET not set in test env')
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

/** Insert the minimum scaffolding an email row needs: one company + one
 *  agent participant whose participants.email is pre-minted. Returns the
 *  ids the caller will use as recipient / sender. */
export async function seedCompanyWithAgent(opts?: {
  companyId?: string; agentId?: string; agentEmail?: string
}): Promise<{ companyId: string; projectId: string; agentId: string; agentEmail: string }> {
  const companyId = opts?.companyId ?? `c-${randomUUID().slice(0, 8)}`
  const projectId = `general-${companyId}`
  const agentId = opts?.agentId ?? `a-${randomUUID().slice(0, 8)}`
  const dom = env.EMAIL_DOMAIN || 'lingxiloop.local'
  const agentEmail = opts?.agentEmail ?? `${agentId}.${companyId}@${dom}`
  await pool.query(
    `INSERT INTO companies (id, name, slug, owner_user_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [companyId, `Test ${companyId}`, companyId, 'test-owner'],
  )
  // Mirror production onboarding: every company needs its General workspace.
  await pool.query(
    `INSERT INTO projects (id, company_id, name, description, color, created_by, is_general)
     SELECT $2, $1, '通用工作区', '测试公司的默认工作区', '#667085', 'test-owner', TRUE
      WHERE NOT EXISTS (SELECT 1 FROM projects WHERE company_id=$1 AND is_general=TRUE)`,
    [companyId, projectId],
  )
  // participants composite PK is (id, company_id) — see db/schema.sql.
  await pool.query(
    `INSERT INTO participants (id, company_id, kind, name, role, initial, avatar_bg, status, email)
     VALUES ($1, $2, 'agent', $3, 'tester', $4, '#abcdef', 'avail', $5)
     ON CONFLICT DO NOTHING`,
    [agentId, companyId, `Agent ${agentId}`, agentId.slice(0, 1).toUpperCase(), agentEmail],
  )
  return { companyId, projectId, agentId, agentEmail }
}

/** Install an explicit in-process WuKongIM provider for domain integration
 * tests that exercise persistence rather than the pinned Compose service. */
export function installFakeWukong(): void {
  let sequence = 0
  _setWukongClientForTests(new class extends WukongClient {
    override async bootstrap(uid: string, token: string) {
      return { uid, token, wsUrl: 'ws://unused', apiVersion: 3 as const, sdkVersion: '1.3.5' as const }
    }
    override async upsertChannel(): Promise<void> {}
    override async sendMessage() { sequence += 1; return { messageId: `wk-test-${sequence}`, messageSeq: sequence } }
    override async emitEvent(): Promise<void> {}
    override async listConversations() { return [] }
    override async clearUnread(): Promise<void> {}
    override async setUnread(): Promise<void> {}
    override async syncMessages() { return [] }
  }({ apiUrl: 'http://unused', wsUrl: 'ws://unused', apiToken: 'test', webhookSecret: 'test' }))
}

/** Build a minimum-viable Express app that mounts only the routes under
 *  test. Avoids booting the full server (auth middleware, schedulers,
 *  etc.) — slow, more failure modes. */
export async function buildTestApp(storageProvider?: Pick<Storage, 'put'>): Promise<import('express').Express> {
  const expressMod = await import('express')
  const express = expressMod.default
  const app = express()
  const { createInboundEmailRouter, inboundEmailRouter } = await import('../api/inbound-email.js')
  // Match the production mount path: web.ts mounts inboundEmailRouter
  // at /webhooks/email — see server/src/web.ts.
  app.use(
    '/webhooks/email',
    storageProvider ? createInboundEmailRouter({ storage: storageProvider }) : inboundEmailRouter,
  )
  return app
}

/** Build a test app with the full /api router mounted + a stubbed auth
 *  middleware that stamps every request as the given userId. Used for
 *  exercising auth-gated endpoints (HTML viewer, send/reply) without
 *  having to mint real sessions. The caller is responsible for seeding
 *  the user + company_members rows so requireCompany() succeeds. */
export async function buildApiTestApp(userId: string): Promise<import('express').Express> {
  const expressMod = await import('express')
  const express = expressMod.default
  const app = express()
  app.use(express.json({ limit: '34mb' }))
  // Fake auth middleware: stamp authUserId from the test's choice. Real
  // requireAuth() just reads this field, so handlers can't distinguish.
  app.use((req, _res, next) => {
    (req as unknown as { authUserId: string }).authUserId = userId
    next()
  })
  const { api } = await import('../api/router.js')
  app.use('/api', api)
  return app
}

/** Insert a user + company_members row so requireCompany resolves to the
 *  given tenant. ALSO inserts a corresponding participants row, matching
 *  what production onboarding does — human users get a participants
 *  entry so they can have a minted lingxiloop email, climate signals,
 *  /participants visibility, etc. Without this, ensureParticipantAddress
 *  returns null and email-reply paths 500. */
export async function seedUserMembership(userId: string, companyId: string, opts?: {
  email?: string; displayName?: string;
}): Promise<void> {
  const displayName = opts?.displayName ?? userId
  const authEmail = opts?.email ?? `${userId}@test.local`
  await pool.query(
    `INSERT INTO users (id, email, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [userId, authEmail, displayName],
  )
  await pool.query(
    `INSERT INTO company_members (company_id, user_id, role)
     VALUES ($1, $2, 'owner')
     ON CONFLICT DO NOTHING`,
    [companyId, userId],
  )
  // Mirror what production onboarding does: a human is also a participant
  // in the company. We leave participants.email NULL so ensureParticipantAddress
  // lazy-mints `<userId>.<slug>@<EMAIL_DOMAIN>` on first access (matches
  // the production code path).
  await pool.query(
    `INSERT INTO participants (id, company_id, kind, name, role, initial, avatar_bg, status)
     VALUES ($1, $2, 'human', $3, 'owner', $4, '#abcdef', 'avail')
     ON CONFLICT DO NOTHING`,
    [userId, companyId, displayName, displayName.slice(0, 1).toUpperCase()],
  )
}

/** Tear down every resource the test harness opened: HTTP server, pg
 *  pool, redis (and the separate sub connection). Call from `after()` in
 *  each test file. Without this, node:test waits 60s+ on dangling event-
 *  loop handles before timing out the whole file. */
export async function teardownAll(server?: import('node:http').Server): Promise<void> {
  if (server && server.listening) {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  // Pool + redis are module-level singletons; ending them is fine because
  // the process is about to exit anyway. Catch swallows reentrant-end
  // errors when multiple test files share the singleton.
  try { await pool.end() } catch { /* ignore */ }
  try {
    const { redis, sub } = await import('../redis.js')
    redis.disconnect()
    sub.disconnect()
  } catch { /* ignore */ }
}
