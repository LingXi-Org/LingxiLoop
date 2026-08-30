import { useApp } from '@/stores/app'
import { useSurface } from '@/stores/surface'
import { CalendarEventPeekContent } from './CalendarEventPeekContent'

export function CalendarPeekPane() {
  const eventId = useSurface((s) => s.surface?.kind === 'calendar' ? s.surface.eventId : null)
  const closeCalendarEventPeek = useSurface((s) => s.closeCalendarEventPeek)
  const setView = useApp((s) => s.setView)

  if (!eventId) return null

  const openFullWorkspace = () => {
    closeCalendarEventPeek()
    setView('calendar')
  }

  return (
    <aside className="h-full min-w-0 overflow-hidden border-s border-[var(--im-divider)] bg-card">
      <CalendarEventPeekContent
        eventId={eventId}
        onClose={closeCalendarEventPeek}
        onOpenFull={openFullWorkspace}
      />
    </aside>
  )
}
