import { createHash } from 'node:crypto'
import type { MemoryAPI } from '@lyyzka/lingxios'
import { z } from 'zod'
import type { Queryable } from '../../db/queryable.js'
import { HttpError } from '../../http/errors.js'
import { productRunIdentity } from '../../agent-runtime/identity.js'

export const memorySummariesQuery = z.object({
  threadId: z.string().min(1).max(1000).optional(),
  cursor: z.string().min(1).max(4000).optional(),
}).strict()

const cursorSchema = z.object({
  context: z.string(), agent: z.string().max(1000), run: z.string().max(1000).nullable(),
  scope: z.number().int().min(0).max(12), path: z.string().max(512).optional(),
}).strict()
type Cursor = z.infer<typeof cursorSchema>
interface Summary { id: string; text: string; agentId: string; agentName: string }

/** Product bindings select identities; only the native public API resolves and reads memory scopes. */
export async function listMemorySummaries(db: Queryable, memory: MemoryAPI | undefined, input: {
  companyId: string; userId: string; conversationId: string; threadId?: string; cursor?: string
}): Promise<{ items: Summary[]; nextCursor: string | null }> {
  const context = createHash('sha256').update(JSON.stringify([
    input.companyId, input.userId, input.conversationId, input.threadId ?? null,
  ])).digest('hex')
  let cursor: Cursor | undefined
  if (input.cursor) {
    try { cursor = cursorSchema.parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'))) }
    catch { throw new HttpError(400, 'invalid memory cursor') }
    if (cursor.context !== context) throw new HttpError(400, 'memory cursor belongs to another conversation')
  }
  if (!memory) return { items: [], nextCursor: null }
  const encode = (value: Omit<Cursor, 'context'>) => Buffer.from(JSON.stringify({ context, ...value })).toString('base64url')
  // Bound work per page, including conversations with many agents or empty scopes.
  const { rows } = await db.query<{ agent_id: string; name: string; run_id: string; session_id: string }>(`
    SELECT DISTINCT ON (r.agent_id) r.agent_id,agent.name,r.run_id,r.session_id
    FROM agent_run_bindings r
    JOIN participants agent ON agent.company_id=r.company_id AND agent.id=r.agent_id AND agent.kind='agent' AND agent.departed_at IS NULL
    JOIN participants human ON human.company_id=r.company_id AND human.id=r.principal_id AND human.kind='human' AND human.departed_at IS NULL
    JOIN users u ON u.id=r.principal_id AND u.deleted_at IS NULL AND u.suspended_at IS NULL AND u.departed_at IS NULL
      AND (u.access_revoked_at IS NULL OR u.access_revoked_at<r.created_at)
    JOIN im_channel_bindings b ON b.company_id=r.company_id AND b.channel_id=r.conversation_id
      AND b.profile->'members' ? agent.id AND b.profile->'members' ? human.id
    WHERE r.company_id=$1 AND r.conversation_id=$2 AND r.principal_id=$3 AND NOT r.internal
      AND r.thread_id IS NOT DISTINCT FROM $4
      AND ($5::text IS NULL OR r.agent_id>$5 OR ($6::boolean AND r.agent_id=$5))
    ORDER BY r.agent_id,r.created_at DESC,r.run_id DESC LIMIT 6`,
  [input.companyId, input.conversationId, input.userId, input.threadId ?? null, cursor?.agent ?? null, !!cursor?.run])
  if (cursor?.run && (rows[0]?.agent_id !== cursor.agent || rows[0]?.run_id !== cursor.run)) {
    throw new HttpError(409, 'memory changed; reload summaries')
  }
  const items: Summary[] = []
  for (const [index, row] of rows.slice(0, 5).entries()) {
    const run = await productRunIdentity({ companyId: input.companyId, principalId: input.userId, agentId: row.agent_id,
      conversationId: input.conversationId, runId: row.run_id, ...(input.threadId ? { threadId: input.threadId } : {}) }, db)
    const identity = { ...run, workId: run.runId }
    const scopes = await memory.scopes(identity)
    const resume = cursor?.run && cursor.agent === row.agent_id ? cursor : undefined
    for (let scopeIndex = resume?.scope ?? 0; scopeIndex < scopes.length; scopeIndex++) {
      const page = await memory.list(identity, scopes[scopeIndex], { limit: 30 - items.length,
        ...(resume?.scope === scopeIndex && resume.path ? { cursor: resume.path } : {}) })
      items.push(...page.items.map(entry => ({ id: entry.id, text: entry.description, agentId: row.agent_id, agentName: row.name })))
      if (page.nextCursor) return { items, nextCursor: encode({ agent: row.agent_id, run: row.run_id, scope: scopeIndex, path: page.nextCursor }) }
      if (items.length === 30 && scopeIndex + 1 < scopes.length) {
        return { items, nextCursor: encode({ agent: row.agent_id, run: row.run_id, scope: scopeIndex + 1 }) }
      }
      if (items.length === 30) break
    }
    if (items.length === 30 || index === 4) return { items, nextCursor: rows[index + 1]
      ? encode({ agent: row.agent_id, run: null, scope: 0 }) : null }
  }
  return { items, nextCursor: null }
}
