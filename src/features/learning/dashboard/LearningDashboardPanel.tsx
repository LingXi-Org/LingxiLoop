import type { LearningSpace } from '../contracts'
import { CourseForum } from '../forum/CourseForum'
import type { LearningDashboardSection } from './navigation'
export function LearningDashboardPanel({ space }: { space: LearningSpace; section: LearningDashboardSection }) {
  return <CourseForum key={space.courseId ?? space.projectId} space={space} />
}
