import { productConversationId } from '../agent-runtime/identity.js'
import { z } from 'zod'
import { isDeepStrictEqual } from 'node:util'
import { NoEffectError, type ActionContext, type ToolDefinition } from '@lyyzka/lingxios'
import type { Queryable } from '../db/queryable.js'
import { createPermissionService, type PermissionRequest } from '../modules/access/public.js'
import type { AgentActionContext } from './contracts.js'
import { assignedHandoff } from '../modules/agents/handoff-repository.js'

export function compareResource(resource: string, expected: Record<string, unknown>, actual: object) {
  // Receipts cross a JSON boundary; PostgreSQL Date values must compare in that same representation.
  const json = (value: unknown) => value === undefined ? undefined : JSON.parse(JSON.stringify(value)) as unknown
  const fields = Object.keys(expected), observed = Object.fromEntries(fields.map(field => [field, json(Reflect.get(actual, field))]))
  const mismatches = fields.filter(field => !isDeepStrictEqual(observed[field], json(expected[field])))
  return { status: mismatches.length ? 'failed' as const : 'passed' as const,
    evidence: { resource, fields, mismatches, observed } }
}

export function nativeContext(context: Pick<ActionContext, 'work'>): AgentActionContext {
  const work = context.work
  return { id: work.id, companyId: work.tenantId, authorizationUserId: work.principalId,
    agentId: work.agentId, channelId: productConversationId(work), triggerClientMsgNo: work.triggerRef,
    ...(work.threadId ? { threadRootClientMsgNo: work.threadId } : {}),
    reason: work.kind === 'teacher_digest' ? 'routine' : ['handoff', 'routine', 'resume', 'canvas_worker', 'canvas_summary'].includes(work.kind)
      ? work.kind as AgentActionContext['reason'] : 'message' }
}

export async function audienceHumanIds(context: Pick<ActionContext, 'work' | 'database'>): Promise<string[]> {
  const db = context.database as Queryable, { work } = context
  const ids = work.conversation?.audience.participantIds ?? []
  const { rows } = await db.query<{ id: string; kind: string; departed_at: string | null }>(
    'SELECT id,kind,departed_at FROM participants WHERE company_id=$1 AND id=ANY($2::text[]) FOR SHARE', [work.tenantId,ids])
  if (rows.length !== new Set(ids).size || rows.some(row => row.departed_at)) throw new NoEffectError('conversation audience is no longer available','forbidden')
  return [...new Set([work.principalId!,...rows.filter(row => row.kind === 'human').map(row => row.id)])]
}

export async function authorizeAudienceRead(context: Pick<ActionContext, 'work' | 'database'>, request: Omit<PermissionRequest, 'actorUserId' | 'companyId'>) {
  const permissions = createPermissionService(context.database as Queryable,{ lockDependencies: true })
  for (const actorUserId of await audienceHumanIds(context)) {
    await permissions.assertCan({ ...request,companyId: context.work.tenantId,actorUserId })
  }
}

export async function authorizeAgent(context: ActionContext) {
  context.signal.throwIfAborted()
  const { work } = context
  if (!work.principalId) throw new NoEffectError('original human principal is required', 'forbidden')
  const db = context.database as Queryable
  const principal = await db.query(`SELECT 1 FROM users WHERE id=$1 AND suspended_at IS NULL AND deleted_at IS NULL AND departed_at IS NULL
    AND (access_revoked_at IS NULL OR access_revoked_at<$2::timestamptz) FOR SHARE`, [work.principalId,work.createdAt ?? null])
  if (!principal.rows[0]) throw new NoEffectError('original authorization period has ended', 'forbidden')
  const { rows } = await db.query<{ capabilities: string[]; teacher_managed: boolean; canvas_reporter: boolean }>(`SELECT p.capabilities,
      EXISTS(SELECT 1 FROM canvas_agent_runs run WHERE run.work_id=$4 AND run.company_id=p.company_id
        AND run.agent_id=p.id AND run.execution_role='reporter') AS canvas_reporter,
      EXISTS(SELECT 1 FROM learning_project_teacher_agents teacher WHERE teacher.company_id=p.company_id AND teacher.agent_id=p.id) AS teacher_managed
    FROM participants p JOIN im_channel_bindings b ON b.company_id=p.company_id AND b.channel_id=$3
    WHERE p.id=$2 AND p.company_id=$1 AND p.kind='agent' AND p.departed_at IS NULL
      AND b.profile->'members' ? p.id FOR SHARE OF p,b`, [work.tenantId,work.agentId,productConversationId(work),work.id])
  const agent = rows[0], namespace = context.action.action.split('.')[0]
  const capability = namespace === 'research' ? 'web' : namespace === 'presentations' ? 'knowledge' : namespace
  const assigned = ['handoffs.list','handoffs.update'].includes(context.action.action) && !!await assignedHandoff(db,work)
  if (!agent || agent.teacher_managed !== (namespace === 'teacher')
    || !['teacher', 'memory', 'chat', 'polls', 'directory'].includes(namespace) && !agent.capabilities.includes(capability) && !assigned) {
    throw new NoEffectError('agent capability or membership was revoked', 'forbidden')
  }
  await createPermissionService(db, { lockDependencies: true }).assertCan({ actorUserId: work.principalId,
    companyId: work.tenantId, action: 'conversation:read', resource: { type: 'conversation', id: productConversationId(work) } })
  return agent
}

/** Both model JSON Schema and native parsing come from this same schema. */
export function nativeTool<S extends z.ZodObject>(action: string, schema: S,
  definition: Omit<ToolDefinition<z.output<S>>, 'action' | 'name' | 'parameters' | 'parse'>): ToolDefinition<z.output<S>> {
  const parameters = z.toJSONSchema(schema, { io: 'input' })
  if (parameters.type !== 'object' || !parameters.properties || parameters.additionalProperties !== false) throw new Error(`${action} requires a strict object schema`)
  return { ...definition, action, name: action.replace('.', '__'), parameters: parameters as ToolDefinition['parameters'],
    parse: input => schema.parse(input),
    async authorize(context, input) {
      try {
        const agent = await authorizeAgent(context)
        if (agent.canvas_reporter && !['canvas.current','canvas.submit_report'].includes(action)) {
          throw new NoEffectError('Canvas reporters may only read the workspace and submit reports', 'forbidden')
        }
        await definition.authorize(context, input)
      }
      catch (error) { if (error instanceof Error && 'reason' in error) throw new NoEffectError(error.message, 'forbidden'); throw error }
    },
    ...(definition.verify ? { async verify(context: ActionContext, input: z.output<S>, value: unknown) {
      await authorizeAgent(context)
      return definition.verify!(context, input, value)
    } } : {}),
  }
}
