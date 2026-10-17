import { z } from 'zod'
import type { ActionContext, ToolDefinition } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import { nativeTool, authorizeAudienceRead } from '../../agents/tools.js'
import { ForbiddenError, type PermissionReason } from '../access/public.js'
import { AgentDirectoryApplication } from './directory-application.js'

const empty = z.object({}).strict()
const participants = z.object({ kind: z.enum(['agent','human']).optional() }).strict()
const application = (context: ActionContext) => new AgentDirectoryApplication(context.database as Queryable)
const authorize = async (context: ActionContext) => { await authorizeAudienceRead(context,{
  action: 'agent:read', resource: { type: 'agent', id: context.work.agentId } }) }

// Only candidate-local denials may be omitted. Principal, tenant and frozen-audience
// revocation still abort the read, as do unknown permission-resolution failures.
const invisibleConversationReasons = new Set<PermissionReason>([
  'RESOURCE_NOT_FOUND', 'RESOURCE_SCOPE_MISMATCH', 'RESOURCE_MEMBERSHIP_REQUIRED', 'RESOURCE_STATE_DENIED',
  'PROJECT_NOT_FOUND', 'PROJECT_MEMBERSHIP_REQUIRED', 'PROJECT_MEMBERSHIP_INACTIVE', 'PROJECT_STATE_DENIED',
  'PLAN_NOT_FOUND', 'PLAN_INACTIVE', 'ROLE_NOT_ALLOWED', 'ENTITLEMENT_MISSING',
])

export const directoryTools: ToolDefinition[] = [
  nativeTool('directory.self', empty, { description: 'Read this agent’s identity and authorized conversations.', effect: 'read', approval: false, authorize,
    async execute(context) {
      const value = await application(context).identity(context.work.agentId)
      const conversations: typeof value.conversations = []
      for (const conversation of value.conversations) {
        try {
          await authorizeAudienceRead(context,{
            action: 'conversation:read', resource: { type: 'conversation', id: conversation.id } })
          conversations.push(conversation)
        } catch (error) {
          // The permission service fails closed with this reason on dependency/code
          // errors. Preserve a failure for the runtime's existing bounded recovery.
          if (error instanceof ForbiddenError && error.reason === 'DENY_BY_DEFAULT') {
            throw new Error('directory conversation authorization unavailable', { cause: error })
          }
          if (!(error instanceof ForbiddenError) || !invisibleConversationReasons.has(error.reason)) throw error
        }
      }
      return { ok: true, value: { identity: value.identity, conversations } }
    } }),
  nativeTool('directory.participants', participants, { description: 'List active workspace participants.', effect: 'read', approval: false, authorize,
    async execute(context, input) { return { ok: true, value: await application(context).participants(context.work.agentId, input.kind ?? null) } } }),
  nativeTool('directory.statuses', empty, { description: 'List active workspace agent statuses.', effect: 'read', approval: false, authorize,
    async execute(context) { return { ok: true, value: await application(context).statuses(context.work.agentId) } } }),
]
