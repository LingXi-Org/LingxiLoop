import type { Queryable } from '../db/queryable.js'
import type { PermissionAction, PermissionResource } from '../modules/access/public.js'
import { createPermissionService } from '../modules/access/public.js'
import type { AgentWorkItem, HostAction } from './types.js'

const LEARNING_READ_METHODS = new Set([
  'current', 'get_learner_state', 'list_knowledge_units', 'list_due', 'get_mission', 'get_activity',
])
const KNOWLEDGE_READ_METHODS = new Set([
  'list_sources', 'get_source', 'search', 'ask', 'list_notes', 'get_note', 'list_insights',
  'start_source_chat', 'send_source_chat_message',
])
const KNOWLEDGE_MANAGE_METHODS = new Set([
  'retry_ingestion', 'update_source', 'set_source_enabled', 'unlink_source', 'delete_source',
])
const CANVAS_READ_METHODS = new Set(['available_agents', 'get'])

interface ProductPermission {
  action: PermissionAction
  resource?: PermissionResource
}

function text(args: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    if (typeof args[name] === 'string' && args[name].trim()) return args[name].trim()
  }
  return ''
}

function conversation(id: string): PermissionResource {
  return { type: 'conversation', id }
}

function productPermission(work: AgentWorkItem, action: HostAction): ProductPermission {
  const [namespace, method] = action.action.split('.')
  const args = action.args && typeof action.args === 'object' && !Array.isArray(action.args)
    ? action.args as Record<string, unknown>
    : {}
  switch (namespace) {
    case 'learning':
      return {
        action: LEARNING_READ_METHODS.has(method) ? 'learning:read' : 'learning:submit',
        resource: conversation(work.channelId),
      }
    case 'teacher':
      return {
        action: method.includes('review') || method.includes('evaluation') ? 'learning:review' : 'learning:manage',
        resource: conversation(work.channelId),
      }
    case 'knowledge': {
      const sourceId = text(args, 'sourceId')
      return {
        action: KNOWLEDGE_READ_METHODS.has(method)
          ? 'knowledge:read'
          : KNOWLEDGE_MANAGE_METHODS.has(method) ? 'knowledge:manage' : 'knowledge:write',
        resource: sourceId && KNOWLEDGE_MANAGE_METHODS.has(method)
          ? { type: 'knowledge_source', id: sourceId }
          : conversation(work.channelId),
      }
    }
    case 'chat':
      return {
        action: method === 'history' ? 'conversation:read' : 'conversation:write',
        resource: conversation(text(args, 'channelId') || work.channelId),
      }
    case 'polls': {
      const pollId = text(args, 'messageId', 'pollId')
      if (method === 'vote') return { action: 'poll:vote', resource: { type: 'poll', id: pollId } }
      if (method === 'close') return { action: 'poll:close', resource: { type: 'poll', id: pollId } }
      return { action: method === 'show' ? 'poll:read' : 'poll:create', resource: conversation(work.channelId) }
    }
    case 'canvas': {
      const canvasId = text(args, 'canvasId') || work.canvasId
      return {
        action: CANVAS_READ_METHODS.has(method) ? 'canvas:read' : 'canvas:write',
        resource: canvasId ? { type: 'canvas', id: canvasId } : conversation(work.channelId),
      }
    }
    case 'documents': {
      const documentId = text(args, 'documentId', 'id')
      return {
        action: method === 'delete' ? 'document:delete' : method === 'read' || method === 'get'
          ? 'document:read' : 'document:write',
        resource: documentId ? { type: 'document', id: documentId } : conversation(work.channelId),
      }
    }
    case 'calendar': {
      const eventId = text(args, 'eventId', 'id')
      return {
        action: method.startsWith('list') || method === 'get' ? 'calendar:read' : 'calendar:write',
        resource: eventId ? { type: 'calendar_event', id: eventId } : conversation(work.channelId),
      }
    }
    case 'email': {
      const messageId = text(args, 'messageId')
      return {
        action: method === 'get' || method === 'html' ? 'email:read' : 'email:write',
        resource: messageId ? { type: 'message', id: messageId } : conversation(work.channelId),
      }
    }
    case 'memory':
      return {
        action: method === 'recall' || method === 'list' || method === 'verify'
          ? 'agent_memory:read' : 'agent_memory:write',
        resource: conversation(work.channelId),
      }
    case 'routines': {
      const routineId = text(args, 'routineId')
      return {
        action: 'agent_run:control',
        resource: routineId ? { type: 'routine', id: routineId } : conversation(work.channelId),
      }
    }
    case 'files':
      return { action: 'attachment:write', resource: conversation(work.channelId) }
    case 'research':
    case 'turn':
      return { action: 'agent:read', resource: conversation(work.channelId) }
    default:
      throw new Error(`Host Action namespace is not registered for product authorization: ${namespace}`)
  }
}

/** Re-authorize the persisted human principal at the final Host Action boundary. */
export async function assertHostActionPermission(
  db: Queryable,
  work: AgentWorkItem,
  hostAction: HostAction,
): Promise<void> {
  if (!work.authorizationUserId) throw new Error('Host Action has no persisted human authorization principal')
  const permission = productPermission(work, hostAction)
  await createPermissionService(db, { lockDependencies: true }).assertCan({
    actorUserId: work.authorizationUserId,
    action: permission.action,
    companyId: work.companyId,
    ...(permission.resource ? { resource: permission.resource } : {}),
  })
}
