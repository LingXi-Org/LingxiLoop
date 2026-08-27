
import { http } from '@/api/core/http'
import type {
  CalendarDispatch,
  CalendarEvent,
  CalendarEventStatus,
} from '@/types'
import type { CalendarEventInput, } from './contracts'

export const calendarApi = {
  listCalendarEvents: (range?: { from?: string; to?: string }) => {
    const params = new URLSearchParams()
    if (range?.from) params.set('from', range.from)
    if (range?.to) params.set('to', range.to)
    const qs = params.toString()
    return http<{ events: CalendarEvent[] }>(`/calendar/events${qs ? `?${qs}` : ''}`)
  },
  getCalendarEvent: (id: string) =>
    http<{ event: CalendarEvent }>(`/calendar/events/${encodeURIComponent(id)}`),
  createCalendarEvent: (input: CalendarEventInput) =>
    http<{ event: CalendarEvent }>('/calendar/events', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateCalendarEvent: (id: string, patch: Partial<CalendarEventInput> & { status?: CalendarEventStatus }) =>
    http<{ event: CalendarEvent }>(`/calendar/events/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteCalendarEvent: (id: string) =>
    http<{ ok: boolean }>(`/calendar/events/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  runCalendarEventNow: (id: string) =>
    http<{ status: string; messageId?: string; conversationId?: string; error?: string }>(
      `/calendar/events/${encodeURIComponent(id)}/run-now`,
      { method: 'POST' },
    ),
  listCalendarDispatches: (id: string) =>
    http<{ dispatches: CalendarDispatch[] }>(
      `/calendar/events/${encodeURIComponent(id)}/dispatches`,
    )
}
