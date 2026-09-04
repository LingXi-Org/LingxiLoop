import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Calendar03Icon,
  Clock01Icon,
  Delete02Icon,
  LockIcon,
  PlusSignIcon,
  RepeatIcon,
  Task01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
/**
 * Calendar — macOS-Calendar-style scheduling surface. Three view modes
 * (Day / Week / Month) share one toolbar; each one supports:
 *
 *   - LEFT-CLICK on empty space → opens EventEditor with that slot pre-
 *     filled (1h default in time-grid views, 9-10am in month view).
 *   - LEFT-DRAG on empty space → drags out a range; on mouseup the editor
 *     opens with startAt + endAt filled in. Week/Day drag along the time
 *     axis; Month drag across adjacent day cells produces an all-day
 *     multi-day range.
 *   - RIGHT-CLICK → context menu with "New event…" at the clicked
 *     time / day.
 *   - CLICK an existing event block → opens it for editing.
 *
 * The week/day time grid is laid out at HOUR_HEIGHT px per hour, with a
 * 30-minute snap (SLOT_MINUTES). Selections never collapse below one slot
 * so a click without drag still produces a valid range.
 */
import { cloneElement, type ReactElement, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ContextMenuContent, ContextMenuItem, ContextMenu as ContextMenuRoot, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Item, ItemActions, ItemContent, ItemGroup } from '@/components/ui/item'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useParticipants } from '@/features/agents/state'
import { useConversations } from '@/features/conversations/store'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { cn } from '@/lib/utils'
import { useMe } from '@/stores/auth'
import type { CalendarEvent, RecurrenceRule } from '../contracts'
import { useCalendar } from '../state'
import { EventEditor, type EventEditorPrefill } from './EventEditor'

interface AgendaItem {
  event: CalendarEvent
  occurrence: Date
  isRecurring: boolean
}

type ViewMode = 'day' | 'week' | 'month'
type EditingState =
  | { mode: 'edit'; event: CalendarEvent }
  | { mode: 'new'; prefill?: EventEditorPrefill }
  | null

const DAY_MS = 86_400_000
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const HOUR_HEIGHT = 48
const SLOT_MINUTES = 30
const SLOT_HEIGHT = (HOUR_HEIGHT * SLOT_MINUTES) / 60

/* ─────────────────────────── date helpers ─────────────────────────── */

function startOfDay(d: Date): Date {
  const out = new Date(d); out.setHours(0, 0, 0, 0); return out
}
function startOfWeek(d: Date): Date {
  const out = startOfDay(d); out.setDate(out.getDate() - out.getDay()); return out
}
function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999) }
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function formatDateLong(d: Date): string {
  return d.toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' })
}
function addDays(d: Date, n: number): Date { const out = new Date(d); out.setDate(out.getDate() + n); return out }

/* ─────────────────────────── recurrence (client mirror) ─────────────────────────── */

function stepRule(from: Date, rule: RecurrenceRule): Date {
  const interval = Math.max(1, Math.floor(rule.interval || 1))
  switch (rule.freq) {
    case 'daily':
      return new Date(from.getTime() + interval * DAY_MS)
    case 'weekly': {
      const days = rule.byweekday && rule.byweekday.length ? [...rule.byweekday].sort((a, b) => a - b) : null
      if (!days) return new Date(from.getTime() + interval * 7 * DAY_MS)
      let cand = new Date(from.getTime() + ((interval - 1) * 7 + 1) * DAY_MS)
      for (let i = 0; i < 14; i++) {
        if (days.includes(cand.getDay())) return cand
        cand = new Date(cand.getTime() + DAY_MS)
      }
      return cand
    }
    case 'monthly': {
      const out = new Date(from); out.setMonth(out.getMonth() + interval); return out
    }
    case 'yearly': {
      const out = new Date(from); out.setFullYear(out.getFullYear() + interval); return out
    }
  }
}

function nextOccurrence(event: CalendarEvent, from: Date): Date | null {
  const startAt = new Date(event.startAt)
  if (event.status !== 'active') return null
  if (!event.recurrence) return startAt.getTime() >= from.getTime() ? startAt : null
  const rule = event.recurrence
  const untilTs = rule.until ? new Date(rule.until).getTime() : Infinity
  const maxCount = rule.count ?? Infinity
  let current = new Date(startAt)
  let fired = 1
  for (let i = 0; i < 5000; i++) {
    if (current.getTime() > untilTs) return null
    if (fired > maxCount) return null
    if (current.getTime() >= from.getTime()) return current
    current = stepRule(current, rule)
    fired += 1
  }
  return null
}

function describeRecurrence(r: RecurrenceRule | null): string {
  if (!r) return '仅一次'
  const freqMap = { daily: '天', weekly: '周', monthly: '个月', yearly: '年' } as const
  const base = r.interval > 1 ? `每 ${r.interval} ${freqMap[r.freq]}` : `每${freqMap[r.freq]}`
  if (r.freq === 'weekly' && r.byweekday && r.byweekday.length) {
    return `${base} · ${r.byweekday.map((d) => WEEK[d]).join('/')}`
  }
  return base
}

function expandToRange(events: CalendarEvent[], start: Date, end: Date): AgendaItem[] {
  const out: AgendaItem[] = []
  for (const ev of events) {
    if (ev.status !== 'active' && ev.status !== 'done') continue
    const seed = new Date(ev.startAt)
    if (!ev.recurrence) {
      if (seed.getTime() >= start.getTime() && seed.getTime() <= end.getTime()) {
        out.push({ event: ev, occurrence: seed, isRecurring: false })
      }
      continue
    }
    if (ev.status !== 'active') continue
    let cur = nextOccurrence(ev, start)
    let safety = 0
    while (cur && cur.getTime() <= end.getTime() && safety < 200) {
      out.push({ event: ev, occurrence: new Date(cur), isRecurring: true })
      cur = nextOccurrence(ev, new Date(cur.getTime() + 1))
      safety += 1
    }
  }
  out.sort((a, b) => a.occurrence.getTime() - b.occurrence.getTime())
  return out
}

/* ─────────────────────────── shared types ─────────────────────────── */

interface GridProps {
  cursor: Date
  events: CalendarEvent[]
  onEdit: (e: CalendarEvent) => void
  onNew: (prefill: EventEditorPrefill) => void
}

/* ─────────────────────────── ContextMenu ─────────────────────────── */

interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
}

function CalendarMenu({ trigger, children, items }: {
  trigger: ReactElement
  children: ReactNode
  items: MenuItem[]
}) {
  return <ContextMenuRoot>
    <ContextMenuTrigger asChild>{cloneElement(trigger, undefined, children)}</ContextMenuTrigger>
    <ContextMenuContent aria-label="日历操作" className="min-w-[200px]">
      {items.map((item, index) => <ContextMenuItem key={`${item.label}:${index}`} variant={item.danger ? 'destructive' : 'default'} onClick={item.onClick}>{item.label}</ContextMenuItem>)}
    </ContextMenuContent>
  </ContextMenuRoot>
}

/* ─────────────────────────── MonthGrid ─────────────────────────── */

function MonthGrid({ cursor, events, onEdit, onNew }: GridProps) {
  const monthStart = startOfMonth(cursor)
  const monthEnd = endOfMonth(cursor)
  const gridStart = useMemo(() => {
    const d = new Date(monthStart); d.setDate(d.getDate() - d.getDay()); return d
  }, [monthStart.getTime()])
  const gridEnd = useMemo(() => {
    const d = new Date(monthEnd); d.setDate(d.getDate() + (6 - d.getDay())); return d
  }, [monthEnd.getTime()])

  const days = useMemo(() => {
    const out: Date[] = []
    for (let d = new Date(gridStart); d.getTime() <= gridEnd.getTime(); d = new Date(d.getTime() + DAY_MS)) {
      out.push(new Date(d))
    }
    return out
  }, [gridStart.getTime(), gridEnd.getTime()])

  const monthOccurrences = useMemo(
    () => expandToRange(events, gridStart, new Date(gridEnd.getTime() + DAY_MS - 1)),
    [events, gridStart.getTime(), gridEnd.getTime()],
  )
  const byDay = useMemo(() => {
    const m = new Map<string, AgendaItem[]>()
    for (const it of monthOccurrences) {
      const k = `${it.occurrence.getFullYear()}-${it.occurrence.getMonth()}-${it.occurrence.getDate()}`
      const arr = m.get(k) ?? []
      arr.push(it)
      m.set(k, arr)
    }
    return m
  }, [monthOccurrences])

  // Drag state: indices into the `days` array. We don't snap to whole
  // cells via DOM; instead each cell has an onMouseEnter that updates the
  // current index while dragging.
  const [drag, setDrag] = useState<{ startIdx: number; currentIdx: number; moved: boolean } | null>(null)

  // mouseup handler — kept on window so a drag that leaves the grid still
  // completes cleanly. Reads the latest `drag` snapshot via closure on
  // every effect re-run.
  useEffect(() => {
    if (!drag) return
    const onUp = () => {
      const lo = Math.min(drag.startIdx, drag.currentIdx)
      const hi = Math.max(drag.startIdx, drag.currentIdx)
      const startDate = new Date(days[lo]); startDate.setHours(9, 0, 0, 0)
      if (lo === hi && !drag.moved) {
        // Single click on a cell — open editor at 09:00–10:00 that day.
        const end = new Date(startDate); end.setHours(10, 0, 0, 0)
        onNew({ startAt: startDate, endAt: end })
      } else {
        // Multi-day drag — produce an all-day range.
        const endDate = new Date(days[hi]); endDate.setHours(23, 59, 0, 0)
        onNew({ startAt: startDate, endAt: endDate, allDay: true })
      }
      setDrag(null)
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [drag, days, onNew])

  return (
    <>
      <div className="grid grid-cols-7 px-4 pt-3 text-[11px] uppercase tracking-wide text-muted-foreground select-none">
        {WEEK.map((d) => <div key={d} className="px-2 py-1">{d}</div>)}
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-4 pb-4">
        <div
          className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl bg-border select-none"
          style={{ gridAutoRows: 'minmax(96px, 1fr)' }}
        >
          {days.map((d, idx) => {
            const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
            const items = byDay.get(k) ?? []
            const isCurMonth = d.getMonth() === cursor.getMonth()
            const isToday = sameDay(d, new Date())
            const inSelection = drag !== null
              && idx >= Math.min(drag.startIdx, drag.currentIdx)
              && idx <= Math.max(drag.startIdx, drag.currentIdx)
            const date = new Date(d)
            return (
              <CalendarMenu
                key={k}
                trigger={<div
                className={cn(
                  'relative flex min-h-0 cursor-pointer flex-col gap-1 bg-card p-1.5 text-xs',
                  !isCurMonth && 'opacity-40',
                  inSelection && 'bg-sidebar-accent',
                )}
                onMouseDown={(e) => {
                  if (e.button !== 0) return
                  if ((e.target as HTMLElement).closest('.cal-event-chip')) return
                  setDrag({ startIdx: idx, currentIdx: idx, moved: false })
                }}
                onMouseEnter={() => {
                  if (drag && drag.currentIdx !== idx) {
                    setDrag({ ...drag, currentIdx: idx, moved: true })
                  }
                }}
                />}
                items={[
                  { label: `在${date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}新建日程`, onClick: () => { const start = new Date(date); start.setHours(9, 0, 0, 0); const end = new Date(date); end.setHours(10, 0, 0, 0); onNew({ startAt: start, endAt: end }) } },
                  { label: '新的全天活动', onClick: () => { const start = new Date(date); start.setHours(0, 0, 0, 0); const end = new Date(date); end.setHours(23, 59, 0, 0); onNew({ startAt: start, endAt: end, allDay: true }) } },
                ]}
              >
                <div className="flex items-center justify-between">
                  <span className={cn(
                    'inline-grid place-items-center w-5 h-5 rounded-full text-[11px] font-semibold',
                    isToday ? 'bg-primary text-primary-foreground' : 'text-foreground',
                  )}>{d.getDate()}</span>
                  {items.length > 3 && (
                    <span className="text-[10px] text-muted-foreground">+{items.length - 3}</span>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {items.slice(0, 3).map((it, i) => (
                    <Button
                      key={`${it.event.id}-${i}`}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); onEdit(it.event) }}
                      className={cn(
                        'cal-event-chip text-left truncate rounded-sm px-1 py-0.5 text-[11px] font-medium transition',
                        it.event.kind === 'agent_task'
                          ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                          : 'bg-muted text-foreground hover:bg-sidebar-accent',
                      )}
                      title={`${formatTime(it.occurrence)} · ${it.event.title}`}
                    >
                      <span className="opacity-70">{formatTime(it.occurrence)}</span> {it.event.title}
                    </Button>
                  ))}
                </div>
              </CalendarMenu>
            )
          })}
        </div>
      </div>
    </>
  )
}

/* ─────────────────────────── TimeGrid (Week / Day) ─────────────────────────── */

function TimeGrid({ cursor, events, onEdit, onNew, dayCount }: GridProps & { dayCount: 1 | 7 }) {
  const start = useMemo(
    () => dayCount === 7 ? startOfWeek(cursor) : startOfDay(cursor),
    [cursor.getTime(), dayCount],
  )
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => addDays(start, i)),
    [start.getTime(), dayCount],
  )
  const rangeEnd = useMemo(
    () => new Date(start.getTime() + dayCount * DAY_MS),
    [start.getTime(), dayCount],
  )

  const occurrences = useMemo(
    () => expandToRange(events, start, rangeEnd),
    [events, start.getTime(), rangeEnd.getTime()],
  )
  const byDayIdx = useMemo(() => {
    const m: AgendaItem[][] = Array.from({ length: dayCount }, () => [])
    for (const occ of occurrences) {
      const di = Math.floor((occ.occurrence.getTime() - start.getTime()) / DAY_MS)
      if (di >= 0 && di < dayCount) m[di].push(occ)
    }
    return m
  }, [occurrences, start.getTime(), dayCount])

  const colRefs = useRef<Array<HTMLDivElement | null>>([])
  const [drag, setDrag] = useState<{ dayIdx: number; anchorMin: number; cursorMin: number; moved: boolean } | null>(null)
  const [contextDate, setContextDate] = useState<Date | null>(null)

  // Snap a clientY to a 30-min slot start in a given column. Returns the
  // minute-of-day for the slot containing the cursor.
  const pickSlotMinutes = (clientY: number, dayIdx: number): number => {
    const col = colRefs.current[dayIdx]
    if (!col) return 0
    const rect = col.getBoundingClientRect()
    const y = clientY - rect.top
    const slotIdx = Math.max(0, Math.min(47, Math.floor(y / SLOT_HEIGHT)))
    return slotIdx * SLOT_MINUTES
  }

  // While dragging: window-level mousemove updates the cursor slot;
  // mouseup commits the range and clears. The handlers are recreated
  // whenever `drag` changes so they always see the right anchor.
  useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent) => {
      const min = pickSlotMinutes(e.clientY, drag.dayIdx)
      if (min !== drag.cursorMin) {
        setDrag({ ...drag, cursorMin: min, moved: true })
      }
    }
    const onUp = () => {
      // Selection always spans at least one slot, even on a no-move
      // click — so a single click produces a 1h range (2 slots).
      const lo = Math.min(drag.anchorMin, drag.cursorMin)
      const hi = Math.max(drag.anchorMin, drag.cursorMin) + SLOT_MINUTES
      const effectiveHi = drag.moved ? hi : lo + 60 // single click = 1h default
      const startDate = new Date(days[drag.dayIdx])
      startDate.setHours(0, lo, 0, 0)
      const endDate = new Date(days[drag.dayIdx])
      endDate.setHours(0, effectiveHi, 0, 0)
      onNew({ startAt: startDate, endAt: endDate })
      setDrag(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag, days, onNew])

  return (
    <>
      {/* Single scroll container holds both the sticky day header and the
       *  hour-grid body. Sharing one scroll container guarantees the
       *  header's column boundaries line up with the body's even when a
       *  vertical scrollbar appears (which would otherwise pinch the body
       *  columns while the header stays full-width). */}
      <div className="flex-1 min-h-0 overflow-auto">
        {/* Day header row (sticky) */}
        <div
          className="sticky top-0 z-20 grid border-b border-[var(--im-divider-weak)] bg-card select-none"
          style={{ gridTemplateColumns: `56px repeat(${dayCount}, 1fr)` }}
        >
          <div />
          {days.map((d, i) => {
            const isToday = sameDay(d, new Date())
            return (
              <div key={i} className="border-s border-[var(--im-divider-weak)] px-2 py-2 text-center">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{WEEK[d.getDay()]}</div>
                <div className={cn(
                  'mt-0.5 text-base font-semibold',
                  isToday ? 'text-primary' : 'text-foreground',
                )}>{d.getDate()}</div>
              </div>
            )
          })}
        </div>
        <div
          className="grid relative select-none"
          style={{ gridTemplateColumns: `56px repeat(${dayCount}, 1fr)`, minHeight: 24 * HOUR_HEIGHT }}
        >
          {/* Time gutter */}
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                className="relative pe-2 text-end text-[10px] text-muted-foreground"
                style={{ height: HOUR_HEIGHT }}
              >
                {h === 0 ? '' : (
                  <span className="absolute end-2 -top-1.5 bg-card px-0.5">{String(h).padStart(2, '0')}:00</span>
                )}
              </div>
            ))}
          </div>
          {/* Day columns */}
          {days.map((d, dayIdx) => (
            <CalendarMenu
              key={dayIdx}
              trigger={<div
              ref={(el: HTMLDivElement | null) => { colRefs.current[dayIdx] = el }}
              className="relative cursor-cell border-s border-[var(--im-divider-weak)]"
              onMouseDown={(e) => {
                if (e.button !== 0) return
                if ((e.target as HTMLElement).closest('.cal-event-block')) return
                const min = pickSlotMinutes(e.clientY, dayIdx)
                setDrag({ dayIdx, anchorMin: min, cursorMin: min, moved: false })
                e.preventDefault()
              }}
              onContextMenu={(e) => {
                const min = pickSlotMinutes(e.clientY, dayIdx)
                const date = new Date(d); date.setHours(0, min, 0, 0)
                setContextDate(date)
              }}
            />}
              items={[
                { label: `在${contextDate ? formatTime(contextDate) : ''}新建日程`, onClick: () => { if (!contextDate) return; const end = new Date(contextDate); end.setHours(end.getHours() + 1); onNew({ startAt: contextDate, endAt: end }) } },
                { label: '新的全天活动', onClick: () => { if (!contextDate) return; const start = new Date(contextDate); start.setHours(0, 0, 0, 0); const end = new Date(contextDate); end.setHours(23, 59, 0, 0); onNew({ startAt: start, endAt: end, allDay: true }) } },
              ]}
            >
              {/* Hour & half-hour rules */}
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h}>
                  <div
                    className="absolute inset-x-0 border-t border-[var(--im-divider-weak)]"
                    style={{ top: h * HOUR_HEIGHT }}
                  />
                  <div
                    className="absolute inset-x-0 border-t border-[var(--im-divider-weak)] opacity-50"
                    style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                  />
                </div>
              ))}
              {/* Drag preview (only on the active drag column) */}
              {drag && drag.dayIdx === dayIdx && (() => {
                const lo = Math.min(drag.anchorMin, drag.cursorMin)
                const hi = Math.max(drag.anchorMin, drag.cursorMin) + SLOT_MINUTES
                const top = (lo / 60) * HOUR_HEIGHT
                const height = ((hi - lo) / 60) * HOUR_HEIGHT
                return (
                  <div
                    className="pointer-events-none absolute inset-x-1 rounded-xl border-2 border-primary bg-primary/15"
                    style={{ top, height }}
                  >
                    <div className="px-1 pt-0.5 text-[10px] font-semibold text-primary">
                      {String(Math.floor(lo / 60)).padStart(2, '0')}:{String(lo % 60).padStart(2, '0')}–
                      {String(Math.floor(hi / 60)).padStart(2, '0')}:{String(hi % 60).padStart(2, '0')}
                    </div>
                  </div>
                )
              })()}
              {/* Event blocks */}
              {(byDayIdx[dayIdx] ?? []).map((occ, i) => {
                const s = occ.occurrence
                const e = occ.event.endAt ? new Date(occ.event.endAt) : null
                const startMins = s.getHours() * 60 + s.getMinutes()
                // Clip multi-day events at the visible day boundary.
                const durMin = e
                  ? Math.max(
                      30,
                      Math.min(
                        (e.getTime() - s.getTime()) / 60_000,
                        24 * 60 - startMins,
                      ),
                    )
                  : 60
                const top = (startMins / 60) * HOUR_HEIGHT
                const height = (durMin / 60) * HOUR_HEIGHT
                return (
                  <Button
                    key={`${occ.event.id}-${i}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => onEdit(occ.event)}
                    className={cn(
                      'cal-event-block absolute left-1 right-1 rounded-md px-2 py-1 text-left text-[11px] font-medium overflow-hidden transition',
                      occ.event.kind === 'agent_task'
                        ? 'border border-primary/30 bg-secondary text-secondary-foreground hover:bg-secondary/80'
                        : 'border border-border bg-muted text-foreground hover:bg-sidebar-accent',
                    )}
                    style={{ top, height }}
                    title={occ.event.title}
                  >
                    <div className="truncate">{occ.event.title}</div>
                    {height > 28 && (
                      <div className="text-[10px] opacity-70 truncate">
                        {formatTime(s)}{e ? `–${formatTime(e)}` : ''}
                      </div>
                    )}
                  </Button>
                )
              })}
            </CalendarMenu>
          ))}
        </div>
      </div>
    </>
  )
}

/* ─────────────────────────── CalendarView ─────────────────────────── */

export function CalendarView() {
  const [mode, setMode] = useState<ViewMode>('week')
  const [cursor, setCursor] = useState<Date>(() => new Date())
  const [editing, setEditing] = useState<EditingState>(null)
  const [agendaOpen, setAgendaOpen] = useState(false)

  const events = useCalendar((s) => s.events)
  const loaded = useCalendar((s) => s.loaded)
  const load = useCalendar((s) => s.load)
  const remove = useCalendar((s) => s.remove)
  const runNow = useCalendar((s) => s.runNow)
  const byId = useParticipants((s) => s.byId)
  const conversationsList = useConversations((s) => s.list)
  const convosById = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of conversationsList) m[c.id] = c.title
    return m
  }, [conversationsList])
  const meId = useMe()

  useEffect(() => { void load() }, [load])

  // Forward/backward step depends on the active view: month = 1 month,
  // week = 7 days, day = 1 day. Today resets to now.
  const goPrev = () => {
    if (mode === 'month') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
    else if (mode === 'week') setCursor(addDays(cursor, -7))
    else setCursor(addDays(cursor, -1))
  }
  const goNext = () => {
    if (mode === 'month') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
    else if (mode === 'week') setCursor(addDays(cursor, 7))
    else setCursor(addDays(cursor, 1))
  }
  const goToday = () => setCursor(new Date())

  const headerLabel = useMemo(() => {
    if (mode === 'month') {
      return cursor.toLocaleDateString('zh-CN', { month: 'long', year: 'numeric' })
    }
    if (mode === 'week') {
      const ws = startOfWeek(cursor)
      const we = addDays(ws, 6)
      const sameMonth = ws.getMonth() === we.getMonth()
      const left = ws.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
      const right = sameMonth
        ? we.toLocaleDateString('zh-CN', { day: 'numeric', year: 'numeric' })
        : we.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', year: 'numeric' })
      return `${left} – ${right}`
    }
    return cursor.toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }, [cursor.getTime(), mode])

  // Agenda panel: next 30 days starting from today (unaffected by cursor
  // navigation, matching macOS Calendar's "Upcoming" sidebar behavior).
  const today = useMemo(() => startOfDay(new Date()), [])
  const horizon = useMemo(() => new Date(today.getTime() + 30 * DAY_MS), [today])
  const agenda = useMemo(
    () => expandToRange(events, today, horizon).slice(0, 50),
    [events, today, horizon],
  )

  const openEdit = (e: CalendarEvent) => setEditing({ mode: 'edit', event: e })
  const openNew = (prefill?: EventEditorPrefill) => setEditing({ mode: 'new', prefill })

  const agendaContent = (
    <div className="min-h-0 flex-1 overflow-auto p-2">
      {!loaded && <div className="space-y-2" aria-label="正在加载日历事件"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /></div>}
      {loaded && agenda.length === 0 && (
        <Empty className="border-0 px-4 py-8">
          <EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={Clock01Icon} strokeWidth={2} /></EmptyMedia><EmptyTitle className="text-base">未来 30 天没有安排</EmptyTitle><EmptyDescription>创建事件或智能助教任务后会显示在这里。</EmptyDescription></EmptyHeader>
          <EmptyContent><Button type="button" variant="outline" size="sm" onClick={() => openNew()}><HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />安排事件</Button></EmptyContent>
        </Empty>
      )}
      <ItemGroup className="gap-2">{agenda.map((item, index) => {
        const assignee = item.event.assigneeId ? byId[item.event.assigneeId] : null
        const day = sameDay(item.occurrence, new Date())
          ? '今天'
          : sameDay(item.occurrence, new Date(Date.now() + DAY_MS))
            ? '明天'
            : formatDateLong(item.occurrence)
        return (
          <Item key={`${item.event.id}-${index}`} variant="outline" size="sm" className="group">
            <ItemContent className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>{day}</span><span>·</span><span>{formatTime(item.occurrence)}</span>
                {item.isRecurring && <><span>·</span><span className="inline-flex items-center gap-1"><HugeiconsIcon icon={RepeatIcon} strokeWidth={2} className="size-3" />{describeRecurrence(item.event.recurrence)}</span></>}
                {item.event.isPrivate && <><span>·</span><HugeiconsIcon icon={LockIcon} strokeWidth={2} className="size-3" aria-label="私人事件" /></>}
              </div>
              <Button type="button" variant="link" className="h-auto w-full justify-start truncate p-0 text-start text-foreground" onClick={() => { openEdit(item.event); setAgendaOpen(false) }}>{item.event.title}</Button>
              {item.event.kind === 'agent_task' && assignee && (
                <div className="mt-1 flex min-w-0 items-center gap-1.5">
                  <Avatar className="size-5"><AvatarImage src={assignee.avatarUrl ?? undefined} alt={assignee.name} /><AvatarFallback>{assignee.name.slice(0, 1)}</AvatarFallback></Avatar>
                  <span className="text-xs text-foreground">→ {assignee.name}</span>
                  {item.event.targetConversationId && convosById[item.event.targetConversationId] && <span className="truncate text-xs text-muted-foreground">在 #{convosById[item.event.targetConversationId]}</span>}
                </div>
              )}
            </ItemContent>
            <ItemActions className="opacity-100 @min-[48rem]/calendar:opacity-0 @min-[48rem]/calendar:group-focus-within:opacity-100 @min-[48rem]/calendar:group-hover:opacity-100">
              {item.event.kind === 'agent_task' && (
                <Button type="button" size="xs" variant="secondary" onClick={async () => {
                  try {
                    await toastAction(runNow(item.event.id), { loading: '正在运行日历任务', success: '任务已触发', error: '任务触发失败', description: item.event.title })
                  } catch (error) { console.warn('[calendar] run-now failed', error) }
                }}><HugeiconsIcon icon={Task01Icon} strokeWidth={2} data-icon="inline-start" />运行</Button>
              )}
              {item.event.createdBy === meId && (
                <Button type="button" size="icon-xs" variant="destructive" aria-label={`删除 ${item.event.title}`} onClick={async () => {
                  if (!await confirmSensitiveAction({ title: '删除日历事件？', description: `“${item.event.title}”将被永久删除。`, confirmLabel: '删除事件', tone: 'destructive' })) return
                  try {
                    await toastAction(remove(item.event.id), { loading: '正在删除事件', success: '事件已删除', error: '删除事件失败' })
                  } catch (error) { console.warn('[calendar] delete failed', error) }
                }}><HugeiconsIcon icon={Delete02Icon} strokeWidth={2} /></Button>
              )}
            </ItemActions>
          </Item>
        )
      })}</ItemGroup>
    </div>
  )

  return (
    <div className="@container/calendar flex h-full min-h-0 flex-col bg-card text-card-foreground">
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-[var(--im-divider-weak)] px-3 py-2">
        <div className="flex min-w-0 flex-1 basis-40 items-center gap-2"><HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} className="size-4 text-muted-foreground" /><h1 className="font-heading text-sm font-medium">日历</h1><span className="hidden truncate text-sm text-muted-foreground @min-[42rem]/calendar:inline">{headerLabel}</span></div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="上一时间段" onClick={goPrev}><HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} /></Button>
          <Button type="button" variant="outline" size="sm" onClick={goToday}>今天</Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="下一时间段" onClick={goNext}><HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} /></Button>
        </div>
        <Tabs value={mode} onValueChange={(value) => setMode(value as ViewMode)}>
          <TabsList aria-label="日历视图"><TabsTrigger value="day">日</TabsTrigger><TabsTrigger value="week">周</TabsTrigger><TabsTrigger value="month">月</TabsTrigger></TabsList>
        </Tabs>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" size="sm" variant="outline" className="@min-[48rem]/calendar:hidden" onClick={() => setAgendaOpen(true)}><HugeiconsIcon icon={Clock01Icon} strokeWidth={2} data-icon="inline-start" />近期日程</Button>
          <Button type="button" size="sm" onClick={() => openNew()}><HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />新事件</Button>
        </div>
        <span className="order-last w-full truncate text-sm font-medium @min-[42rem]/calendar:hidden">{headerLabel}</span>
      </header>

      {!loaded ? (
        <div className="grid min-h-0 flex-1 @min-[48rem]/calendar:grid-cols-[minmax(0,1fr)_320px]" role="status" aria-label="正在加载日历">
          <span className="sr-only">正在加载日历</span>
          <div className="grid min-h-0 grid-cols-7 gap-px bg-border/60 p-px">
            {Array.from({ length: 35 }, (_, index) => <Skeleton key={index} className="min-h-20 rounded-none bg-card @min-[48rem]/calendar:min-h-28" />)}
          </div>
          <aside className="hidden min-h-0 space-y-3 border-s border-[var(--im-divider)] p-3 @min-[48rem]/calendar:block">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </aside>
        </div>
      ) : <div className="grid min-h-0 flex-1 @min-[48rem]/calendar:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-h-0 flex-col">
          {mode === 'month' && <MonthGrid cursor={cursor} events={events} onEdit={openEdit} onNew={openNew} />}
          {mode === 'week' && <TimeGrid cursor={cursor} events={events} onEdit={openEdit} onNew={openNew} dayCount={7} />}
          {mode === 'day' && <TimeGrid cursor={cursor} events={events} onEdit={openEdit} onNew={openNew} dayCount={1} />}
        </div>
        <aside className="hidden min-h-0 border-s border-[var(--im-divider)] bg-card @min-[48rem]/calendar:flex @min-[48rem]/calendar:flex-col">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--im-divider-weak)] px-3"><HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-4 text-muted-foreground" /><h2 className="text-sm font-medium">即将推出</h2><span className="ms-auto text-xs text-muted-foreground">{agenda.length} 项</span></div>
          {agendaContent}
        </aside>
      </div>}

      <Sheet open={agendaOpen} onOpenChange={setAgendaOpen}>
        <SheetContent side="right" className="w-[min(92vw,360px)] p-0 sm:max-w-[360px]">
          <SheetHeader className="border-b border-[var(--im-divider-weak)] px-4 py-3 text-start"><SheetTitle>即将推出</SheetTitle><SheetDescription>未来 30 天 · {agenda.length} 项</SheetDescription></SheetHeader>
          {agendaContent}
        </SheetContent>
      </Sheet>

      {editing && (
        <EventEditor
          event={editing.mode === 'edit' ? editing.event : null}
          prefill={editing.mode === 'new' ? editing.prefill ?? null : null}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
