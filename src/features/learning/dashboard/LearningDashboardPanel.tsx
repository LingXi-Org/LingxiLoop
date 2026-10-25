import { CourseMaterialsPage } from '@/features/course-materials/CourseMaterialsPage'
import type { LearningSpace } from '../contracts'
import { CourseForum } from '../forum/CourseForum'
import { CourseSettingsSection } from './CourseSettingsSection'
import { CourseOverviewDashboard } from './CourseOverviewDashboard'
import { DashboardSectionFrame } from './DashboardSectionFrame'
import { isLearningDashboardSectionAvailable, type LearningDashboardSection } from './navigation'
export function LearningDashboardPanel({ space, section }: { space: LearningSpace; section: LearningDashboardSection }) {
  const available = isLearningDashboardSectionAvailable(section, space) ? section : 'overview'
  if (available === 'materials') return <CourseMaterialsPage key={`${space.companyId}:${space.projectId}`} projectId={space.projectId} projectName={space.title} readOnly={space.status !== 'ACTIVE'} />
  if (available === 'forum') return <CourseForum key={space.courseId ?? space.projectId} space={space} />
  if (available === 'settings' || available === 'members' || available === 'status') return <CourseSettingsSection key={space.projectId} space={space} section={available === 'settings' ? 'profile' : available} />
  return <DashboardSectionFrame space={space} section="overview"><CourseOverviewDashboard key={space.projectId} space={space} /></DashboardSectionFrame>
}
