import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AvatarMini } from '@/components/Avatar'
import { useBoards } from '@/stores/boards'
import { useCalendar } from '@/stores/calendar'
import { useConversations } from '@/stores/conversations'
import { useParticipants } from '@/stores/participants'
import { IBoard, ICalendar, IClock, IRepeat } from '@/components/icons'
import { cn } from '@/lib/utils'
import { EventEditor } from '@/components/EventEditor'
import type { BoardCard, CalendarEvent, RecurrenceRule } from '@/types'

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function OpenFullIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function PeekHeader({
  icon,
  label,
  title,
  meta,
  onClose,
  onOpenFull,
}: {
  icon: ReactNode
  label: string
  title: string
  meta?: string
  onClose: () => void
  onOpenFull?: () => void
}) {
  return (
    <header className="shrink-0 border-b border-ink-100 bg-gradient-to-b from-white to-sky2-50/35 px-4 py-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 h-9 w-9 shrink-0 rounded-[10px] grid place-items-center bg-cloud border border-ink-100 text-skype-deep">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">{label}</div>
          <h2 className="mt-0.5 truncate text-[16px] font-semibold leading-[1.25] text-ink-900">{title}</h2>
          {meta && <div className="mt-1 truncate text-[11.5px] text-ink-500">{meta}</div>}
        </div>
        {onOpenFull && (
          <button
            type="button"
            onClick={onOpenFull}
            className="h-8 w-8 rounded-[8px] grid place-items-center text-ink-500 hover:text-skype-deep hover:bg-sky2-100 transition"
            title="Open full workspace"
            aria-label="Open full workspace"
          >
            <OpenFullIcon />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="h-8 w-8 rounded-[8px] grid place-items-center text-ink-400 hover:text-ink-900 hover:bg-ink-100/70 transition"
          title="Close artifact"
          aria-label="Close artifact"
        >
          <CloseIcon />
        </button>
      </div>
    </header>
  )
}

function PeekLoading({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="h-full bg-cloud grid place-items-center">
      <div className="flex flex-col items-center gap-3 text-ink-400">
        <div className="w-12 h-12 rounded-[12px] grid place-items-center bg-sky2-50 text-skype-deep">
          {icon}
        </div>
        <div className="text-[12.5px] font-display italic">{label}</div>
      </div>
    </div>
  )
}

function PeekUnavailable({
  icon,
  title,
  detail,
  onClose,
}: {
  icon: ReactNode
  title: string
  detail: string
  onClose: () => void
}) {
  return (
    <div className="h-full bg-cloud grid place-items-center px-8 text-center">
      <div className="max-w-[280px]">
        <div className="mx-auto w-12 h-12 rounded-[12px] grid place-items-center bg-coral-soft/45 text-coral-deep">
          {icon}
        </div>
        <div className="mt-3 text-[14px] font-semibold text-ink-900">{title}</div>
        <div className="mt-1 text-[12px] text-ink-500 leading-relaxed">{detail}</div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-8 px-3 rounded-[8px] text-[12px] font-semibold text-ink-600 border border-ink-100 hover:bg-sky2-50 transition"
        >
          Close
        </button>
      </div>
    </div>
  )
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'recently'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatEventRange(event: CalendarEvent): string {
  const start = new Date(event.startAt)
  if (Number.isNaN(start.getTime())) return event.allDay ? 'All day' : 'Time unavailable'
  if (event.allDay) return start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const startLabel = `${start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} - ${formatTime(start)}`
  if (!event.endAt) return startLabel
  const end = new Date(event.endAt)
  if (Number.isNaN(end.getTime())) return startLabel
  const sameDay = start.toDateString() === end.toDateString()
  return sameDay
    ? `${startLabel}-${formatTime(end)}`
    : `${startLabel}-${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${formatTime(end)}`
}

function describeRecurrence(r: RecurrenceRule | null): string {
  if (!r) return 'one-shot'
  const every = r.interval > 1 ? `every ${r.interval} ` : 'every '
  const freqMap = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' } as const
  const base = `${every}${freqMap[r.freq]}${r.interval > 1 ? 's' : ''}`
  if (r.freq === 'weekly' && r.byweekday && r.byweekday.length) {
    return `${base} - ${r.byweekday.map((d) => WEEK[d]).join('/')}`
  }
  return base
}

export function BoardPeekContent({
  boardId,
  focusCardId,
  onClose,
  onOpenFull,
}: {
  boardId: string
  focusCardId?: string | null
  onClose: () => void
  onOpenFull?: () => void
}) {
  const list = useBoards((s) => s.list)
  const loadingList = useBoards((s) => s.loadingList)
  const loadList = useBoards((s) => s.loadList)
  const loadBoard = useBoards((s) => s.loadBoard)
  const loadingBoardId = useBoards((s) => s.loadingBoardId)
  const snap = useBoards((s) => s.snapshots[boardId])
  const summary = list.find((b) => b.id === boardId) ?? null
  const didRequestList = useRef(false)
  const requestedBoardId = useRef<string | null>(null)

  useEffect(() => {
    if (!summary && !loadingList && !didRequestList.current) {
      didRequestList.current = true
      void loadList().catch(() => { /* stale or missing board reference */ })
    }
  }, [loadList, loadingList, summary])

  useEffect(() => {
    if (!snap && loadingBoardId !== boardId && requestedBoardId.current !== boardId) {
      requestedBoardId.current = boardId
      void loadBoard(boardId).catch(() => { /* handled by unavailable state */ })
    }
  }, [boardId, loadBoard, loadingBoardId, snap])

  const cardsByColumn = useMemo(() => {
    const m = new Map<string, BoardCard[]>()
    if (!snap) return m
    for (const col of snap.columns) m.set(col.id, [])
    for (const card of snap.cards) {
      const arr = m.get(card.columnId)
      if (arr) arr.push(card)
    }
    for (const cards of m.values()) cards.sort((a, b) => a.position - b.position)
    return m
  }, [snap])

  const isBoardPending = !snap && (loadingBoardId === boardId || loadingList || requestedBoardId.current !== boardId)

  if (isBoardPending) {
    return <PeekLoading icon={<IBoard className="w-5 h-5" />} label="Opening board..." />
  }

  if (!snap) {
    return (
      <PeekUnavailable
        icon={<IBoard className="w-5 h-5" />}
        title="Board unavailable"
        detail="This board may have been deleted or moved out of this workspace."
        onClose={onClose}
      />
    )
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-cloud">
      <PeekHeader
        icon={<IBoard className="w-5 h-5" />}
        label="Kanban board"
        title={snap.title}
        meta={`${snap.columns.length} columns - ${snap.cards.length} cards - updated ${formatShortDate(snap.updatedAt)}`}
        onClose={onClose}
        onOpenFull={onOpenFull}
      />
      {snap.description && (
        <div className="shrink-0 px-4 py-3 border-b border-ink-100 text-[12.5px] leading-relaxed text-ink-600 bg-white/55">
          {snap.description}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
        <div className="h-full flex gap-3 p-4">
          {snap.columns.map((col) => {
            const cards = cardsByColumn.get(col.id) ?? []
            return (
              <section key={col.id} className="w-[220px] shrink-0 h-full min-h-0 flex flex-col rounded-[10px] border border-ink-100 bg-white/70">
                <div className="px-3 py-2.5 border-b border-ink-100 flex items-center gap-2">
                  <div className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-800">{col.title}</div>
                  <span className="text-[11px] font-semibold text-ink-400">{cards.length}</span>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                  {cards.length === 0 && (
                    <div className="rounded-[8px] border border-dashed border-ink-100 px-3 py-4 text-center text-[11.5px] text-ink-400">
                      Empty
                    </div>
                  )}
                  {cards.map((card) => (
                    <BoardPeekCard key={card.id} card={card} focused={card.id === focusCardId} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function BoardPeekCard({ card, focused }: { card: BoardCard; focused: boolean }) {
  const byId = useParticipants((s) => s.byId)
  const assignee = card.assigneeId ? byId[card.assigneeId] : null
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!focused) return
    const id = window.setTimeout(() => {
      ref.current?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
    }, 80)
    return () => window.clearTimeout(id)
  }, [focused])

  return (
    <article
      ref={ref}
      className={cn(
        'rounded-[8px] border px-3 py-2.5 shadow-[0_10px_24px_-22px_rgba(0,80,140,0.35)] transition',
        focused
          ? 'border-sky2-200 bg-sky2-50 ring-2 ring-sky2-100'
          : 'border-ink-100 bg-cloud',
      )}
    >
      {focused && (
        <div className="mb-1.5 inline-flex rounded-full bg-sky2-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-skype-deep">
          Opened from chat
        </div>
      )}
      <div className="text-[12.5px] font-medium leading-snug text-ink-800 line-clamp-3">{card.title}</div>
      {(assignee || card.commentCount > 0 || card.mentions.length > 0) && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-500">
          {assignee && (
            <span className="min-w-0 inline-flex items-center gap-1.5">
              <AvatarMini p={assignee} size={18} />
              <span className="truncate">{assignee.name}</span>
            </span>
          )}
          {card.commentCount > 0 && <span className="ml-auto shrink-0">{card.commentCount} comments</span>}
          {!assignee && card.mentions.length > 0 && <span className="truncate">@{card.mentions.slice(0, 2).join(' @')}</span>}
        </div>
      )}
    </article>
  )
}

export function CalendarEventPeekContent({
  eventId,
  onClose,
  onOpenFull,
}: {
  eventId: string
  onClose: () => void
  onOpenFull?: () => void
}) {
  const loadingEventId = useCalendar((s) => s.loadingEventId)
  const loadEvent = useCalendar((s) => s.loadEvent)
  const removeEvent = useCalendar((s) => s.remove)
  const runEventNow = useCalendar((s) => s.runNow)
  const event = useCalendar((s) => s.events.find((e) => e.id === eventId) ?? null)
  const byId = useParticipants((s) => s.byId)
  const conversations = useConversations((s) => s.list)
  const assignee = event?.assigneeId ? byId[event.assigneeId] : null
  const targetConversation = event?.targetConversationId
    ? conversations.find((c) => c.id === event.targetConversationId) ?? null
    : null
  const didRequestCalendar = useRef(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<null | 'delete' | 'run'>(null)

  useEffect(() => {
    if (!event && loadingEventId !== eventId && !didRequestCalendar.current) {
      didRequestCalendar.current = true
      void loadEvent(eventId).catch((err) => {
        setFailed(err instanceof Error ? err.message : String(err))
      })
    }
  }, [event, eventId, loadEvent, loadingEventId])

  if (!event && !failed) {
    return <PeekLoading icon={<ICalendar className="w-5 h-5" />} label="Opening event..." />
  }

  if (!event) {
    return (
      <PeekUnavailable
        icon={<ICalendar className="w-5 h-5" />}
        title="Event unavailable"
        detail={failed || 'This calendar event may have been deleted or moved out of this workspace.'}
        onClose={onClose}
      />
    )
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-cloud">
      <PeekHeader
        icon={<ICalendar className="w-5 h-5" />}
        label="Calendar event"
        title={event.title || 'Untitled event'}
        meta={`${event.kind === 'agent_task' ? 'Agent task' : 'Personal'} - ${event.status}`}
        onClose={onClose}
        onOpenFull={onOpenFull}
      />
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        <section className="rounded-[12px] border border-ink-100 bg-white/75 p-4">
          <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink-800">
            <IClock className="w-4 h-4 text-skype-deep" />
            <span>{formatEventRange(event)}</span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[12px] text-ink-500">
            <IRepeat className="w-3.5 h-3.5" />
            <span>{describeRecurrence(event.recurrence)}</span>
          </div>
          {event.description && (
            <p className="mt-4 text-[13px] leading-relaxed text-ink-700 whitespace-pre-wrap">{event.description}</p>
          )}
        </section>

        <div className="mt-3 grid gap-3">
          {assignee && (
            <section className="rounded-[12px] border border-ink-100 bg-white/65 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Assignee</div>
              <div className="mt-2 flex items-center gap-2">
                <AvatarMini p={assignee} size={24} />
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-ink-900">{assignee.name}</div>
                  <div className="truncate text-[11.5px] text-ink-500">{assignee.role || assignee.kind}</div>
                </div>
              </div>
            </section>
          )}

          {targetConversation && (
            <section className="rounded-[12px] border border-ink-100 bg-white/65 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Conversation</div>
              <div className="mt-1 truncate text-[13px] font-semibold text-ink-900">{targetConversation.title}</div>
              {targetConversation.subtitle && (
                <div className="mt-0.5 truncate text-[11.5px] text-ink-500">{targetConversation.subtitle}</div>
              )}
            </section>
          )}

          {event.agentPrompt && (
            <section className="rounded-[12px] border border-sky2-100 bg-sky2-50/45 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-skype-deep">Agent prompt</div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-700 whitespace-pre-wrap">{event.agentPrompt}</p>
            </section>
          )}
        </div>
      </div>
      <div className="shrink-0 border-t border-ink-100 px-4 py-3 flex items-center gap-2"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
      >
        <div className="flex-1 min-w-0 text-[11px] text-ink-400 truncate">
          Created {formatShortDate(event.createdAt)} - Updated {formatShortDate(event.updatedAt)}
        </div>
        {event.kind === 'agent_task' && (
          <button
            type="button"
            onClick={async () => {
              if (busy) return
              setBusy('run')
              try { await runEventNow(event.id) } catch (err) { console.warn('runNow failed', err) }
              setBusy(null)
            }}
            disabled={busy !== null}
            className="py-1.5 px-3 text-[12px] font-semibold rounded-full bg-sky2-50 text-skype-deep border border-sky2-100 active:bg-sky2-100 transition disabled:opacity-60"
          >{busy === 'run' ? 'Running…' : 'Run now'}</button>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="py-1.5 px-3 text-[12px] font-semibold rounded-full bg-cloud text-ink-700 border border-ink-100 active:bg-sky2-50 transition"
        >Edit</button>
        <button
          type="button"
          onClick={async () => {
            if (busy) return
            if (!confirm(`Delete “${event.title || 'Untitled event'}”?`)) return
            setBusy('delete')
            try {
              await removeEvent(event.id)
              onClose()
            } catch (err) {
              console.warn('delete failed', err)
              setBusy(null)
            }
          }}
          disabled={busy !== null}
          className="py-1.5 px-3 text-[12px] font-semibold rounded-full text-coral-deep border border-coral-soft active:bg-coral-soft/40 transition disabled:opacity-60"
        >Delete</button>
      </div>
      {editing && (
        <EventEditor event={event} onClose={() => setEditing(false)} />
      )}
    </div>
  )
}
