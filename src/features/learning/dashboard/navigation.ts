import { UserGroupIcon } from '@hugeicons/core-free-icons'
import type { ViewKey } from '@/types'
import type { LearningSpace } from '../contracts'
export type LearningDashboardSection = 'forum'
type NavigationContext = Pick<LearningSpace, 'perspective' | 'canManage' | 'courseId'>
export function getLearningDashboardMenu(input: NavigationContext) {
  return input.courseId ? [{ section: 'forum' as const, label: '学习论坛', icon: UserGroupIcon, management: false }] : []
}
export function getLearningDashboardDefaultSection(): LearningDashboardSection { return 'forum' }
export function isLearningDashboardSectionAvailable(section: LearningDashboardSection, input: NavigationContext) {
  return section === 'forum' && Boolean(input.courseId)
}
export function viewForLearningSection(_section: LearningDashboardSection): ViewKey['view'] { return 'forum' }
export function learningSectionForView(_view: ViewKey['view']): LearningDashboardSection { return 'forum' }
export function viewForWorkspace(view: ViewKey['view'], space: NavigationContext): ViewKey['view'] {
  return view === 'conversations' || view === 'agents' ? view : space.courseId ? 'forum' : 'conversations'
}
