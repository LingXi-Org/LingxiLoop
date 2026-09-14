import { productConversationId } from '../../agent-runtime/identity.js'
import { z } from 'zod'
import type { ActionContext, ToolDefinition } from '@lyyzka/lingxios'
import { nativeTool, compareResource, authorizeAudienceRead } from '../../agents/tools.js'
import { queueNativeEvents, type NativeEvent } from '../../agents/native-events.js'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import { isTeacherRoom } from '../learning/visibility.js'
import { ConversationsApplication } from './application.js'
import { conversationInfrastructure } from './facade.js'
import { addMemberRequestSchema, topicRequestSchema, titleRequestSchema, muteRequestSchema } from './contracts.js'

function application(context: ActionContext) {
  const db = context.database as Queryable, events: NativeEvent[] = []
  return { events, app: new ConversationsApplication(db, { ...conversationInfrastructure,
    transaction: work => work(db), isTeacherRoom: (companyId, conversationId) => isTeacherRoom(conversationId, companyId, db),
    syncChannel: async profile => { events.push({ type: 'im.channel_sync', companyId: context.work.tenantId, channelId: profile.channelId }) },
    publishUpdated: async event => { events.push(event) },
    postMembershipMessage: async input => { events.push({ type: 'im.membership', ...input, clientNonce: `membership:${context.action.idempotencyKey}` }); return { queued: true } },
    clearReplyHold: async (agentId, conversationId) => { events.push({ type: 'im.clear_hold', agentId, conversationId }) },
  }) }
}

async function authorize(context: ActionContext) {
  const method = context.action.action.split('.')[1]
  await authorizeAudienceRead(context,{ action: 'conversation:read',resource: { type: 'conversation',id: productConversationId(context.work) } })
  await createPermissionService(context.database as Queryable, { lockDependencies: true }).assertCan({
    actorUserId: context.work.principalId!, companyId: context.work.tenantId,
    action: ['metadata','list_mutes'].includes(method) ? 'conversation:read' : method === 'set_muted' ? 'conversation:write' : 'conversation:manage',
    resource: { type: 'conversation', id: productConversationId(context.work) } })
}

const verify: ToolDefinition['verify'] = async (context, _input, value) => {
  await authorize({ ...context, action: { ...context.action, action: 'chat.metadata' } })
  const receipt = value as { expected: Record<string, unknown> }
  return compareResource(`conversation:${productConversationId(context.work)}`, receipt.expected,
    await application(context).app.getAgentMetadata(context.work.agentId, productConversationId(context.work)))
}

export const conversationTools: ToolDefinition[] = [
  nativeTool('chat.metadata', z.object({}).strict(), { description: 'Read the current conversation metadata.', effect: 'read', approval: false, authorize,
    async execute(context) { return { ok: true, value: await application(context).app.getAgentMetadata(context.work.agentId, productConversationId(context.work)) } } }),
  nativeTool('chat.list_mutes', z.object({}).strict(), { description: 'Read this agent’s conversation mute settings.', effect: 'read', approval: false, authorize,
    async execute(context) {
      const mutes = await application(context).app.listAgentMutes(context.work.agentId)
      for (const mute of mutes) await authorizeAudienceRead(context,{
        action: 'conversation:read', resource: { type: 'conversation', id: mute.id } })
      return { ok: true, value: mutes }
    } }),
  nativeTool('chat.add_member', z.object({ participantId: addMemberRequestSchema.shape.id }).strict(), { description: 'Add a permitted participant to this group conversation.', effect: 'transaction', approval: false, authorize, verify,
    async execute(context, input) {
      const native = application(context), result = await native.app.addAgentMember(context.work.agentId, productConversationId(context.work), input.participantId)
      await queueNativeEvents(context, native.events)
      return { ok: true, value: { ...result, expected: { members: result.members } } }
    } }),
  nativeTool('chat.set_topic', topicRequestSchema, { description: 'Set or clear this conversation’s topic.', effect: 'transaction', approval: false, authorize, verify,
    async execute(context, input) {
      const native = application(context), result = await native.app.setAgentTopic(context.work.agentId, productConversationId(context.work), input.topic)
      await queueNativeEvents(context, native.events)
      return { ok: true, value: { ...result, expected: { topic: result.topic } } }
    } }),
  nativeTool('chat.rename', titleRequestSchema.extend({ expectedTitle: titleRequestSchema.shape.title.optional() }), { description: 'Rename this group; an expected title protects against concurrent edits.', effect: 'transaction', approval: false, authorize, verify,
    async execute(context, input) {
      const native = application(context), result = await native.app.setAgentTitle(context.work.agentId, productConversationId(context.work), input.title, input.expectedTitle)
      await queueNativeEvents(context, native.events)
      return { ok: true, value: { ...result, expected: { title: result.title } } }
    } }),
  nativeTool('chat.set_muted', z.object({ muted: muteRequestSchema.shape.mute, until: muteRequestSchema.shape.until }).strict(), { description: 'Mute or unmute this group for the agent.', effect: 'transaction', approval: false, authorize,
    async execute(context, input) {
      const native = application(context), result = await native.app.setAgentMuted(context.work.agentId, productConversationId(context.work), input.muted, input.until ? new Date(input.until) : null)
      await queueNativeEvents(context, native.events)
      return { ok: true, value: result }
    },
    async verify(context, input) {
      await authorize({ ...context, action: { ...context.action, action: 'chat.list_mutes' } })
      const mute = (await application(context).app.listAgentMutes(context.work.agentId)).find(row => row.id === productConversationId(context.work))
      return compareResource(`conversation:${productConversationId(context.work)}:mute:${context.work.agentId}`, { muted: input.muted }, { muted: !!mute })
    } }),
]
