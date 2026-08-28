import { useEffect, useMemo, useState } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
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

export function LearningCenter() {
  const [section, setSection] = useState<LearningSection>('today')
  const {
    dashboard, courseId, setCourseId, objectives, activities, evidence, missions, reviews, progress,
    teacherAgent, answers, setAnswers, notificationPrefs, setNotificationPrefs, deliveries,
    error, setError, loadDashboard, refreshCourse,
  } = useLearningCenter()
  const course = dashboard?.courses.find((item) => item.id === courseId)
  const perspective = course?.courseRole ?? 'learner'

  useEffect(() => {
    const inaccessible = (perspective === 'teacher' && section === 'evidence')
      || (perspective === 'learner' && section === 'reviews')
    if (inaccessible) setSection('today')
  }, [perspective, section])

  const mastery = useMemo(() => new Map(
    (dashboard?.mastery ?? [])
      .filter((item) => item.course_id === courseId)
      .map((item) => [item.objective_id, item.level]),
  ), [courseId, dashboard?.mastery])

  const onError = (reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason))

  if (!dashboard) {
    return error
      ? <div className="grid h-full place-items-center text-sm text-muted-foreground">{error}</div>
      : <ResourceSkeleton variant="detail" className="h-full" label="正在加载学习中心" />
  }
  if (dashboard.courses.length === 0) return <Onboarding onCreated={loadDashboard} />
  if (!course) return null

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <LearningCenterHeader
        course={course}
        courses={dashboard.courses}
        courseId={courseId}
        perspective={perspective}
        section={section}
        reviewCount={reviews.length}
        onCourseChange={setCourseId}
        onSectionChange={setSection}
      />
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
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
              onChanged={refreshCourse}
              onError={onError}
            />
          )}
          {section === 'objectives' && (
            <LearningObjectivesSection
              course={course}
              objectives={objectives}
              perspective={perspective}
              mastery={mastery}
              onChanged={refreshCourse}
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
              onChanged={refreshCourse}
              onError={onError}
            />
          )}
          {section === 'evidence' && <LearningEvidenceSection evidence={evidence} />}
          {section === 'reviews' && (
            <LearningReviewsSection course={course} reviews={reviews} progress={progress} onChanged={refreshCourse} onError={onError} />
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
      </main>
    </div>
  )
}
