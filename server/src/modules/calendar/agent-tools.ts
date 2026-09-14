import { productConversationId } from '../../agent-runtime/identity.js'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { NoEffectError, type ActionContext, type ToolDefinition } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import { nativeTool, authorizeAudienceRead } from '../../agents/tools.js'
import { queueNativeEvents } from '../../agents/native-events.js'
import { createPermissionService } from '../access/public.js'
import { CalendarApplication } from './application.js'
import { agentCalendarSchemas, type CalendarChangedEvent } from './contracts.js'

async function scope(context: ActionContext, eventId?: string, write = false) {
  const { work } = context, db = context.database as Queryable
  const { rows } = await db.query<{ project_id: string }>('SELECT project_id FROM conversations WHERE company_id=$1 AND id=$2 FOR SHARE', [work.tenantId,productConversationId(work)])
  const projectId = rows[0]?.project_id
  if (!projectId || !work.principalId) throw new NoEffectError('calendar project scope is unavailable', 'forbidden')
  await authorizeAudienceRead(context,{ projectId,action: 'calendar:read',resource: { type: eventId ? 'calendar_event' : 'project',id: eventId ?? projectId } })
  await createPermissionService(db, { lockDependencies: true }).assertCan({ actorUserId: work.principalId, companyId: work.tenantId, projectId,
    action: write ? 'calendar:write' : 'calendar:read', resource: { type: eventId ? 'calendar_event' : 'project', id: eventId ?? projectId } })
  return { companyId: work.tenantId, projectId, userId: work.principalId, actorId: work.agentId }
}

function application(context: ActionContext) {
  const events: CalendarChangedEvent[] = []
  return { events, app: new CalendarApplication(context.database as Queryable, { publish: async event => { events.push(event) } },
    { dispatch: async () => { throw new NoEffectError('calendar tasks are dispatched by the scheduler') } }) }
}

async function observed(context: ActionContext, input: { eventId: string; expected: Record<string, unknown> }) {
  const currentScope = await scope(context, input.eventId, true)
  await context.database.query('SELECT id FROM calendar_events WHERE company_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE',
    [currentScope.companyId,currentScope.projectId,input.eventId])
  const current = await application(context).app.get(currentScope, input.eventId)
  if (!isDeepStrictEqual(current, input.expected)) throw new NoEffectError('calendar event changed; read it again', 'resource_conflict')
  return current
}

async function authorizeTarget(context: ActionContext, target?: string | null) {
  if (target) await createPermissionService(context.database as Queryable, { lockDependencies: true }).assertCan({
    actorUserId: context.work.principalId!, companyId: context.work.tenantId, action: 'conversation:write', resource: { type: 'conversation', id: target } })
}

const verify: ToolDefinition['verify'] = async (context, _input, value) => {
  const receipt = value as { eventId: string; event: unknown }
  const event = await application(context).app.find(await scope(context), receipt.eventId)
  const mismatches = isDeepStrictEqual(event, receipt.event) ? [] : ['event']
  return { status: mismatches.length ? 'failed' : 'passed',
    evidence: { resource: `calendar:${receipt.eventId}`, fields: ['event'], mismatches, event } }
}

export const calendarTools: ToolDefinition[] = [
  nativeTool('calendar.list', agentCalendarSchemas.list, { description: 'List calendar events within a range of at most 366 days.', effect: 'read', approval: false,
    authorize: async context => { await scope(context) },
    async execute(context, input) { const events = await application(context).app.list(await scope(context), input); return { ok: true, value: { events: events.slice(0,100), truncated: events.length > 100 } } } }),
  nativeTool('calendar.get', agentCalendarSchemas.get, { description: 'Read the complete visible calendar event before updating or deleting.', effect: 'read', approval: false,
    authorize: async (context, input) => { await scope(context, input.eventId) },
    async execute(context, input) { return { ok: true, value: await application(context).app.get(await scope(context, input.eventId), input.eventId) } } }),
  nativeTool('calendar.dispatches', agentCalendarSchemas.get, { description: 'Read calendar task dispatch receipts.', effect: 'read', approval: false,
    authorize: async (context, input) => { await scope(context, input.eventId) },
    async execute(context, input) { const dispatches = await application(context).app.dispatches(await scope(context, input.eventId), input.eventId); return { ok: true, value: { dispatches: dispatches.slice(0,100), truncated: dispatches.length > 100 } } } }),
  nativeTool('calendar.create', agentCalendarSchemas.create, { description: 'Request approval to create a calendar event.', effect: 'transaction', approval: true, verify,
    authorize: async (context, input) => { await scope(context, undefined, true); await authorizeTarget(context, input.targetConversationId ?? (input.kind === 'agent_task' ? productConversationId(context.work) : null)) },
    async preview(context, input) { return JSON.parse(JSON.stringify({ scope: await scope(context, undefined, true), input })) as Record<string, unknown> },
    async execute(context, input) {
      const native = application(context), eventId = 'ce-' + createHash('sha256').update(context.action.idempotencyKey).digest('hex')
      const event = await native.app.create(await scope(context, undefined, true), { ...input,
        ...(input.kind === 'agent_task' && !input.targetConversationId ? { targetConversationId: productConversationId(context.work) } : {}) }, { eventId })
      await queueNativeEvents(context, native.events)
      return { ok: true, value: { eventId, event, notification: 'queued' } }
    } }),
  nativeTool('calendar.update', agentCalendarSchemas.update, { description: 'Update a calendar event when its complete observed state still matches.', effect: 'transaction', approval: false, verify,
    authorize: async (context, input) => { await scope(context, input.eventId, true); await authorizeTarget(context,
      Object.hasOwn(input.patch, 'targetConversationId') ? input.patch.targetConversationId : input.expected.targetConversationId as string | null) },
    async execute(context, input) {
      await observed(context, input)
      const native = application(context), event = await native.app.update(await scope(context, input.eventId, true), input.eventId, input.patch)
      await queueNativeEvents(context, native.events)
      return { ok: true, value: { eventId: input.eventId, event, notification: 'queued' } }
    } }),
  nativeTool('calendar.delete', agentCalendarSchemas.delete, { description: 'Request approval to delete an unchanged calendar event.', effect: 'transaction', approval: true,
    authorize: async (context, input) => { await scope(context, input.eventId, true) },
    async preview(context, input) { return { event: await observed(context, input) } },
    async execute(context, input) {
      const native = application(context)
      await native.app.delete(await scope(context, input.eventId, true), input.eventId)
      await queueNativeEvents(context, native.events)
      return { ok: true, value: { eventId: input.eventId, deleted: true } }
    },
    async verify(context, input) { const event = await application(context).app.find(await scope(context), input.eventId);
      return { status: event ? 'failed' : 'passed', evidence: { resource: `calendar:${input.eventId}`, fields: ['deleted'], deleted: !event } } } }),
]
