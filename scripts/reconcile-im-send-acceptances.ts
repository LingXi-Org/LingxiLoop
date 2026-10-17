/**
 * Controlled #154 repair. No model, action, IM send, membership upsert or run reset.
 * Inspect: npx --no-install tsx scripts/reconcile-im-send-acceptances.ts --company ID --sender ID
 * Apply ONE inspected key: append --nonce KEY --apply --database EXACT_DATABASE_NAME
 * Re-run inspection after applying. Normal result-outbox retry confirms the original result;
 * this command does not resume old work or modify the runtime delivery outbox.
 */
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import type { WorkConversation } from '@lyyzka/lingxios'
import type { Queryable } from '../server/src/db/queryable.js'
import type { ImSendAcceptanceRow } from '../server/src/im/messages-repository.js'
import { nativeMessageSchema } from '../server/src/im/message-types.js'
import { createPermissionService } from '../server/src/modules/access/public.js'

export async function authorizeAcceptanceRepair(db: Queryable, input: {
  companyId: string; userId: string
}, acceptance: ImSendAcceptanceRow): Promise<void> {
  const payload = nativeMessageSchema.parse(acceptance.payload)
  let principalId = input.userId
  if (payload.role === 'assistant' || payload.role === 'system') {
    const custom = payload.metadata.custom
    const harness = custom.harness as Record<string, unknown> | undefined
    const runId = harness?.runId ?? custom.runId
    if (typeof runId !== 'string') throw new Error('original run identity unavailable')
    // Read the persisted frozen audience; do not reconstruct it from current recipients.
    const work = (await db.query<{ principal_id: string; conversation: WorkConversation; created_at: Date }>(
      `SELECT work.principal_id,work.conversation,work.created_at FROM lingxios.agent_work_items work
       JOIN agent_run_bindings binding ON binding.run_id=work.id AND binding.company_id=work.tenant_id
         AND binding.agent_id=work.agent_id AND binding.principal_id=work.principal_id
       WHERE work.tenant_id=$1 AND work.agent_id=$2 AND work.id=$3 AND binding.conversation_id=$4
         AND NOT binding.internal AND binding.message_protocol=2`,
      [input.companyId, input.userId, runId, acceptance.channel_id])).rows[0]
    if (!work?.principal_id || work.conversation?.conversationId !== acceptance.channel_id
      || work.conversation.internal || !Array.isArray(work.conversation.audience?.participantIds)) throw new Error('original frozen audience unavailable')
    const profile = (await db.query<{ members: string[] }>(`SELECT profile->'members' AS members
      FROM im_channel_bindings WHERE company_id=$1 AND channel_id=$2`, [input.companyId, acceptance.channel_id])).rows[0]
    if (!Array.isArray(profile?.members) || JSON.stringify([...profile.members].sort())
      !== JSON.stringify([...work.conversation.audience.participantIds].sort())) throw new Error('frozen audience revoked')
    const active = await db.query(`SELECT 1 FROM participants agent JOIN participants human ON human.company_id=agent.company_id
      JOIN users principal ON principal.id=human.id AND principal.deleted_at IS NULL AND principal.suspended_at IS NULL
        AND principal.departed_at IS NULL AND (principal.access_revoked_at IS NULL OR principal.access_revoked_at<$4)
      WHERE agent.company_id=$1 AND agent.id=$2 AND agent.kind='agent' AND agent.departed_at IS NULL
        AND human.id=$3 AND human.kind='human' AND human.departed_at IS NULL`,
    [input.companyId, input.userId, work.principal_id, work.created_at])
    if (!active.rowCount) throw new Error('original principal or agent revoked')
    principalId = work.principal_id
  }
  await createPermissionService(db).assertCan({ actorUserId: principalId, companyId: input.companyId,
    action: 'conversation:read', resource: { type: 'conversation', id: acceptance.channel_id } })
}

async function main() {
  const args = process.argv.slice(2), flags = new Map<string, string>()
  let apply = false
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--apply') { apply = true; continue }
    if (!['--company', '--sender', '--nonce', '--database', '--after', '--limit'].includes(arg)
      || !args[index + 1] || args[index + 1].startsWith('--') || flags.has(arg)) throw new Error('invalid repair arguments')
    flags.set(arg, args[++index])
  }
  const companyId = flags.get('--company'), userId = flags.get('--sender'), clientNonce = flags.get('--nonce')
  if (!companyId || !userId) throw new Error('--company and --sender are required')
  const limit = Number(flags.get('--limit') ?? 100)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('--limit must be between 1 and 1000')
  const { env } = await import('../server/src/env.js')
  if (apply && (!clientNonce || flags.get('--database') !== decodeURIComponent(new URL(env.DATABASE_URL).pathname.slice(1)))) {
    throw new Error('--apply requires one --nonce and --database matching the explicit target')
  }
  const { pool, closeDatabasePools } = await import('../server/src/db/pool.js')
  const { ImMessagesApplication } = await import('../server/src/im/messages-application.js')
  const { wukongClient } = await import('../server/src/im/wukong.js')
  const unsupported = async (): Promise<never> => { throw new Error('maintenance only supports receipt reconciliation') }
  // Keep maintenance independent of Redis, workers and sending infrastructure.
  const application = new ImMessagesApplication({ db: pool, withConnection: async work => {
    const db = await pool.connect()
    try { return await work(db) } finally { db.release() }
  }, syncMessages: (...parameters) => wukongClient().syncMessages(...parameters),
    sendMessage: unsupported, listConversations: unsupported, clearUnread: unsupported,
    reactions: unsupported, toggleReaction: unsupported, setUnread: unsupported,
    recordReadReceipt: unsupported, publishReadReceipt: unsupported })
  const totals: Record<string, number> = {}
  try {
    const rows = (await pool.query<{ client_nonce: string }>(`SELECT client_nonce FROM im_send_acceptances
      WHERE company_id=$1 AND user_id=$2 AND ($3::text IS NULL OR client_nonce=$3)
        AND ($4::text IS NULL OR client_nonce>$4) ORDER BY client_nonce LIMIT $5`,
    [companyId, userId, clientNonce ?? null, flags.get('--after') ?? null, limit])).rows
    for (const row of rows) {
      const result = await application.reconcileSendAcceptance({ companyId, userId,
        clientNonce: row.client_nonce, apply, authorize: (db, acceptance) => authorizeAcceptanceRepair(db, { companyId, userId }, acceptance) })
      totals[result.classification] = (totals[result.classification] ?? 0) + 1
      console.log(JSON.stringify({ nonceHash: createHash('sha256').update(row.client_nonce).digest('hex'),
        classification: result.classification, mode: apply ? 'apply' : 'inspect' }))
    }
    console.log(JSON.stringify({ inspected: rows.length, totals, limit, mayHaveMore: rows.length === limit,
      runtimeConfirmation: 'normal retry with original resultId/messageKey; no runtime work resumed' }))
  } finally { await closeDatabasePools() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('IM acceptance repair failed; verify arguments, authorization and service readiness.'); process.exitCode = 1 })
}
