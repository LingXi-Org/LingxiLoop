import {
  ChartHistogramIcon,
  FolderLibraryIcon,
  MessageMultiple01Icon,
  Settings02Icon,
} from '@hugeicons/core-free-icons'
import type { ViewKey } from '@/types'
import type { LearningSpace } from '../contracts'

export type LearningDashboardSection =
  | 'overview'
  | 'members'
  | 'forum'
  | 'materials'
  | 'settings'
  | 'status'

export interface LearningDashboardMenuItem {
  section: LearningDashboardSection
  label: string
  icon: typeof ChartHistogramIcon
  management?: boolean
}

const LEARNER_MENU: LearningDashboardMenuItem[] = [
  { section: 'overview', label: '学习概览', icon: ChartHistogramIcon },
  { section: 'forum', label: '论坛', icon: MessageMultiple01Icon },
  { section: 'materials', label: '课程资料', icon: FolderLibraryIcon },
]

const MANAGEMENT_MENU: LearningDashboardMenuItem[] = [
  { section: 'settings', label: '课程设置', icon: Settings02Icon, management: true },
]

type NavigationContext = Pick<LearningSpace, 'perspective' | 'canManage' | 'courseId'>

export function getLearningDashboardMenu(input: NavigationContext): LearningDashboardMenuItem[] {
  const menu = LEARNER_MENU.filter(item => !['forum', 'materials'].includes(item.section) || input.courseId)
  return input.perspective === 'teacher' && input.canManage && input.courseId
    ? [...menu, ...MANAGEMENT_MENU]
    : menu
}

export function getLearningDashboardDefaultSection(input: NavigationContext): LearningDashboardSection {
  return getLearningDashboardMenu(input)[0].section
}

export function isLearningDashboardSectionAvailable(
  section: LearningDashboardSection,
  input: NavigationContext,
): boolean {
  if (section === 'members' || section === 'status') {
    return input.perspective === 'teacher' && input.canManage && Boolean(input.courseId)
  }
  return getLearningDashboardMenu(input).some((item) => item.section === section)
}

const SECTION_VIEWS = {
  overview: 'learning', forum: 'forum', materials: 'course-materials', settings: 'courses',
  members: 'course-members', status: 'course-status',
} as const satisfies Partial<Record<LearningDashboardSection, ViewKey['view']>>

export function viewForLearningSection(section: LearningDashboardSection): ViewKey['view'] {
  return SECTION_VIEWS[section as keyof typeof SECTION_VIEWS] ?? 'learning'
}

export function learningSectionForView(view: ViewKey['view']): LearningDashboardSection {
  return (Object.keys(SECTION_VIEWS) as Array<keyof typeof SECTION_VIEWS>)
    .find((section) => SECTION_VIEWS[section] === view) ?? 'overview'
}

export function viewForWorkspace(view: ViewKey['view'], space: NavigationContext): ViewKey['view'] {
  if (view === 'conversations' || view === 'cases') return view
  const section = learningSectionForView(view)
  return isLearningDashboardSectionAvailable(section, space) ? viewForLearningSection(section) : 'learning'
}
