import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { userFacingError } from '@/lib/userFacingError'
import { learningApi } from '../api'
import type { LearningCourse, LearningObjective, LearningRole } from '../contracts'
import { MasteryBadge, statusLabel } from './learningDisplay'

interface LearnerObjectiveDetails {
  nextReviewAt: string | null
  activityTitles: string[]
  missionStepTitles: string[]
  evidenceCount: number
}

interface LearningObjectivesSectionProps {
  course: LearningCourse
  objectives: LearningObjective[]
  perspective: LearningRole
  mastery: ReadonlyMap<string, number>
  learnerDetailsById?: ReadonlyMap<string, LearnerObjectiveDetails>
  onChanged(): Promise<void>
  onError(error: unknown): void
}

function ObjectiveEvidenceDetails({ details }: { details?: LearnerObjectiveDetails }) {
  if (!details) return null
  return (
    <div className="grid gap-2 rounded-2xl border p-3 text-xs text-muted-foreground">
      <p>
        关联证据 <span className="font-medium text-foreground">{details.evidenceCount}</span> 条{' · '}
        下次复习：{details.nextReviewAt ? new Date(details.nextReviewAt).toLocaleString('zh-CN') : '尚未安排'}
      </p>
      {(details.activityTitles.length > 0 || details.missionStepTitles.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <span>关联来源：</span>
          {details.activityTitles.map((title, index) => (
            <Badge key={`activity-${title}-${index}`} variant="outline">活动 · {title}</Badge>
          ))}
          {details.missionStepTitles.map((title, index) => (
            <Badge key={`step-${title}-${index}`} variant="outline">步骤 · {title}</Badge>
          ))}
        </div>
      )}
    </div>
  )
}

export function LearningObjectivesSection({
  course, objectives, perspective, mastery, learnerDetailsById, onChanged, onError,
}: LearningObjectivesSectionProps) {
  const changeObjectiveStatus = async (
    objective: LearningObjective,
    status: 'PUBLISHED' | 'ARCHIVED',
  ) => {
    if (perspective !== 'teacher' || !course.canManage || !course.canEditContent || !course.courseId) return
    const publishing = status === 'PUBLISHED'
    const confirmed = await confirmSensitiveAction({
      title: publishing ? '发布学习目标？' : '归档学习目标？',
      description: publishing
        ? `“${objective.title}”将对课程学习者可见。`
        : `“${objective.title}”将从当前课程内容中归档。`,
      confirmLabel: publishing ? '发布目标' : '归档目标',
      tone: publishing ? 'warning' : 'destructive',
    })
    if (!confirmed) return
    try {
      await toastAction(learningApi.setObjectiveStatus(course.courseId, objective.id, status), {
        loading: publishing ? '正在发布学习目标' : '正在归档学习目标',
        success: publishing ? '学习目标已发布' : '学习目标已归档',
        error: publishing ? '发布学习目标失败，请稍后重试' : '归档学习目标失败，请稍后重试',
      })
      await onChanged()
    } catch (reason) {
      onError(userFacingError(reason, publishing ? '学习目标未能发布，请稍后重试。' : '学习目标未能归档，请稍后重试。'))
    }
  }

  const objectivesById = new Map(objectives.map((objective) => [objective.id, objective]))

  return (
    <div className="space-y-3">
      {objectives.map((objective, index) => {
        const masteryLevel = mastery.get(objective.id)
        const prerequisites = objective.prerequisiteIds.map(
          (id) => objectivesById.get(id)?.title ?? '已归档前置目标',
        )
        return <Card key={objective.id} size="sm">
          <CardContent className="flex gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-heading text-sm font-medium">{objective.title}</h3>
                {perspective === 'learner' && masteryLevel !== undefined && <MasteryBadge level={masteryLevel} />}
              </div>
              <p className="text-sm leading-5 text-muted-foreground">成功标准：{objective.successCriteria}</p>
              <p className="text-xs text-muted-foreground">
                目标掌握等级 {objective.targetLevel} · {statusLabel(objective.status)}
              </p>
              <div className="rounded-2xl bg-muted p-3">
                <p className="text-xs font-medium">前置目标</p>
                {prerequisites.length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {prerequisites.map((title, prerequisiteIndex) => (
                      <span key={`${objective.id}-${prerequisiteIndex}`} className="contents">
                        {prerequisiteIndex > 0 && <span className="text-muted-foreground">·</span>}
                        <span className="rounded-xl bg-card px-2.5 py-1 text-xs shadow-sm">{title}</span>
                      </span>
                    ))}
                    <span className="text-muted-foreground">→</span>
                    <span className="text-xs font-medium">{objective.title}</span>
                  </div>
                ) : <p className="mt-1 text-xs text-muted-foreground">无需先完成其他目标</p>}
              </div>
              {perspective === 'learner' && <ObjectiveEvidenceDetails details={learnerDetailsById?.get(objective.id)} />}
              {perspective === 'teacher' && course.canManage && course.canEditContent && objective.status !== 'ARCHIVED' && course.courseId && (
                <div className="flex flex-wrap gap-3">
                  {objective.status === 'DRAFT' && (
                    <Button size="sm" onClick={() => void changeObjectiveStatus(objective, 'PUBLISHED')}>发布目标</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => void changeObjectiveStatus(objective, 'ARCHIVED')}>归档目标</Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      })}
      {objectives.length === 0 && (
        <Card size="sm"><CardContent className="text-sm text-muted-foreground">还没有学习目标。</CardContent></Card>
      )}
    </div>
  )
}
