import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type {
  CalendarChangedEvent,
  CalendarDispatchPayload,
  CalendarDispatchResult,
  CalendarEventPayload,
  CalendarScope,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
} from './contracts.js'
import {
  calendarConversationExists,
  calendarParticipantExists,
  deleteVisibleCalendarEvent,
  findCalendarDirectConversation,
  findVisibleCalendarEvent,
  insertCalendarEvent,
  listCalendarDispatches,
  listCalendarEvents,
  listRecentSharedCalendarEvents,
  type CalendarEventRow,
  updateVisibleCalendarEvent,
} from './repository.js'

export type CalendarErrorCode =
  | 'event_not_found'
  | 'assignee_not_found'
  | 'conversation_not_found'
  | 'invalid_event'

export class CalendarApplicationError extends Error {
  constructor(readonly code: CalendarErrorCode, message: string) {
    super(message)
  }
}

export interface CalendarEventPublisher {
  publish(event: CalendarChangedEvent): Promise<void>
}

export interface CalendarDispatcher {
  dispatch(event: CalendarEventRow, scheduledFor: Date): Promise<CalendarDispatchResult>
}

function toPayload(row: CalendarEventRow): CalendarEventPayload {
  return {
    id: row.id,
    companyId: row.company_id,
    createdBy: row.created_by,
    kind: row.kind,
    title: row.title,
    description: row.description,
    assigneeId: row.assignee_id,
    targetConversationId: row.target_conversation_id,
    agentPrompt: row.agent_prompt,
    startAt: row.start_at.toISOString(),
    endAt: row.end_at?.toISOString() ?? null,
    allDay: row.all_day,
    recurrence: row.recurrence,
    status: row.status,
    lastFiredAt: row.last_fired_at?.toISOString() ?? null,
    reminderMinutesBefore: row.reminder_minutes_before,
    reminderChannel: row.reminder_channel,
    isPrivate: row.is_private,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

function toDispatchPayload(row: Awaited<ReturnType<typeof listCalendarDispatches>>[number]): CalendarDispatchPayload {
  return {
    id: row.id,
    eventId: row.event_id,
    scheduledFor: row.scheduled_for.toISOString(),
    dispatchedAt: row.dispatched_at.toISOString(),
    status: row.status,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    error: row.error,
  }
}

function assertCoherentEvent(event: {
  kind: CalendarEventRow['kind']
  assigneeId: string | null
  targetConversationId: string | null
  startAt: Date
  endAt: Date | null
  reminderMinutesBefore: number | null
  reminderChannel: CalendarEventRow['reminder_channel']
}): void {
  if (event.kind === 'agent_task' && (!event.assigneeId || !event.targetConversationId)) {
    throw new CalendarApplicationError(
      'invalid_event',
      'agent_task events require assigneeId and targetConversationId',
    )
  }
  if ((event.reminderMinutesBefore != null) !== (event.reminderChannel != null)) {
    throw new CalendarApplicationError(
      'invalid_event',
      'reminderMinutesBefore and reminderChannel must both be set or both null',
    )
  }
  if (event.endAt && event.endAt.getTime() < event.startAt.getTime()) {
    throw new CalendarApplicationError('invalid_event', 'endAt must not be earlier than startAt')
  }
}

export class CalendarApplication {
  constructor(
    private readonly db: Queryable,
    private readonly events: CalendarEventPublisher,
    private readonly dispatcher: CalendarDispatcher,
  ) {}

  async list(
    scope: CalendarScope,
    range: { from?: Date; to?: Date },
  ): Promise<CalendarEventPayload[]> {
    if (range.from && range.to && range.to.getTime() < range.from.getTime()) {
      throw new CalendarApplicationError('invalid_event', 'to must not be earlier than from')
    }
    const rows = await listCalendarEvents(this.db, { ...scope, ...range })
    return rows.map(toPayload)
  }

  async create(
    scope: CalendarScope,
    input: CreateCalendarEventInput,
    options: { eventId?: string; replayExisting?: boolean } = {},
  ): Promise<CalendarEventPayload> {
    const targetConversationId = input.kind === 'agent_task' && input.assigneeId && !input.targetConversationId
      ? await findCalendarDirectConversation(this.db, {
        companyId: scope.companyId, projectId: scope.projectId,
        creatorId: scope.userId, assigneeId: input.assigneeId,
      })
      : input.targetConversationId ?? null
    const normalized = {
      kind: input.kind,
      assigneeId: input.assigneeId ?? null,
      targetConversationId,
      startAt: input.startAt,
      endAt: input.endAt ?? null,
      reminderMinutesBefore: input.reminderMinutesBefore ?? null,
      reminderChannel: input.reminderChannel ?? null,
    }
    assertCoherentEvent(normalized)
    await this.assertReferences(scope, normalized.assigneeId, normalized.targetConversationId)
    if (options.eventId && options.replayExisting) {
      const existing = await findVisibleCalendarEvent(this.db, { id: options.eventId, ...scope })
      if (existing) return toPayload(existing)
    }
    const row = await insertCalendarEvent(this.db, {
      id: options.eventId ?? `ce-${randomUUID()}`,
      companyId: scope.companyId,
      projectId: scope.projectId,
      createdBy: scope.userId,
      kind: normalized.kind,
      title: input.title,
      description: input.description ?? null,
      assigneeId: normalized.assigneeId,
      targetConversationId: normalized.targetConversationId,
      agentPrompt: input.agentPrompt ?? null,
      startAt: normalized.startAt,
      endAt: normalized.endAt,
      allDay: input.allDay,
      recurrence: input.recurrence ?? null,
      status: input.status,
      reminderMinutesBefore: normalized.reminderMinutesBefore,
      reminderChannel: normalized.reminderChannel,
      isPrivate: input.isPrivate,
    })
    await this.changed(scope, row.id, 'event.created').catch(() => undefined)
    return toPayload(row)
  }

  async recentSharedEvents(scope: CalendarScope, sinceMinutes = 15) {
    const rows = await listRecentSharedCalendarEvents(this.db, {
      companyId: scope.companyId,
      projectId: scope.projectId,
      excludeCreatorId: scope.userId,
      sinceMinutes,
    })
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
    }))
  }

  async get(scope: CalendarScope, eventId: string): Promise<CalendarEventPayload> {
    return toPayload(await this.requireVisible(scope, eventId))
  }

  async find(scope: CalendarScope, eventId: string): Promise<CalendarEventPayload | null> {
    const event = await findVisibleCalendarEvent(this.db, { id: eventId, ...scope })
    return event ? toPayload(event) : null
  }

  async update(
    scope: CalendarScope,
    eventId: string,
    patch: UpdateCalendarEventInput,
  ): Promise<CalendarEventPayload> {
    const current = await this.requireVisible(scope, eventId)
    const merged = {
      kind: patch.kind ?? current.kind,
      assigneeId: Object.hasOwn(patch, 'assigneeId') ? patch.assigneeId ?? null : current.assignee_id,
      targetConversationId: Object.hasOwn(patch, 'targetConversationId')
        ? patch.targetConversationId ?? null
        : current.target_conversation_id,
      startAt: patch.startAt ?? current.start_at,
      endAt: Object.hasOwn(patch, 'endAt') ? patch.endAt ?? null : current.end_at,
      reminderMinutesBefore: Object.hasOwn(patch, 'reminderMinutesBefore')
        ? patch.reminderMinutesBefore ?? null
        : current.reminder_minutes_before,
      reminderChannel: Object.hasOwn(patch, 'reminderChannel')
        ? patch.reminderChannel ?? null
        : current.reminder_channel,
    }
    assertCoherentEvent(merged)
    await this.assertReferences(scope, merged.assigneeId, merged.targetConversationId)
    const row = await updateVisibleCalendarEvent(this.db, { id: eventId, ...scope }, patch)
    if (!row) throw new CalendarApplicationError('event_not_found', 'event not found')
    await this.changed(scope, eventId, 'event.updated').catch(() => undefined)
    return toPayload(row)
  }

  async delete(scope: CalendarScope, eventId: string): Promise<{ ok: true }> {
    if (!await deleteVisibleCalendarEvent(this.db, { id: eventId, ...scope })) {
      throw new CalendarApplicationError('event_not_found', 'event not found')
    }
    await this.changed(scope, eventId, 'event.deleted').catch(() => undefined)
    return { ok: true }
  }

  async runNow(scope: CalendarScope, eventId: string): Promise<CalendarDispatchResult> {
    const event = await this.requireVisible(scope, eventId)
    const result = await this.dispatcher.dispatch(event, new Date())
    await this.changed(scope, eventId, 'event.dispatched').catch(() => undefined)
    return result
  }

  async dispatches(scope: CalendarScope, eventId: string): Promise<CalendarDispatchPayload[]> {
    await this.requireVisible(scope, eventId)
    return (await listCalendarDispatches(this.db, scope.companyId, scope.projectId, eventId))
      .map(toDispatchPayload)
  }

  private async requireVisible(scope: CalendarScope, eventId: string): Promise<CalendarEventRow> {
    const event = await findVisibleCalendarEvent(this.db, { id: eventId, ...scope })
    if (!event) throw new CalendarApplicationError('event_not_found', 'event not found')
    return event
  }

  private async assertReferences(
    scope: CalendarScope,
    assigneeId: string | null,
    conversationId: string | null,
  ): Promise<void> {
    if (assigneeId && !await calendarParticipantExists(this.db, scope.companyId, assigneeId)) {
      throw new CalendarApplicationError('assignee_not_found', 'assigneeId not found in this workspace')
    }
    if (conversationId && !await calendarConversationExists(
      this.db,
      scope.companyId,
      scope.projectId,
      conversationId,
    )) {
      throw new CalendarApplicationError(
        'conversation_not_found',
        'targetConversationId not found in this workspace',
      )
    }
  }

  private async changed(
    scope: CalendarScope,
    eventId: string,
    kind: CalendarChangedEvent['kind'],
  ): Promise<void> {
    await this.events.publish({
      type: 'calendar.changed',
      kind,
      eventId,
      companyId: scope.companyId,
      workspaceId: scope.projectId,
      actorId: scope.userId,
    })
  }
}
