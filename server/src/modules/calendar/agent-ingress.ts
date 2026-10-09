import { createHash } from 'node:crypto'
import { pool } from '../../db/pool.js'
import { permissionService } from '../access/public.js'
import { calendarApplication } from './facade.js'
import type { ImMessageEnvelope } from '../../im/messages-application.js'

export async function resolveCalendarAgentRequest(input: { companyId: string; channelId: string; agentId: string }, message: ImMessageEnvelope) {
  const eventId = message.payload.metadata.custom.calendarEventId, scheduledFor = message.payload.metadata.custom.scheduledFor
  if (message.fromUid !== 'calendar' || message.payload.role !== 'system' || typeof eventId !== 'string'
    || typeof scheduledFor !== 'string' || !Number.isFinite(Date.parse(scheduledFor))
    || message.clientMsgNo !== `calendar-dispatch:${createHash('sha256').update(`${input.companyId}\0${eventId}\0${scheduledFor}`).digest('hex')}`) {
    throw new Error('committed calendar dispatch identity is invalid')
  }
  const { rows } = await pool.query<{ created_by: string; name: string; project_id: string }>(`SELECT event.created_by,human.name,event.project_id
    FROM calendar_events event JOIN calendar_dispatches dispatch ON dispatch.event_id=event.id AND dispatch.company_id=event.company_id
    JOIN conversations conversation ON conversation.id=$4 AND conversation.company_id=event.company_id AND conversation.project_id=event.project_id
    JOIN participants human ON human.company_id=event.company_id AND human.id=event.created_by AND human.kind='human' AND human.departed_at IS NULL
    WHERE event.company_id=$1 AND event.id=$2 AND dispatch.scheduled_for=$3 AND dispatch.status='dispatched'
      AND dispatch.conversation_id=$4 AND event.target_conversation_id=$4 AND event.assignee_id=$5 AND event.kind='agent_task'`,
    [input.companyId,eventId,scheduledFor,input.channelId,input.agentId])
  const row = rows[0]
  if (!row) throw new Error('calendar dispatch is outside the assigned event and project')
  await permissionService.assertCan({ actorUserId: row.created_by, companyId: input.companyId, action: 'calendar:read', resource: { type: 'calendar_event', id: eventId } })
  const event = await calendarApplication.get({ companyId: input.companyId, projectId: row.project_id, userId: row.created_by }, eventId)
  return { principalId: row.created_by, authorName: row.name, text: event.agentPrompt?.trim() || event.description?.trim() || event.title.trim() }
}
