import {
  Calendar03Icon,
  DashboardSquare01Icon,
  Folder01Icon,
  Settings02Icon,
} from '@hugeicons/core-free-icons'
import type { LearningRole } from '../contracts'

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

export interface LearningDashboardMenuItem {
  section: LearningDashboardSection
  label: string
  icon: typeof DashboardSquare01Icon
}

const PERSONAL_MENU: LearningDashboardMenuItem[] = [
  { section: 'overview', label: '概览', icon: DashboardSquare01Icon },
  { section: 'calendar', label: '日历', icon: Calendar03Icon },
  { section: 'resources', label: '资料', icon: Folder01Icon },
]

const LEARNER_MENU: LearningDashboardMenuItem[] = [
  { section: 'overview', label: '概览', icon: DashboardSquare01Icon },
  { section: 'calendar', label: '日历', icon: Calendar03Icon },
  { section: 'resources', label: '资料', icon: Folder01Icon },
]

const TEACHER_MENU: LearningDashboardMenuItem[] = [
  { section: 'overview', label: '总览', icon: DashboardSquare01Icon },
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
