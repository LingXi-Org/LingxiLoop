import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useParticipants } from '@/features/agents/state'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { userFacingError } from '@/lib/userFacingError'
import { learningApi } from '../api'
import type { LearningCourse, LearningProgress, LearningReview } from '../contracts'

interface LearningReviewsSectionProps {
  course: LearningCourse
  reviews: LearningReview[]
  progress: LearningProgress[]
  onChanged(): Promise<void>
  onError(error: unknown): void
}

export function LearningReviewsSection({ course, reviews, progress, onChanged, onError }: LearningReviewsSectionProps) {
  const participantsById = useParticipants((state) => state.byId)

  const review = async (item: LearningReview, decision: 'accept' | 'reject') => {
    if (course.perspective !== 'teacher' || !course.canManage || !course.canReview) return
    const accepted = decision === 'accept'
    const confirmed = await confirmSensitiveAction({
      title: accepted ? '接受这条评价？' : '退回这条评价？',
      description: accepted ? '评价结果将写入学习者的掌握状态。' : '评价将退回，等待补充学习证据。',
      confirmLabel: accepted ? '接受评价' : '退回评价',
      tone: 'warning',
    })
    if (!confirmed) return
    try {
      await toastAction(learningApi.reviewEvaluation(course.projectId, item.id, {
        decision,
        reason: accepted ? '课程创建者确认评价与证据一致' : '证据不足，需要补充',
      }), {
        loading: accepted ? '正在接受评价' : '正在退回评价',
        success: accepted ? '评价已接受' : '评价已退回',
        error: accepted ? '接受评价失败，请稍后重试' : '退回评价失败，请稍后重试',
      })
      await onChanged()
    } catch (reason) {
      onError(userFacingError(reason, '评价审核未完成，请稍后重试。'))
    }
  }

  return (
    <div className="space-y-3">
      {reviews.map((item) => (
        <Card key={item.id} size="sm">
          <CardContent className="space-y-3">
            <div>
              <h3 className="font-heading text-sm font-medium">{item.activity_title ?? '学习评价'}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                学习者 {progress.find((learner) => learner.user_id === item.learner_id)?.display_name ?? '课程成员'} · 建议掌握等级 {item.demonstrated_level} · 置信度 {Math.round(item.confidence * 100)}%
              </p>
            </div>
            <p className="text-sm">{item.feedback}</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                评价提交者：{item.builder_agent_id ? participantsById[item.builder_agent_id]?.name ?? '教学智能助教' : '未绑定'}
              </Badge>
              <Badge variant={item.verifier_verdict === 'supported' ? 'secondary' : 'outline'}>
                独立复核：{item.verifier_agent_id ? participantsById[item.verifier_agent_id]?.name ?? '教学智能助教' : '尚未复核'} ·{' '}
                {item.verifier_verdict === 'supported' ? '证据支持' : item.verifier_verdict === 'rejected' ? '证据冲突' : '需课程创建者审核'}
              </Badge>
            </div>
            {course.perspective === 'teacher' && course.canManage && course.canReview && <div className="flex flex-wrap gap-3">
              <Button size="sm" onClick={() => void review(item, 'accept')}>
                {item.demonstrated_level === 4 ? '课程创建者确认掌握等级 4' : '接受'}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void review(item, 'reject')}>退回</Button>
            </div>}
          </CardContent>
        </Card>
      ))}
      {reviews.length === 0 && (
        <Card size="sm"><CardContent className="text-sm text-muted-foreground">没有待审核评价。</CardContent></Card>
      )}
    </div>
  )
}
