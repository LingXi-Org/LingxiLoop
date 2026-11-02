import { lazy } from 'react'
import type { LearningSpace } from '../contracts'
import { CourseOverviewDashboard } from './CourseOverviewDashboard'
import { DashboardSectionFrame } from './DashboardSectionFrame'
import { isLearningDashboardSectionAvailable, type LearningDashboardSection } from './navigation'

const CourseMaterialsPage = lazy(() => import('@/features/course-materials/CourseMaterialsPage').then(module => ({ default: module.CourseMaterialsPage })))
const CourseForum = lazy(() => import('../forum/CourseForum').then(module => ({ default: module.CourseForum })))
const CourseSettingsSection = lazy(() => import('./CourseSettingsSection').then(module => ({ default: module.CourseSettingsSection })))

export function LearningDashboardPanel({ space, section }: { space: LearningSpace; section: LearningDashboardSection }) {
  const available = isLearningDashboardSectionAvailable(section, space) ? section : 'overview'
  if (available === 'materials') return <CourseMaterialsPage key={`${space.companyId}:${space.projectId}`} projectId={space.projectId} projectName={space.title} />
  if (available === 'forum') return <CourseForum key={space.courseId ?? space.projectId} space={space} />
  if (available === 'settings' || available === 'members' || available === 'status') return <CourseSettingsSection key={space.projectId} space={space} section={available === 'settings' ? 'profile' : available} />
  return <DashboardSectionFrame space={space} section="overview"><CourseOverviewDashboard key={space.projectId} space={space} /></DashboardSectionFrame>
}
