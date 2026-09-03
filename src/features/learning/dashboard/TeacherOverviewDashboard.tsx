import { CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { statusLabel } from '../components/learningDisplay'
import type {
  LearningActivity,
  LearningObjective,
  LearningReview,
  LearningSpace,
  TeacherLearningOverview,
} from '../contracts'
import { TeacherDashboardSummary } from './TeacherDashboardSummary'
import { TeacherLearnersSection } from './TeacherLearnersSection'
import {
  type TeacherDetailView,
  TeacherLearningDetailDialog,
} from './TeacherLearningDetailDialog'
import { useTeacherOverviewData } from './useTeacherOverviewData'

const REVIEW_PREVIEW_LIMIT = 8
const CONTENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
  CLOSED: '已关闭',
}

export function TeacherOverviewDashboard({ space }: { space: LearningSpace }) {
  const { data, loading, error, refresh, revision } = useTeacherOverviewData(
    space.projectId,
    space.canReview,
  )
  const [detailView, setDetailView] = useState<TeacherDetailView | null>(null)

  if (loading && !data) {
    return <ResourceSkeleton variant="cards" count={8} label="正在加载课程总览" />
  }
  if (!data) {
    return (
      <div className="grid min-h-64 place-items-center rounded-3xl border border-dashed p-6 text-center">
        <div>
          <p className="text-sm text-muted-foreground">{error || '课程总览暂时不可用。'}</p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => void refresh()}>
            重新加载
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="grid gap-3 @min-[48rem]/learning-grid:gap-6 @min-[64rem]/learning-grid:grid-cols-12"
      data-testid="teacher-overview-dashboard"
    >
      {error && (
        <Alert variant="destructive" className="@min-[64rem]/learning-grid:col-span-12">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <CoursePulse space={space} overview={data.overview} />
      <TeacherDashboardSummary
        overview={data.overview}
        onOpenLearner={
          space.canReview
            ? (learnerId) => setDetailView({ kind: 'learner', learnerId })
            : undefined
        }
        priority={
          <ReviewQueue
            canReview={space.canReview}
            reviews={data.reviews}
            onOpenReview={(review) => setDetailView({ kind: 'review', review })}
          />
        }
      />
      <CourseContentStatus objectives={data.objectives} activities={data.activities} />
      {space.canReview ? (
        <div className="@min-[64rem]/learning-grid:col-span-12">
          <TeacherLearnersSection
            projectId={space.projectId}
            refreshToken={revision}
            onOpenLearner={(learnerId) => setDetailView({ kind: 'learner', learnerId })}
          />
        </div>
      ) : (
        <Alert className="@min-[64rem]/learning-grid:col-span-12">
          <AlertDescription>当前课程状态下不能查看学习者审核资料。</AlertDescription>
        </Alert>
      )}
      <TeacherLearningDetailDialog
        projectId={space.projectId}
        canReview={space.canReview}
        view={detailView}
        onViewChange={setDetailView}
        onReviewed={refresh}
      />
    </div>
  )
}

function CoursePulse({
  space,
  overview,
}: {
  space: LearningSpace
  overview: TeacherLearningOverview
}) {
  return (
    <Card size="sm" className="@min-[64rem]/learning-grid:col-span-12">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">课程概况</Badge>
        </div>
        <CardTitle className="text-xl">{space.title}</CardTitle>
        <CardDescription className="max-w-3xl">{space.description || '暂无课程简介'}</CardDescription>
        <CardAction>
          <Badge variant="outline">{statusLabel(space.status)}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        近 {overview.windowDays} 天 · {overview.summary.attempts} 次证据尝试 ·{' '}
        {overview.summary.learnersWithEvidence}/{overview.summary.learnerCount} 名学习者已有证据
      </CardContent>
    </Card>
  )
}

function CourseContentStatus({
  objectives,
  activities,
}: {
  objectives: LearningObjective[]
  activities: LearningActivity[]
}) {
  const objectiveStatus = ['DRAFT', 'PUBLISHED', 'ARCHIVED'].map((status) => ({
    status,
    count: objectives.filter((objective) => objective.status === status).length,
  }))
  const activityStatus = ['DRAFT', 'PUBLISHED', 'CLOSED'].map((status) => ({
    status,
    count: activities.filter((activity) => activity.status === status).length,
  }))

  return (
    <Card className="@min-[64rem]/learning-grid:col-span-12">
      <CardHeader>
        <CardTitle>课程内容状态</CardTitle>
        <CardDescription>学习目标与课程活动的当前发布状态</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <StatusGroup title="学习目标" items={objectiveStatus} />
        <StatusGroup title="课程活动" items={activityStatus} />
      </CardContent>
    </Card>
  )
}

function StatusGroup({ title, items }: { title: string; items: Array<{ status: string; count: number }> }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">
          共 {items.reduce((total, item) => total + item.count, 0)} 项
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {items.map((item) => (
          <div key={item.status} className="rounded-2xl bg-muted p-3">
            <p className="text-xs text-muted-foreground">
              {CONTENT_STATUS_LABELS[item.status] ?? statusLabel(item.status)}
            </p>
            <p className="mt-1 font-heading text-xl font-medium tabular-nums">{item.count}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function ReviewQueue({
  canReview,
  reviews,
  onOpenReview,
}: {
  canReview: boolean
  reviews: LearningReview[]
  onOpenReview(review: LearningReview): void
}) {
  const [showAll, setShowAll] = useState(false)
  const visibleReviews = showAll ? reviews : reviews.slice(0, REVIEW_PREVIEW_LIMIT)

  return (
    <Card>
      <CardHeader>
        <CardTitle>待审核评价</CardTitle>
        <CardDescription>打开审核项后会加载对应尝试的原始证据与评价标准</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!canReview ? (
          <Alert>
            <AlertDescription>当前课程状态下不能查看或处理评价审核。</AlertDescription>
          </Alert>
        ) : reviews.length > 0 ? (
          <>
            {visibleReviews.map((review) => (
              <Button
                key={review.id}
                type="button"
                variant="ghost"
                className="h-auto w-full justify-start rounded-2xl bg-muted p-3 text-start whitespace-normal"
                onClick={() => onOpenReview(review)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {review.learner_display_name} · {review.activity_title ?? '学习评价'}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    建议掌握等级 {review.demonstrated_level} · 置信度 {Math.round(review.confidence * 100)}%
                  </span>
                </span>
                <Badge variant="outline">审核</Badge>
              </Button>
            ))}
            {reviews.length > REVIEW_PREVIEW_LIMIT && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => setShowAll((current) => !current)}
              >
                {showAll ? '收起' : `显示其余 ${reviews.length - REVIEW_PREVIEW_LIMIT} 条`}
              </Button>
            )}
          </>
        ) : (
          <Empty className="min-h-52 border-0 p-4">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>当前没有待审核评价</EmptyTitle>
              <EmptyDescription>新的评价进入审核队列后会显示在这里。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}
