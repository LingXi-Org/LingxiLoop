import type { Dispatch, SetStateAction } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { userFacingError } from '@/lib/userFacingError'
import { learningApi } from '../api'
import type { LearningActivity, LearningCourse, LearningEvidence, LearningRole } from '../contracts'
import { ACTIVITY_TYPE_LABELS, EVALUATION_MODE_LABELS } from './learningDisplay'

interface LearningActivitiesSectionProps {
  course: LearningCourse
  activities: LearningActivity[]
  evidence?: LearningEvidence[]
  perspective: LearningRole
  answers: Record<string, string>
  setAnswers: Dispatch<SetStateAction<Record<string, string>>>
  onChanged(): Promise<void>
  onError(error: unknown): void
}

export function LearningActivitiesSection({
  course, activities, evidence = [], perspective, answers, setAnswers, onChanged, onError,
}: LearningActivitiesSectionProps) {
  const changeActivityStatus = async (activity: LearningActivity, action: 'publish' | 'close') => {
    if (perspective !== 'teacher' || !course.canManage || !course.canEditContent || !course.courseId) return
    const publishing = action === 'publish'
    const confirmed = await confirmSensitiveAction({
      title: publishing ? '发布学习活动？' : '关闭学习活动？',
      description: publishing
        ? `“${activity.title}”将对课程学习者开放。`
        : `“${activity.title}”将停止接收新的学习证据。`,
      confirmLabel: publishing ? '发布活动' : '关闭活动',
      tone: 'warning',
    })
    if (!confirmed) return
    try {
      const request = publishing
        ? learningApi.publishActivity(course.courseId, activity.id)
        : learningApi.closeActivity(course.courseId, activity.id)
      await toastAction(request, {
        loading: publishing ? '正在发布学习活动' : '正在关闭学习活动',
        success: publishing ? '学习活动已发布' : '学习活动已关闭',
        error: publishing ? '发布学习活动失败，请稍后重试' : '关闭学习活动失败，请稍后重试',
      })
      await onChanged()
    } catch (reason) {
      onError(userFacingError(reason, '学习活动状态未能更新，请稍后重试。'))
    }
  }

  const submitEvidence = async (activity: LearningActivity) => {
    if (perspective !== 'learner' || !course.canSubmit) return
    try {
      await toastAction(learningApi.submitActivity(course.projectId, activity.id, answers[activity.id] ?? ''), {
        loading: '正在提交学习证据', success: '学习证据已提交', error: '提交学习证据失败，请稍后重试',
      })
      setAnswers((current) => ({ ...current, [activity.id]: '' }))
      await onChanged()
    } catch (reason) {
      onError(userFacingError(reason, '学习证据未能提交，请稍后重试。'))
    }
  }

  const submittedActivityIds = new Set(
    evidence.flatMap((item) => item.activity_id ? [item.activity_id] : []),
  )
  const columns = perspective === 'teacher'
    ? [
        { key: 'draft', label: '草稿', empty: '没有草稿活动', items: activities.filter((activity) => activity.status === 'DRAFT') },
        { key: 'published', label: '已发布', empty: '没有已发布活动', items: activities.filter((activity) => activity.status === 'PUBLISHED') },
        { key: 'closed', label: '已结束', empty: '没有已结束活动', items: activities.filter((activity) => activity.status === 'CLOSED') },
      ]
    : [
        {
          key: 'ready',
          label: '待开始',
          empty: '没有待开始的活动',
          items: activities.filter((activity) => activity.status === 'PUBLISHED'
            && !submittedActivityIds.has(activity.id) && !answers[activity.id]?.trim()),
        },
        {
          key: 'active',
          label: '进行中',
          empty: '没有进行中的活动',
          items: activities.filter((activity) => activity.status === 'PUBLISHED'
            && !submittedActivityIds.has(activity.id) && Boolean(answers[activity.id]?.trim())),
        },
        {
          key: 'submitted',
          label: '已提交',
          empty: '还没有已提交的活动',
          items: activities.filter((activity) => submittedActivityIds.has(activity.id)),
        },
      ]

  return (
    <div className="grid items-start gap-4 @min-[72rem]/learning-grid:grid-cols-3">
      {columns.map((column) => {
        return (
          <section key={column.key} className="space-y-3 rounded-3xl bg-muted/40 p-3" aria-labelledby={`activity-column-${column.key}`}>
            <div className="flex items-center justify-between gap-3 px-1">
              <h2 id={`activity-column-${column.key}`} className="font-heading text-sm font-medium">{column.label}</h2>
              <Badge variant="secondary" className="tabular-nums">{column.items.length}</Badge>
            </div>
            {column.items.map((activity) => (
              <Card key={activity.id} size="sm">
                <CardContent>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <h3 className="font-heading text-sm font-medium">{activity.title}</h3>
                      <p className="text-sm leading-5 text-muted-foreground">{activity.instructions}</p>
                      <p className="text-xs text-muted-foreground">
                        {ACTIVITY_TYPE_LABELS[activity.kind] ?? '学习活动'} · 目标掌握等级 {activity.targetLevel} ·{' '}
                        {EVALUATION_MODE_LABELS[activity.evaluationMode] ?? '评价方式待同步'}
                      </p>
                      {activity.dueAt && <p className="text-xs text-muted-foreground">截止时间：{new Date(activity.dueAt).toLocaleString('zh-CN')}</p>}
                    </div>
                    {perspective === 'teacher' && course.canManage && course.canEditContent && (
                      <div className="flex gap-3">
                        {activity.status === 'DRAFT' && course.courseId && (
                          <Button size="sm" onClick={() => void changeActivityStatus(activity, 'publish')}>发布</Button>
                        )}
                        {activity.status === 'PUBLISHED' && course.courseId && (
                          <Button size="sm" variant="secondary" onClick={() => void changeActivityStatus(activity, 'close')}>关闭</Button>
                        )}
                      </div>
                    )}
                  </div>
                  {perspective === 'learner' && course.canSubmit && activity.status === 'PUBLISHED' && !submittedActivityIds.has(activity.id) && (
                    <div className="mt-4 space-y-3">
                      <Textarea
                        value={answers[activity.id] ?? ''}
                        onChange={(event) => setAnswers((current) => ({ ...current, [activity.id]: event.target.value }))}
                        placeholder="在这里提交你的作答或反思"
                        className="min-h-24"
                      />
                      <Button disabled={!answers[activity.id]?.trim()} onClick={() => void submitEvidence(activity)}>提交为学习证据</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {column.items.length === 0 && <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">{column.empty}</p>}
          </section>
        )
      })}
    </div>
  )
}
