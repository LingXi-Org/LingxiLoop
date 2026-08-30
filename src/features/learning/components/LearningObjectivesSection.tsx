import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { learningApi } from '../api'
import type { LearningCourse, LearningObjective, LearningRole } from '../contracts'
import { MasteryBadge, statusLabel } from './learningDisplay'

interface LearningObjectivesSectionProps {
  course: LearningCourse
  objectives: LearningObjective[]
  perspective: LearningRole
  mastery: ReadonlyMap<string, number>
  onChanged(): Promise<void>
  onError(error: unknown): void
}

export function LearningObjectivesSection({
  course, objectives, perspective, mastery, onChanged, onError,
}: LearningObjectivesSectionProps) {
  return (
    <div className="space-y-3">
      {objectives.map((objective, index) => (
        <Card key={objective.id} size="sm">
          <CardContent className="flex gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-heading text-sm font-medium">{objective.title}</h3>
                {perspective === 'learner' && <MasteryBadge level={mastery.get(objective.id) ?? 0} />}
              </div>
              <p className="text-sm leading-5 text-muted-foreground">成功标准：{objective.successCriteria}</p>
              <p className="text-xs text-muted-foreground">
                目标等级 L{objective.targetLevel} · 先修 {objective.prerequisiteIds.length || '无'} · {statusLabel(objective.status)}
              </p>
              {perspective === 'teacher' && objective.status === 'DRAFT' && course.courseId && (
                <Button
                  size="sm"
                  onClick={() => void learningApi
                    .setObjectiveStatus(course.courseId!, objective.id, 'PUBLISHED')
                    .then(onChanged)
                    .catch(onError)}
                >
                  发布目标
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
      {objectives.length === 0 && (
        <Card size="sm"><CardContent className="text-sm text-muted-foreground">还没有目标。教师或 Nova 可以先创建草稿。</CardContent></Card>
      )}
    </div>
  )
}
