import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CalendarView } from '@/features/calendar/components/CalendarView'
import { CourseSourceDrive } from '@/features/knowledge/components/CourseSourceDrive'
import { PersonalSourceDrive } from '@/features/knowledge/components/PersonalSourceDrive'
import { userFacingError } from '@/lib/userFacingError'
import type { LearningCourse, LearningSpace } from '../contracts'
import { CourseSettingsSection } from './CourseSettingsSection'
import { DashboardSectionFrame } from './DashboardSectionFrame'
import { LearnerOverviewDashboard } from './LearnerOverviewDashboard'
import type { LearningDashboardSection } from './navigation'
import { TeacherOverviewDashboard } from './TeacherOverviewDashboard'
import { useLearningDashboardData } from './useLearningDashboardData'

export function LearningDashboardPanel({ space, spaces, section, onOpenLearningSpace }: {
  space: LearningSpace
  spaces: LearningSpace[]
  section: LearningDashboardSection
  onOpenLearningSpace(projectId: string): void
}) {
  if (section === 'calendar') return <CalendarView />
  if (section === 'resources') {
    return space.projectKind === 'PERSONAL_LEARNING'
      ? <PersonalSourceDrive space={space} spaces={spaces} onOpenLearningSpace={onOpenLearningSpace} />
      : <CourseSourceDrive space={space} />
  }
  if (space.perspective === 'teacher') {
    if (section === 'settings') {
      return <CourseSettingsSection space={space} />
    }
    return <DashboardSectionFrame space={space} section="overview"><TeacherOverviewDashboard space={space} /></DashboardSectionFrame>
  }
  return <LearningDataSection space={space} section={section} />
}

function LearningDataSection({ space, section }: { space: LearningSpace; section: LearningDashboardSection }) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [mutationError, setMutationError] = useState('')
  const {
    overview,
    resources,
    overviewLoading,
    resourcesLoading,
    overviewError,
    resourcesError,
    refreshAll,
  } = useLearningDashboardData(space.projectId, space.perspective, space.canReview)
  const course: LearningCourse = {
    projectId: space.projectId,
    courseId: space.courseId ?? undefined,
    projectKind: space.projectKind,
    title: space.title,
    description: space.description,
    status: space.status,
    perspective: space.perspective,
    canManage: space.canManage,
    canEditContent: space.canEditContent,
    canSubmit: space.canSubmit,
    canReview: space.canReview,
  }
  const error = [overviewError, resourcesError, mutationError].filter(Boolean).join('；')
  const content = <LearnerOverviewDashboard course={course} overview={overview?.perspective === 'learner' ? overview : null} objectives={resources.objectives} activities={resources.activities} evidence={resources.evidence} missions={resources.missions} states={resources.states} loading={overviewLoading || resourcesLoading} answers={answers} setAnswers={setAnswers} onChanged={async () => { setMutationError(''); await refreshAll() }} onError={(reason) => setMutationError(userFacingError(reason, '学习记录未能更新，请稍后重试。'))} />

  return (
    <DashboardSectionFrame space={space} section={section}>
      <div className="space-y-4">
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {content}
      </div>
    </DashboardSectionFrame>
  )
}
