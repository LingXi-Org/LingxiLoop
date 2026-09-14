import { productConversationId, assertFrozenAudience } from '../../agent-runtime/identity.js'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { NoEffectError, readRunReference, type ActionContext, type ToolDefinition } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import { nativeTool, compareResource } from '../../agents/tools.js'
import { queueNativeEvents } from '../../agents/native-events.js'
import { readAgentChannelMessages } from '../../im/public.js'
import { createPermissionService } from '../access/public.js'
import { pool } from '../../db/pool.js'
import type { ImMessageEnvelope } from '../../im/messages-application.js'
import type { RunIdentity } from '@lyyzka/lingxios'

export async function resolveAgentHandoffWake(input: { companyId: string; channelId: string; agentId: string }, message: ImMessageEnvelope): Promise<RunIdentity> {
  const { rows } = await pool.query<{ child_work_id: string; principal_id: string; thread_id: string | null }>(`SELECT child_work_id,principal_id,thread_id FROM agent_handoffs
    WHERE id=$1 AND company_id=$2 AND conversation_id=$3 AND to_agent_id=$4 AND from_agent_id=$5`,
    [message.payload.refs?.handoffId,input.companyId,input.channelId,input.agentId,message.fromUid])
  const row = rows[0]
  if (message.payload.kind !== 'handoff' || !row?.child_work_id || !row.principal_id) throw new Error('handoff is missing its authorized native child')
  const identity = await readRunReference(pool,input.companyId,row.child_work_id)
  if (!identity || identity.principalId !== row.principal_id || identity.agentId !== input.agentId) throw new Error('handoff child identity changed')
  return identity
}

const id = z.string().trim().min(1).max(200)
const note = z.string().trim().max(4000).nullable().optional()
export const handoffSchemas = {
  list: z.object({}).strict(),
  create: z.object({ toAgentId: id, title: z.string().trim().min(1).max(500), contextMessageIds: z.array(id).max(50).default([]), note }).strict(),
  update: z.object({ handoffId: id, status: z.enum(['accepted','working','completed','blocked']), note }).strict(),
}
interface Handoff {
  id: string; fromAgentId: string; toAgentId: string; title: string; status: string; note: string | null
  contextMessageIds: string[]; parentWorkId: string; childWorkId: string; requestVersion: number
}
const select = `SELECT id,from_agent_id AS "fromAgentId",to_agent_id AS "toAgentId",title,status,note,
  context_message_ids AS "contextMessageIds",parent_work_id AS "parentWorkId",child_work_id AS "childWorkId",request_version AS "requestVersion"
  FROM agent_handoffs WHERE company_id=$1 AND conversation_id=$2 AND principal_id=$3 AND thread_id IS NOT DISTINCT FROM $4`
async function read(context: ActionContext, handoffId: string, lock = false): Promise<Handoff> {
  const { rows } = await (context.database as Queryable).query<Handoff>(`${select} AND id=$5${lock ? ' FOR UPDATE' : ''}`,
    [context.work.tenantId,productConversationId(context.work),context.work.principalId,context.work.threadId ?? null,handoffId])
  if (!rows[0]) throw new NoEffectError('handoff is outside this principal and conversation', 'forbidden')
  return rows[0]
}
async function authorize(context: ActionContext) {
  await createPermissionService(context.database as Queryable, { lockDependencies: true }).assertCan({
    actorUserId: context.work.principalId!, companyId: context.work.tenantId,
    action: context.action.action === 'handoffs.list' ? 'conversation:read' : 'conversation:write',
    resource: { type: 'conversation', id: productConversationId(context.work) } })
}
async function publish(context: ActionContext, value: Handoff) {
  if (context.work.conversation?.internal) return
  await assertFrozenAudience(context.database as Queryable,context.work)
  const clientNonce = `handoff:${createHash('sha256').update(context.action.idempotencyKey).digest('hex')}`
  await queueNativeEvents(context, [{ type: 'im.system', companyId: context.work.tenantId, actorId: context.work.agentId,
    channelId: productConversationId(context.work), clientNonce, payload: { version: 1, kind: 'handoff', clientMsgNo: clientNonce,
      body: `${value.status}: ${value.title}${value.note ? ` — ${value.note}` : ''}`, refs: { handoffId: value.id },
      ...(context.work.threadId ? { replyToClientMsgNo: context.work.threadId } : {}),
      data: { ...value, sharedPaths: [], browserTargets: [], suppressAgentWake: true, activation: 'deliver' } } }])
}

export const handoffTools: ToolDefinition[] = [
  nativeTool('handoffs.list', handoffSchemas.list, { description: 'Read handoffs owned by the original human in this conversation.',
    effect: 'read', approval: false, authorize, async execute(context) {
      return { ok: true, value: (await context.database.query(`${select} AND (from_agent_id=$5 OR child_work_id=$6) ORDER BY created_at DESC LIMIT 100`,
        [context.work.tenantId,productConversationId(context.work),context.work.principalId,context.work.threadId ?? null,context.work.agentId,context.work.id])).rows }
    } }),
  nativeTool('handoffs.create', handoffSchemas.create, { description: 'Delegate to another active member agent and wait for its durable child task.',
    effect: 'transaction', approval: false, async authorize(context, input) {
      await authorize(context)
      const { rows } = await context.database.query(`SELECT p.id FROM participants p JOIN im_channel_bindings b ON b.company_id=p.company_id
        WHERE p.company_id=$1 AND p.id=$2 AND p.id<>$3 AND p.kind='agent' AND p.departed_at IS NULL
          AND b.channel_id=$4 AND b.profile->'members' ? p.id
          AND NOT EXISTS(SELECT 1 FROM learning_project_teacher_agents t WHERE t.company_id=p.company_id AND t.agent_id=p.id) FOR SHARE OF p,b`,
      [context.work.tenantId,input.toAgentId,context.work.agentId,productConversationId(context.work)])
      if (!rows.length) throw new NoEffectError('handoff target must be another active agent in this conversation', 'forbidden')
    }, async execute(context, input) {
      if (input.contextMessageIds.length) {
        const messages = await readAgentChannelMessages({ companyId: context.work.tenantId, agentId: context.work.agentId,
          channelId: productConversationId(context.work), messageIds: input.contextMessageIds, signal: context.signal })
        if (new Set(messages?.map(message => message.messageId)).size !== new Set(input.contextMessageIds).size) throw new NoEffectError('handoff context messages are unavailable')
      }
      const handoffId = `handoff-${createHash('sha256').update(context.action.idempotencyKey).digest('hex').slice(0,32)}`
      const child = await context.enqueueChild({ id: `${handoffId}:work`, agentId: input.toAgentId, kind: 'handoff',
        text: [`Handoff: ${input.title}`, input.note ?? '', input.contextMessageIds.length ? `Context message IDs: ${input.contextMessageIds.join(', ')}` : ''].filter(Boolean).join('\n'),
        executionClass: 'operation', meta: { conversationId: productConversationId(context.work), handoffId, contextMessageIds: input.contextMessageIds } })
      await context.database.query(`INSERT INTO agent_handoffs(id,company_id,conversation_id,from_agent_id,to_agent_id,title,context_message_ids,note,
        status,idempotency_key,principal_id,parent_work_id,child_work_id,request_version,thread_id)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'working',$9,$10,$11,$12,$13,$14)`,
      [handoffId,context.work.tenantId,productConversationId(context.work),context.work.agentId,input.toAgentId,input.title,JSON.stringify(input.contextMessageIds),
        input.note ?? null,context.action.idempotencyKey,context.work.principalId,context.work.id,child.id,context.requestVersion,context.work.threadId ?? null])
      const value = await read(context, handoffId)
      await publish(context, value)
      return { ok: true, value, directive: await context.waitForChildren([child.id]) }
    }, async verify(context, _input, value) {
      await authorize(context)
      const expected = value as Handoff, actual = await read(context, expected.id)
      return compareResource(`handoff:${expected.id}`, { childWorkId: expected.childWorkId, toAgentId: expected.toAgentId }, actual)
    } }),
  nativeTool('handoffs.update', handoffSchemas.update, { description: 'Record the target agent’s handoff progress; the parent resumes only after the child task ends.',
    effect: 'transaction', approval: false, async authorize(context, input) {
      await authorize(context)
      const row = await read(context, input.handoffId)
      if (row.toAgentId !== context.work.agentId || row.childWorkId !== context.work.id) throw new NoEffectError('only the assigned child task can update this handoff', 'forbidden')
    }, async execute(context, input) {
      const row = await read(context, input.handoffId, true)
      if (['completed','blocked'].includes(row.status) && row.status !== input.status) throw new NoEffectError('handoff is already terminal')
      await context.database.query('UPDATE agent_handoffs SET status=$2,note=$3,updated_at=NOW() WHERE id=$1',
        [row.id,input.status,input.note ?? row.note])
      const value = await read(context, row.id)
      await publish(context, value)
      return { ok: true, value }
    }, async verify(context, _input, value) {
      await authorize(context)
      const expected = value as Handoff
      return compareResource(`handoff:${expected.id}`, { status: expected.status, note: expected.note }, await read(context, expected.id))
    } }),
]
