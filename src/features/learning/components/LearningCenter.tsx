import { useEffect, useMemo, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { useLearningCenter } from '../hooks/useLearningCenter'
import { LearningActivitiesSection } from './LearningActivitiesSection'
import { LearningCenterHeader } from './LearningCenterHeader'
import { LearningEvidenceSection } from './LearningEvidenceSection'
import { LearningNotificationsSection } from './LearningNotificationsSection'
import { LearningObjectivesSection } from './LearningObjectivesSection'
import { LearningReviewsSection } from './LearningReviewsSection'
import { Onboarding } from './LearningSetup'
import { LearningTodaySection } from './LearningTodaySection'
import type { LearningSection } from './learningDisplay'

export function LearningCenter({ workspaceId, allowOnboarding = false }: { workspaceId?: string; allowOnboarding?: boolean }) {
  const [section, setSection] = useState<LearningSection>('today')
  const {
    dashboard, projectId, setProjectId, objectives, activities, evidence, missions, reviews, progress,
    teacherAgent, answers, setAnswers, notificationPrefs, setNotificationPrefs, deliveries,
    error, setError, loadDashboard, refreshProject,
  } = useLearningCenter(workspaceId)
  const course = dashboard?.projects.find((item) => item.projectId === projectId)
  const perspective = course?.perspective ?? 'learner'

  useEffect(() => {
    const inaccessible = (perspective === 'teacher' && section === 'evidence')
      || (perspective === 'learner' && section === 'reviews')
    if (inaccessible) setSection('today')
  }, [perspective, section])

  const mastery = useMemo(() => new Map(
    (dashboard?.states ?? [])
      .filter((item) => item.projectId === projectId)
      .map((item) => [item.knowledgeUnitId, item.level]),
  ), [dashboard?.states, projectId])

  const onError = (reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))
  if (!dashboard) {
    return error
      ? <div className="h-full overflow-y-auto p-6"><Alert variant="destructive"><AlertTitle>学习中心暂不可用</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></div>
      : <div className="grid h-full gap-4 p-6" aria-label="正在加载学习中心"><Skeleton className="h-12 rounded-2xl" /><Skeleton className="h-48 rounded-4xl" /><Skeleton className="h-48 rounded-4xl" /></div>
  }
  if (dashboard.projects.length === 0 || (!course && allowOnboarding)) return <Onboarding onCreated={loadDashboard} />
  if (!course) return <Empty className="h-full border-0"><EmptyHeader><EmptyTitle>课程暂不可用</EmptyTitle><EmptyDescription>当前课程尚未加入学习中心，或你已失去访问权限。</EmptyDescription></EmptyHeader></Empty>

  return (
    <div className="flex h-full min-h-0 flex-col bg-card text-card-foreground">
      <LearningCenterHeader
        course={course}
        courses={workspaceId ? [course] : dashboard.projects}
        projectId={projectId}
        perspective={perspective}
        section={section}
        reviewCount={reviews.length}
        onProjectChange={setProjectId}
        projectSelectionLocked={Boolean(workspaceId)}
        onSectionChange={setSection}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
        <div className="mx-auto max-w-6xl space-y-4">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {section === 'today' && (
            <LearningTodaySection
              course={course}
              dashboard={dashboard}
              objectives={objectives}
              activities={activities}
              missions={missions}
              reviews={reviews}
              progress={progress}
              teacherAgent={teacherAgent}
              onChanged={refreshProject}
              onError={onError}
            />
          )}
          {section === 'objectives' && (
            <LearningObjectivesSection
              course={course}
              objectives={objectives}
              perspective={perspective}
              mastery={mastery}
              onChanged={refreshProject}
              onError={onError}
            />
          )}
          {section === 'activities' && (
            <LearningActivitiesSection
              course={course}
              activities={activities}
              perspective={perspective}
              answers={answers}
              setAnswers={setAnswers}
              onChanged={refreshProject}
              onError={onError}
            />
          )}
          {section === 'evidence' && <LearningEvidenceSection evidence={evidence} />}
          {section === 'reviews' && (
            <LearningReviewsSection course={course} reviews={reviews} progress={progress} onChanged={refreshProject} onError={onError} />
          )}
          {section === 'notifications' && (
            <LearningNotificationsSection
              course={course}
              preferences={notificationPrefs}
              setPreferences={setNotificationPrefs}
              deliveries={deliveries}
              onError={onError}
            />
          )}
        </div>
      </div>
    </div>
  )
}
