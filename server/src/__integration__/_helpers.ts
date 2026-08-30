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
import { randomUUID } from 'node:crypto'
import { Webhook } from 'svix'
import { assertV1SchemaReady } from '../db/bootstrap.js'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { ensurePersonalFreePlan } from '../modules/entitlements/public.js'
import { _setWukongClientForTests, WukongClient } from '../im/wukong.js'
import type { InboundEmailPayload } from '../modules/email/contracts.js'
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
  'project_invitation_acceptances',
  'project_invitations',
  'company_onboarding_effects',
  'learning_effects',
  'notification_delivery_intents',
  'notification_deliveries',
  'notification_intents',
  'notification_preferences',
  'learning_case_actions',
  'learning_cases',
  'learning_states',
  'learning_evaluations',
  'learning_attempts',
  'learning_mission_steps',
  'learning_missions',
  'learning_activity_knowledge_units',
  'learning_activities',
  'learning_knowledge_unit_dependencies',
  'learning_knowledge_units',
  'learning_course_rooms',
  'learning_course_teacher_rooms',
  'learning_project_teacher_agents',
  'project_memberships',
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
  'document_mention_deliveries', 'document_mentions',
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
  'email_sequence_counters',
  'email_contacts',
  'message_reactions',
  'conversation_reads',
  'conversations',
  'agent_climate',
  'agent_workspace',
  'llm_calls',
  'agent_runs',
  'agent_events',
  'agent_tasks',
  'agent_log',
  'company_invitations',
  'company_memberships',
  'participants',
  'users',
  'companies',
  'plan_entitlements',
  'entitlements',
  'plans',
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
  await ensurePersonalFreePlan(pool)
}

export function signInboundPayload(body: string): Record<string, string> {
  const secret = env.RESEND_WEBHOOK_SECRET
  if (!secret) throw new Error('RESEND_WEBHOOK_SECRET not set in test env')
  const id = `msg_${randomUUID()}`
  const timestamp = new Date()
  return {
    'svix-id': id,
    'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
    'svix-signature': new Webhook(secret).sign(id, timestamp, body),
  }
}

const inboundFixtures = new Map<string, InboundEmailPayload>()

export function registerInboundFixture(payload: InboundEmailPayload): string {
  const emailId = randomUUID()
  inboundFixtures.set(emailId, payload)
  return emailId
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
    `INSERT INTO users (id,email,display_name) VALUES ('test-owner','test-owner@test.local','Test owner')
     ON CONFLICT (id) DO NOTHING`,
  )
  await pool.query(
    `INSERT INTO companies (id, name, slug, type, plan_id)
     VALUES ($1, $2, $3, 'EDUCATION', 'plan-personal-free')
     ON CONFLICT DO NOTHING`,
    [companyId, `Test ${companyId}`, companyId],
  )
  await pool.query(
    `INSERT INTO company_memberships (company_id,user_id,role) VALUES ($1,'test-owner','OWNER')
     ON CONFLICT DO NOTHING`,
    [companyId],
  )
  // Integration-only Education fixture with an explicit Institutional Course Project.
  await pool.query(
    `INSERT INTO projects (id, company_id, kind, name, description, color, created_by, is_default)
     SELECT $2, $1, 'INSTITUTIONAL_COURSE', '学校课程', '测试公司的默认课程空间', '#667085', 'test-owner', TRUE
      WHERE NOT EXISTS (SELECT 1 FROM projects WHERE company_id=$1 AND is_default=TRUE)`,
    [companyId, projectId],
  )
  await pool.query(
    `INSERT INTO project_memberships (project_id,company_id,user_id,role)
     VALUES ($1,$2,'test-owner','OWNER') ON CONFLICT DO NOTHING`,
    [projectId, companyId],
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
  const { createResendInboundEmailRouter, resendInboundEmailRouter } = await import('../modules/email/index.js')
  // Match the production mount path: web.ts mounts resendInboundEmailRouter
  // at /webhooks/email — see server/src/web.ts.
  app.use(
    '/webhooks/email',
    storageProvider ? createResendInboundEmailRouter({
      storage: storageProvider,
      retrieve: async (emailId) => {
        const payload = inboundFixtures.get(emailId)
        if (!payload) throw new Error(`missing inbound fixture: ${emailId}`)
        return payload
      },
    }) : resendInboundEmailRouter,
  )
  return app
}

/** Build a test app with the full /api router mounted + a stubbed auth
 *  middleware that stamps every request as the given userId. Used for
 *  exercising auth-gated endpoints (HTML viewer, send/reply) without
 *  having to mint real sessions. The caller is responsible for seeding
 *  the user + company_memberships rows so requireCompany() succeeds. */
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

/** Insert a user + company_memberships row so requireCompany resolves to the
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
    `INSERT INTO company_memberships (company_id, user_id, role)
     VALUES ($1, $2, 'OWNER')
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
