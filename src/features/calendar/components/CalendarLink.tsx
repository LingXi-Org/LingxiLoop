import { useEffect, useRef } from 'react'
import { ICalendar } from '@/components/icons'
import { useApp } from '@/stores/app'
import { useSurface } from '@/stores/surface'
import { useCalendar } from '../state'

export function CalendarLink({ id }: { id: string }) {
  const setView = useApp((s) => s.setView)
  const view = useApp((s) => s.view)
  const openCalendarEventPeek = useSurface((s) => s.openCalendarEventPeek)
  const loadingEventId = useCalendar((s) => s.loadingEventId)
  const loadEvent = useCalendar((s) => s.loadEvent)
  const event = useCalendar((s) => s.events.find((e) => e.id === id) ?? null)
  const label = event?.title?.trim() || '日程'
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
      className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full border border-sky2-100 bg-sky2-50 px-2 py-0.5 text-[13px] font-semibold text-skype-deep no-underline transition hover:border-sky2-200 hover:bg-sky2-100"
      style={{ verticalAlign: '-0.16em' }}
      title="打开日历事件"
      aria-label={`打开日历事件 ${label}`}
    >
      <ICalendar className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </a>
  )
}
