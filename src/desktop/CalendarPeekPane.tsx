import { useApp } from '@/stores/app'
import { useSurface } from '@/stores/surface'
import { CalendarEventPeekContent } from '@/components/ArtifactPeekContent'

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
    <aside className="min-w-0 h-full border-l border-ink-100 bg-cloud overflow-hidden">
      <CalendarEventPeekContent
        eventId={eventId}
        onClose={closeCalendarEventPeek}
        onOpenFull={openFullWorkspace}
      />
    </aside>
  )
}
