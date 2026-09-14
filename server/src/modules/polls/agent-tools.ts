import { productConversationId } from '../../agent-runtime/identity.js'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { NoEffectError, type ActionContext, type ToolDefinition } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import { nativeTool } from '../../agents/tools.js'
import { createPermissionService } from '../access/public.js'
import { PollApplication } from './application.js'
import { createPollRequestSchema, votePollRequestSchema, type PollSnapshot } from './contracts.js'

function application(context: ActionContext) {
  const db = context.database as Queryable
  return new PollApplication(db, { transaction: work => work(db),
    publishSnapshot: async () => { throw new NoEffectError('transactional polls publish through the native sweeper') } })
}

async function authorize(context: ActionContext, input: { messageId?: string }) {
  const { work } = context, method = context.action.action.split('.')[1]
  if (input.messageId && await application(context).conversationId(work.tenantId, input.messageId) !== productConversationId(work)) {
    throw new NoEffectError('poll is outside the authorized conversation', 'forbidden')
  }
  await createPermissionService(context.database as Queryable, { lockDependencies: true }).assertCan({ actorUserId: work.principalId!, companyId: work.tenantId,
    action: method === 'show' ? 'poll:read' : method === 'create' ? 'poll:create' : method === 'vote' ? 'poll:vote' : 'poll:close',
    resource: input.messageId ? { type: 'poll', id: input.messageId } : { type: 'conversation', id: productConversationId(work) } })
}

async function result(context: ActionContext, messageId: string) {
  return { ok: true as const, value: { messageId, snapshot: await application(context).show(context.work.tenantId, messageId), publication: 'queued' } }
}

const messageSchema = z.object({ messageId: z.string().trim().min(1).max(2000) }).strict()
const verify: ToolDefinition['verify'] = async (context, _input, value) => {
  const receipt = value as { messageId: string; snapshot: PollSnapshot }
  await authorize({ ...context, action: { ...context.action, action: 'polls.show' } }, receipt)
  const snapshot = await application(context).show(context.work.tenantId, receipt.messageId)
  const mismatches = isDeepStrictEqual(snapshot, receipt.snapshot) ? [] : ['snapshot']
  return { status: mismatches.length ? 'failed' : 'passed',
    evidence: { resource: `poll:${receipt.messageId}`, fields: ['snapshot'], mismatches, snapshot } }
}

export const pollTools: ToolDefinition[] = [
  nativeTool('polls.create', createPollRequestSchema.omit({ clientRequestId: true, conversationId: true }), { description: 'Create a poll in this conversation.', effect: 'transaction', approval: false, verify,
    authorize: context => authorize(context, {}),
    async execute(context, input) {
      const row = await application(context).persistCreate({ ...input, companyId: context.work.tenantId, actorId: context.work.agentId,
        conversationId: productConversationId(context.work), idempotencyKey: context.action.idempotencyKey })
      return result(context, row.poll_client_msg_no)
    } }),
  nativeTool('polls.vote', votePollRequestSchema.extend(messageSchema.shape), { description: 'Replace this agent’s votes in an open poll.', effect: 'transaction', approval: false, authorize, verify,
    async execute(context, input) {
      await application(context).persistVote(context.database as Queryable, { ...input, companyId: context.work.tenantId, actorId: context.work.agentId, voterKind: 'agent' })
      return result(context, input.messageId)
    } }),
  nativeTool('polls.close', messageSchema, { description: 'Close a poll authored by this agent.', effect: 'transaction', approval: false, authorize, verify,
    async execute(context, input) {
      await application(context).persistClose(context.database as Queryable, { ...input, companyId: context.work.tenantId, actorId: context.work.agentId, reason: 'manual' })
      return result(context, input.messageId)
    } }),
  nativeTool('polls.show', messageSchema, { description: 'Read a poll and its current tallies.', effect: 'read', approval: false, authorize,
    async execute(context, input) { return { ok: true, value: await application(context).show(context.work.tenantId, input.messageId) } } }),
]
