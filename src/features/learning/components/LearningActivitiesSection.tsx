import type { Dispatch, SetStateAction } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { learningApi } from '../api'
import type { LearningActivity, LearningCourse, LearningRole } from '../contracts'
import { ACTIVITY_TYPE_LABELS, EVALUATION_MODE_LABELS, statusLabel } from './learningDisplay'

interface LearningActivitiesSectionProps {
  course: LearningCourse
  activities: LearningActivity[]
  perspective: LearningRole
  answers: Record<string, string>
  setAnswers: Dispatch<SetStateAction<Record<string, string>>>
  onChanged(): Promise<void>
  onError(error: unknown): void
}

export function LearningActivitiesSection({
  course, activities, perspective, answers, setAnswers, onChanged, onError,
}: LearningActivitiesSectionProps) {
  return (
    <div className="space-y-3">
      {activities.map((activity) => (
        <Card key={activity.id} size="sm">
          <CardContent>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading text-sm font-medium">{activity.title}</h3>
                  <Badge variant="secondary">{statusLabel(activity.status)}</Badge>
                </div>
                <p className="text-sm leading-5 text-muted-foreground">{activity.instructions}</p>
                <p className="text-xs text-muted-foreground">
                  {ACTIVITY_TYPE_LABELS[activity.type] ?? activity.type} · L{activity.targetLevel} ·{' '}
                  {EVALUATION_MODE_LABELS[activity.evaluationMode] ?? activity.evaluationMode}
                </p>
              </div>
              {perspective === 'teacher' && (
                <div className="flex gap-3">
                  {activity.status === 'draft' && (
                    <Button size="sm" onClick={() => void learningApi.publishActivity(course.id, activity.id).then(onChanged).catch(onError)}>
                      发布
                    </Button>
                  )}
                  {activity.status === 'published' && (
                    <Button size="sm" variant="secondary" onClick={() => void learningApi.closeActivity(course.id, activity.id).then(onChanged).catch(onError)}>
                      关闭
                    </Button>
                  )}
                </div>
              )}
            </div>
            {perspective === 'learner' && activity.status === 'published' && (
              <div className="mt-4 space-y-3">
                <Textarea
                  value={answers[activity.id] ?? ''}
                  onChange={(event) => setAnswers((current) => ({ ...current, [activity.id]: event.target.value }))}
                  placeholder="在这里提交你的作答或反思"
                  className="min-h-24"
                />
                <Button
                  onClick={() => void learningApi
                    .submitActivity(course.id, activity.id, answers[activity.id] ?? '')
                    .then(async () => {
                      setAnswers((current) => ({ ...current, [activity.id]: '' }))
                      await onChanged()
                    })
                    .catch(onError)}
                >
                  提交为学习证据
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
