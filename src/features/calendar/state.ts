import { ws } from '@/api/core/realtime'
import { create } from 'zustand'
import { calendarApi } from './api'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { userFacingError } from '@/lib/userFacingError'
import { getActiveCompanyId } from '@/stores/auth'
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

let calendarRequestEpoch = 0

function activeScopeKey(): string {
  const workspace = getWorkspaceSession()
  return `${getActiveCompanyId() ?? ''}:${workspace?.projectId ?? ''}`
}

function errorMessage(error: unknown): string {
  return userFacingError(error, '日历操作没有完成，请稍后重试。')
}

export const useCalendar = create<CalendarState>((set, get) => ({
  events: [],
  loaded: false,
  loading: false,
  loadingEventId: null,
  error: null,

  async load() {
    if (get().loaded || get().loading) return
    const epoch = ++calendarRequestEpoch
    const scope = activeScopeKey()
    set({ loading: true, error: null })
    try {
      const { events } = await calendarApi.list()
      if (epoch !== calendarRequestEpoch || scope !== activeScopeKey()) return
      set({ events: events.sort(byStart), loaded: true, loading: false })
    } catch (error) {
      if (epoch !== calendarRequestEpoch || scope !== activeScopeKey()) return
      set({ loading: false, error: errorMessage(error) })
    }
  },

  async loadEvent(id) {
    const existing = get().events.find((event) => event.id === id)
    if (existing) return existing
    const epoch = calendarRequestEpoch
    const scope = activeScopeKey()
    set({ loadingEventId: id, error: null })
    try {
      const { event } = await calendarApi.get(id)
      if (epoch !== calendarRequestEpoch || scope !== activeScopeKey()) throw new Error('学习区已经切换')
      set((state) => ({ events: replaceOrInsert(state.events, event) }))
      return event
    } catch (error) {
      if (epoch === calendarRequestEpoch && scope === activeScopeKey()) set({ error: errorMessage(error) })
      throw error
    } finally {
      if (epoch === calendarRequestEpoch && scope === activeScopeKey()) {
        set((state) => ({ loadingEventId: state.loadingEventId === id ? null : state.loadingEventId }))
      }
    }
  },

  async reload() {
    const epoch = ++calendarRequestEpoch
    const scope = activeScopeKey()
    set({ loading: true, error: null })
    try {
      const { events } = await calendarApi.list()
      if (epoch !== calendarRequestEpoch || scope !== activeScopeKey()) return
      set({ events: events.sort(byStart), loaded: true, loading: false })
    } catch (error) {
      if (epoch !== calendarRequestEpoch || scope !== activeScopeKey()) return
      set({ loading: false, error: errorMessage(error) })
    }
  },

  reset() {
    calendarRequestEpoch += 1
    set({ events: [], loaded: false, loading: false, loadingEventId: null, error: null })
  },

  async create(input) {
    const scope = activeScopeKey()
    const { event } = await calendarApi.create(input)
    if (scope !== activeScopeKey()) return event
    set((state) => ({ events: replaceOrInsert(state.events, event) }))
    return event
  },

  async update(id, patch) {
    const scope = activeScopeKey()
    const { event } = await calendarApi.update(id, patch)
    if (scope !== activeScopeKey()) return event
    set((state) => ({ events: replaceOrInsert(state.events, event) }))
    return event
  },

  async remove(id) {
    const scope = activeScopeKey()
    await calendarApi.remove(id)
    if (scope !== activeScopeKey()) return
    set((state) => ({ events: state.events.filter((event) => event.id !== id) }))
  },

  async runNow(id) {
    const scope = activeScopeKey()
    const result = await calendarApi.runNow(id)
    if (scope !== activeScopeKey()) return result
    try {
      const { event } = await calendarApi.get(id)
      if (scope !== activeScopeKey()) return result
      set((state) => ({ events: replaceOrInsert(state.events, event), error: null }))
    } catch (error) {
      if (scope === activeScopeKey()) set({ error: `事件已执行，但刷新失败：${errorMessage(error)}` })
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
  const epoch = calendarRequestEpoch
  const scope = activeScopeKey()
  void calendarApi.get(event.eventId).then(({ event: updated }) => {
    if (epoch !== calendarRequestEpoch || scope !== activeScopeKey()) return
    useCalendar.setState((current) => ({
      events: replaceOrInsert(current.events, updated),
      error: null,
    }))
  }).catch((error: unknown) => {
    if (epoch === calendarRequestEpoch && scope === activeScopeKey()) {
      useCalendar.setState({ error: `日历同步失败：${errorMessage(error)}` })
    }
  })
})
