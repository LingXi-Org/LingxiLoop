import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useParticipants } from '@/features/agents/state'
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

  const review = (item: LearningReview, decision: 'accept' | 'reject') => {
    const acceptsLevelFour = decision === 'accept' && item.demonstrated_level === 4
    return learningApi.reviewEvaluation(course.id, item.id, {
      decision,
      reason: decision === 'accept' ? '教师确认评价与证据一致' : '证据不足，需要补充',
      ...(acceptsLevelFour ? { overrideLevel: 4 as const } : {}),
    }).then(onChanged).catch(onError)
  }

  return (
    <div className="space-y-3">
      {reviews.map((item) => (
        <Card key={item.id} size="sm">
          <CardContent className="space-y-3">
            <div>
              <h3 className="font-heading text-sm font-medium">{item.activity_title ?? '学习评价'}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                学习者 {progress.find((learner) => learner.user_id === item.learner_id)?.display_name ?? '课程成员'} · 建议 L{item.demonstrated_level} · 置信度 {Math.round(item.confidence * 100)}%
              </p>
            </div>
            <p className="text-sm">{item.feedback}</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                评价提交者：{item.builder_agent_id ? participantsById[item.builder_agent_id]?.name ?? '教学智能体' : '未绑定'}
              </Badge>
              <Badge variant={item.verifier_verdict === 'supported' ? 'secondary' : 'outline'}>
                独立复核：{item.verifier_agent_id ? participantsById[item.verifier_agent_id]?.name ?? '教学智能体' : '尚未复核'} ·{' '}
                {item.verifier_verdict === 'supported' ? '证据支持' : item.verifier_verdict === 'rejected' ? '证据冲突' : '需教师审核'}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button size="sm" onClick={() => void review(item, 'accept')}>
                {item.demonstrated_level === 4 ? '教师确认 L4' : '接受'}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void review(item, 'reject')}>退回</Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {reviews.length === 0 && (
        <Card size="sm"><CardContent className="text-sm text-muted-foreground">没有待审核评价。</CardContent></Card>
      )}
    </div>
  )
}
