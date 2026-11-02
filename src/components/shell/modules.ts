import type { ViewKey } from '@/types'

/** Main-rail modules. Each owns a set of views and the nested sidebar content
 * shown for them; the URL `view` keys stay exactly as before. */
export type ShellModule = 'chat' | 'course' | 'slides'

const COURSE_VIEWS = new Set<ViewKey['view']>(['learning', 'forum', 'course-materials', 'cases', 'courses', 'course-members', 'course-status'])

export function moduleForView(view: ViewKey['view']): ShellModule {
  if (view === 'slides') return 'slides'
  if (COURSE_VIEWS.has(view)) return 'course'
  return 'chat'
}

let lastCourseView: ViewKey['view'] | null = null

/** Remember where the user was inside the course module so the rail returns there. */
export function rememberCourseView(view: ViewKey['view']): void {
  if (COURSE_VIEWS.has(view)) lastCourseView = view
}

export function courseEntryView(hasSpace: boolean): ViewKey['view'] {
  if (lastCourseView && (hasSpace || lastCourseView === 'cases')) return lastCourseView
  return hasSpace ? 'learning' : 'cases'
}
