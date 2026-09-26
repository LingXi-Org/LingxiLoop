import {
  Archive02Icon,
  Calendar03Icon,
  DashboardSquare01Icon,
  File01Icon,
  Folder01Icon,
  Settings02Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import type { ViewKey } from '@/types'
import type { LearningSpace } from '../contracts'

export type LearningDashboardSection =
  | 'overview'
  | 'activities'
  | 'learners'
  | 'content'
  | 'reviews'
  | 'members'
  | 'calendar'
  | 'resources'
  | 'settings'
  | 'status'

export interface LearningDashboardMenuItem {
  section: LearningDashboardSection
  label: string
  icon: typeof DashboardSquare01Icon
  management?: boolean
}

const LEARNER_MENU: LearningDashboardMenuItem[] = [
  { section: 'overview', label: '学习概览', icon: DashboardSquare01Icon },
  { section: 'calendar', label: '日历', icon: Calendar03Icon },
  { section: 'resources', label: '资料', icon: Folder01Icon },
]

const MANAGEMENT_MENU: LearningDashboardMenuItem[] = [
  { section: 'settings', label: '基本资料', icon: Settings02Icon, management: true },
  { section: 'content', label: '课程内容', icon: File01Icon, management: true },
  { section: 'members', label: '成员与邀请', icon: UserGroupIcon, management: true },
  { section: 'status', label: '课程状态', icon: Archive02Icon, management: true },
]

type NavigationContext = Pick<LearningSpace, 'perspective' | 'canManage' | 'courseId'>

export function getLearningDashboardMenu(input: NavigationContext): LearningDashboardMenuItem[] {
  return input.perspective === 'teacher' && input.canManage && input.courseId
    ? [...LEARNER_MENU, ...MANAGEMENT_MENU]
    : LEARNER_MENU
}

export function getLearningDashboardDefaultSection(input: NavigationContext): LearningDashboardSection {
  return getLearningDashboardMenu(input)[0].section
}

export function isLearningDashboardSectionAvailable(
  section: LearningDashboardSection,
  input: NavigationContext,
): boolean {
  return getLearningDashboardMenu(input).some((item) => item.section === section)
}

const SECTION_VIEWS = {
  overview: 'learning', calendar: 'calendar', resources: 'library', settings: 'courses',
  content: 'course-content', members: 'course-members', status: 'course-status',
} as const satisfies Partial<Record<LearningDashboardSection, ViewKey['view']>>

export function viewForLearningSection(section: LearningDashboardSection): ViewKey['view'] {
  return SECTION_VIEWS[section as keyof typeof SECTION_VIEWS] ?? 'learning'
}

export function learningSectionForView(view: ViewKey['view']): LearningDashboardSection {
  return (Object.keys(SECTION_VIEWS) as Array<keyof typeof SECTION_VIEWS>)
    .find((section) => SECTION_VIEWS[section] === view) ?? 'overview'
}

export function viewForWorkspace(view: ViewKey['view'], space: NavigationContext): ViewKey['view'] {
  if (view === 'conversations') return view
  const section = learningSectionForView(view)
  return isLearningDashboardSectionAvailable(section, space) ? viewForLearningSection(section) : 'learning'
}
