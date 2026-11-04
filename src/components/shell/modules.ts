import type { ViewKey } from '@/types'

/** Main-rail modules. Each owns a set of views and the nested sidebar content
 * shown for them; the URL `view` keys stay exactly as before. */
export type ShellModule = 'chat' | 'course' | 'slides' | 'cases'

const COURSE_VIEWS = new Set<ViewKey['view']>(['learning', 'forum', 'course-materials', 'courses', 'course-members', 'course-status'])

export function moduleForView(view: ViewKey['view']): ShellModule {
  if (view === 'slides') return 'slides'
  if (view === 'cases') return 'cases'
  if (COURSE_VIEWS.has(view)) return 'course'
  return 'chat'
}

let lastCourseView: ViewKey['view'] | null = null

/** Remember where the user was inside the course module so the rail returns there. */
export function rememberCourseView(view: ViewKey['view']): void {
  if (COURSE_VIEWS.has(view)) lastCourseView = view
}

export function courseEntryView(hasSpace: boolean): ViewKey['view'] {
  return hasSpace && lastCourseView ? lastCourseView : 'learning'
}
