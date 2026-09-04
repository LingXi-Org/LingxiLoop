import { http } from '@/api/core/http'
import type {
  CalendarDispatch,
  CalendarDispatchResult,
  CalendarEvent,
  CalendarEventInput,
  CalendarEventStatus,
} from './contracts'

export const calendarApi = {
  list: (range?: { from?: string; to?: string }) => {
    const params = new URLSearchParams()
    if (range?.from) params.set('from', range.from)
    if (range?.to) params.set('to', range.to)
    const query = params.toString()
    return http<{ events: CalendarEvent[] }>(`/calendar/events${query ? `?${query}` : ''}`)
  },
  get: (id: string) => http<{ event: CalendarEvent }>(`/calendar/events/${encodeURIComponent(id)}`),
  create: (input: CalendarEventInput) => http<{ event: CalendarEvent }>('/calendar/events', {
    method: 'POST',
    body: JSON.stringify(input),
  }),
  update: (id: string, patch: Partial<CalendarEventInput> & { status?: CalendarEventStatus }) =>
    http<{ event: CalendarEvent }>(`/calendar/events/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  remove: (id: string) => http<{ ok: true }>(`/calendar/events/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }),
  runNow: (id: string) => http<CalendarDispatchResult>(
    `/calendar/events/${encodeURIComponent(id)}/run-now`,
    { method: 'POST' },
  ),
  dispatches: (id: string) => http<{ dispatches: CalendarDispatch[] }>(
    `/calendar/events/${encodeURIComponent(id)}/dispatches`,
  ),
}
