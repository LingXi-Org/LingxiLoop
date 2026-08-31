import {
  Activity01Icon,
  BookOpen01Icon,
  Calendar03Icon,
  DashboardSquare01Icon,
  File01Icon,
  Folder01Icon,
  GoalIcon,
  Settings02Icon,
  Share01Icon,
  Task01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import type { LearningRole } from '../contracts'

export type LearningDashboardSection =
  | 'overview'
  | 'plan'
  | 'objectives'
  | 'missions'
  | 'activities'
  | 'evidence'
  | 'learners'
  | 'content'
  | 'reviews'
  | 'members'
  | 'calendar'
  | 'resources'
  | 'settings'

export interface LearningDashboardMenuItem {
  section: LearningDashboardSection
  label: string
  icon: typeof DashboardSquare01Icon
}

const PERSONAL_MENU: LearningDashboardMenuItem[] = [
  { section: 'overview', label: '概览', icon: DashboardSquare01Icon },
  { section: 'plan', label: '学习计划', icon: Task01Icon },
  { section: 'objectives', label: '学习目标', icon: GoalIcon },
  { section: 'evidence', label: '学习证据', icon: File01Icon },
  { section: 'calendar', label: '日历', icon: Calendar03Icon },
  { section: 'resources', label: '资料', icon: Folder01Icon },
]

const LEARNER_MENU: LearningDashboardMenuItem[] = [
  { section: 'overview', label: '概览', icon: DashboardSquare01Icon },
  { section: 'missions', label: '学习任务', icon: Task01Icon },
  { section: 'objectives', label: '学习目标', icon: GoalIcon },
  { section: 'activities', label: '课程活动', icon: Activity01Icon },
  { section: 'evidence', label: '学习证据', icon: File01Icon },
  { section: 'calendar', label: '日历', icon: Calendar03Icon },
  { section: 'resources', label: '资料', icon: Folder01Icon },
]

const TEACHER_MENU: LearningDashboardMenuItem[] = [
  { section: 'overview', label: '总览', icon: DashboardSquare01Icon },
  { section: 'learners', label: '学员', icon: UserGroupIcon },
  { section: 'content', label: '课程内容', icon: BookOpen01Icon },
  { section: 'activities', label: '学习活动', icon: Activity01Icon },
  { section: 'reviews', label: '评价审核', icon: File01Icon },
  { section: 'members', label: '分享与成员', icon: Share01Icon },
  { section: 'calendar', label: '日历', icon: Calendar03Icon },
  { section: 'resources', label: '资料', icon: Folder01Icon },
  { section: 'settings', label: '课程设置', icon: Settings02Icon },
]

export function getLearningDashboardMenu(input: {
  personal: boolean
  perspective: LearningRole
}): LearningDashboardMenuItem[] {
  if (input.personal) return PERSONAL_MENU
  return input.perspective === 'teacher' ? TEACHER_MENU : LEARNER_MENU
}

export function getLearningDashboardDefaultSection(input: {
  personal: boolean
  perspective: LearningRole
}): LearningDashboardSection {
  return getLearningDashboardMenu(input)[0].section
}

export function isLearningDashboardSectionAvailable(
  section: LearningDashboardSection,
  input: { personal: boolean; perspective: LearningRole },
): boolean {
  return getLearningDashboardMenu(input).some((item) => item.section === section)
}
