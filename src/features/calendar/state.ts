import { ws } from '@/api/core/realtime'
import { create } from 'zustand'
import { calendarApi } from './api'
import type {
  CalendarDispatchResult,
  CalendarEvent,
  CalendarEventInput,
  CalendarEventStatus,
} from './contracts'

interface CalendarState {
  events: CalendarEvent[]
  loaded: boolean
  loading: boolean
  loadingEventId: string | null
  error: string | null
  load: () => Promise<void>
  loadEvent: (id: string) => Promise<CalendarEvent>
  reload: () => Promise<void>
  reset: () => void
  create: (input: CalendarEventInput) => Promise<CalendarEvent>
  update: (
    id: string,
    patch: Partial<CalendarEventInput> & { status?: CalendarEventStatus },
  ) => Promise<CalendarEvent>
  remove: (id: string) => Promise<void>
  runNow: (id: string) => Promise<CalendarDispatchResult>
}

function byStart(a: CalendarEvent, b: CalendarEvent): number {
  return a.startAt.localeCompare(b.startAt)
}

function replaceOrInsert(list: CalendarEvent[], next: CalendarEvent): CalendarEvent[] {
  const remaining = list.filter((event) => event.id !== next.id)
  return [...remaining, next].sort(byStart)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const useCalendar = create<CalendarState>((set, get) => ({
  events: [],
  loaded: false,
  loading: false,
  loadingEventId: null,
  error: null,

  async load() {
    if (get().loaded || get().loading) return
    set({ loading: true, error: null })
    try {
      const { events } = await calendarApi.list()
      set({ events: events.sort(byStart), loaded: true, loading: false })
    } catch (error) {
      set({ loading: false, error: errorMessage(error) })
    }
  },

  async loadEvent(id) {
    const existing = get().events.find((event) => event.id === id)
    if (existing) return existing
    set({ loadingEventId: id, error: null })
    try {
      const { event } = await calendarApi.get(id)
      set((state) => ({ events: replaceOrInsert(state.events, event) }))
      return event
    } catch (error) {
      set({ error: errorMessage(error) })
      throw error
    } finally {
      set((state) => ({ loadingEventId: state.loadingEventId === id ? null : state.loadingEventId }))
    }
  },

  async reload() {
    set({ loading: true, error: null })
    try {
      const { events } = await calendarApi.list()
      set({ events: events.sort(byStart), loaded: true, loading: false })
    } catch (error) {
      set({ loading: false, error: errorMessage(error) })
    }
  },

  reset() {
    set({ events: [], loaded: false, loading: false, loadingEventId: null, error: null })
  },

  async create(input) {
    const { event } = await calendarApi.create(input)
    set((state) => ({ events: replaceOrInsert(state.events, event) }))
    return event
  },

  async update(id, patch) {
    const { event } = await calendarApi.update(id, patch)
    set((state) => ({ events: replaceOrInsert(state.events, event) }))
    return event
  },

  async remove(id) {
    await calendarApi.remove(id)
    set((state) => ({ events: state.events.filter((event) => event.id !== id) }))
  },

  async runNow(id) {
    const result = await calendarApi.runNow(id)
    try {
      const { event } = await calendarApi.get(id)
      set((state) => ({ events: replaceOrInsert(state.events, event), error: null }))
    } catch (error) {
      set({ error: `event dispatched, but refresh failed: ${errorMessage(error)}` })
    }
    return result
  },
}))

ws.on((event) => {
  if (event.type !== 'calendar.changed') return
  const state = useCalendar.getState()
  if (!state.loaded) return
  if (event.kind === 'event.deleted') {
    useCalendar.setState((current) => ({
      events: current.events.filter((item) => item.id !== event.eventId),
    }))
    return
  }
  void calendarApi.get(event.eventId).then(({ event: updated }) => {
    useCalendar.setState((current) => ({
      events: replaceOrInsert(current.events, updated),
      error: null,
    }))
  }).catch((error: unknown) => {
    useCalendar.setState({ error: `calendar synchronization failed: ${errorMessage(error)}` })
  })
})
