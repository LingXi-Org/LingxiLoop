import { useEffect, useRef } from 'react'
import { useApp } from '@/stores/app'
import { useCalendar } from '@/stores/calendar'
import { useResolvedCalendarId } from '@/lib/useArtifactId'
import { ICalendar } from './icons'

export function CalendarLink({ id: rawId }: { id: string }) {
  // Resolve a git-style short id (e.g. `ce-d53fa1f5`) to the full event id.
  const id = useResolvedCalendarId(rawId)
  const setView = useApp((s) => s.setView)
  const view = useApp((s) => s.view)
  const openCalendarEventPeek = useApp((s) => s.openCalendarEventPeek)
  const loadingEventId = useCalendar((s) => s.loadingEventId)
  const loadEvent = useCalendar((s) => s.loadEvent)
  const event = useCalendar((s) => s.events.find((e) => e.id === id) ?? null)
  const label = event?.title?.trim() || id
  const didRequestCalendar = useRef(false)

  useEffect(() => {
    if (!event && loadingEventId !== id && !didRequestCalendar.current) {
      didRequestCalendar.current = true
      void loadEvent(id).catch(() => { /* stale or missing event reference */ })
    }
  }, [event, id, loadEvent, loadingEventId])

  return (
    <a
      href={`#calendar/${id}`}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (view === 'conversations') openCalendarEventPeek(id)
        else setView('calendar')
      }}
      className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full border border-sky2-100 bg-[#F5FBFF] px-2 py-0.5 text-[13px] font-semibold text-skype-deep no-underline transition hover:border-sky2-200 hover:bg-[#EAF7FD]"
      style={{ verticalAlign: '-0.16em' }}
      title={`Open calendar event ${id}`}
      aria-label={`Open calendar event ${label}`}
    >
      <ICalendar className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </a>
  )
}
