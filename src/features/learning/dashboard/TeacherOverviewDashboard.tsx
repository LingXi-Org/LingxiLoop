import { CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight, ClipboardCheck, Users } from 'lucide-react'
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
import { Progress } from '@/components/ui/progress'
import { statusLabel } from '../components/learningDisplay'
import type {
  LearningActivity,
  LearningObjective,
  LearningReview,
  LearningSpace,
  TeacherLearningOverview,
} from '../contracts'
import { LearningGrowthVine } from './LearningGrowthVine'
import { TeacherAttention, TeacherContentChart, TeacherLearningInsights } from './TeacherDashboardSummary'
import { TeacherLearnersSection } from './TeacherLearnersSection'
import {
  type TeacherDetailView,
  TeacherLearningDetailDialog,
} from './TeacherLearningDetailDialog'
import { OverviewBarChart, OverviewChartCard, OverviewDonutChart } from './OverviewChartCard'
import { useTeacherOverviewData } from './useTeacherOverviewData'

const REVIEW_PREVIEW_LIMIT = 5
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
  const [detail, setDetail] = useState<string | null>(null)

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

  const { summary } = data.overview
  const coverage = summary.learnerCount ? Math.round(summary.learnersWithEvidence / summary.learnerCount * 100) + '%' : '—'
  return (
    <div className="space-y-4 @min-[48rem]/learning-grid:space-y-6" data-testid="teacher-overview-dashboard" aria-busy={loading}>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="grid gap-4 @min-[48rem]/learning-grid:grid-cols-12">
        <OverviewChartCard
          title="评价审核" value={summary.pendingReviews + ' 项待审核'} description={'近 ' + data.overview.windowDays + ' 天评价分布 · 点击处理审核'}
          className="@min-[48rem]/learning-grid:col-span-5"
          open={detail === 'reviews'} onOpenChange={(open) => setDetail(open ? 'reviews' : null)}
          chart={<OverviewDonutChart value={String(data.overview.evaluationDistribution.reduce((total, item) => total + item.count, 0))} data={data.overview.evaluationDistribution.map((item) => ({ label: statusLabel(item.status), count: item.count }))} />}
        >
          <div className="grid items-start gap-4 @min-[48rem]/learning-grid:grid-cols-2">
            <ReviewQueue canReview={space.canReview} reviews={data.reviews} onOpenReview={(review) => setDetailView({ kind: 'review', review })} />
            <TeacherAttention overview={data.overview} onOpenLearner={space.canReview ? (learnerId) => setDetailView({ kind: 'learner', learnerId }) : undefined} onOpenRoster={space.canReview ? () => setDetail('learners') : undefined} />
          </div>
        </OverviewChartCard>
        <OverviewChartCard
          title="课程学生" value={summary.learnerCount + ' 名学生'} description={summary.learnersWithEvidence + ' 人已有学习证据 · 点击查看学生进展'}
          className="@min-[48rem]/learning-grid:col-span-7"
          open={detail === 'learners'} onOpenChange={(open) => setDetail(open ? 'learners' : null)}
          chart={<OverviewDonutChart value={coverage} data={[{ label: '已有证据', count: summary.learnersWithEvidence }, { label: '尚无证据', count: Math.max(summary.learnerCount - summary.learnersWithEvidence, 0) }]} />}
        >
          {space.canReview ? (
            <TeacherLearnersSection projectId={space.projectId} refreshToken={revision} onOpenLearner={(learnerId) => setDetailView({ kind: 'learner', learnerId })} />
          ) : <Alert><AlertDescription>当前课程状态下不能查看学习者审核资料。</AlertDescription></Alert>}
        </OverviewChartCard>
        <OverviewChartCard
          title="学情分析" value={summary.attempts + ' 次学习提交'} description={'近 ' + data.overview.windowDays + ' 天 · 查看目标掌握、任务与评价分布'}
          className="@min-[48rem]/learning-grid:col-span-7"
          open={detail === 'analysis'} onOpenChange={(open) => setDetail(open ? 'analysis' : null)}
          chart={<OverviewBarChart layout="vertical" data={data.overview.masteryDistribution.map((item) => ({ label: '等级 ' + item.level, count: item.count }))} />}
        >
          <TeacherLearningInsights overview={data.overview} />
        </OverviewChartCard>
        <OverviewChartCard
          title="课程内容" value={data.objectives.length + ' 个目标 · ' + data.activities.length + ' 项活动'} description="查看课程目标与活动的发布情况"
          className="@min-[48rem]/learning-grid:col-span-5"
          open={detail === 'content'} onOpenChange={(open) => setDetail(open ? 'content' : null)}
          chart={<TeacherContentChart objectives={data.objectives} activities={data.activities} />}
        >
          <CourseContentStatus objectives={data.objectives} activities={data.activities} />
        </OverviewChartCard>
      </div>
      <div className="grid items-start gap-4 @min-[64rem]/learning-grid:grid-cols-12">
        <div className="min-w-0 @min-[64rem]/learning-grid:col-span-8"><LearningGrowthVine key={space.projectId} projectId={space.projectId} /></div>
        <div className="h-full min-w-0 @min-[64rem]/learning-grid:col-span-4"><TeachingPriorities overview={data.overview} canReview={space.canReview} onOpenSection={setDetail} /></div>
      </div>
      <TeacherLearningDetailDialog
        projectId={space.projectId}
        canReview={space.canReview}
        view={detailView}
        onViewChange={setDetailView}
        onReviewed={async () => {
          await refresh()
          window.dispatchEvent(new Event('lingxiloop:growth-updated'))
        }}
      />
    </div>
  )
}

function TeachingPriorities({ overview, canReview, onOpenSection }: {
  overview: TeacherLearningOverview
  canReview: boolean
  onOpenSection(section: string): void
}) {
  const { summary } = overview
  const coverage = summary.learnerCount ? summary.learnersWithEvidence / summary.learnerCount * 100 : 0
  return (
    <Card className="h-full">
      <CardHeader><CardTitle><h3>教学重点</h3></CardTitle><CardDescription>先处理反馈，再跟进学习进展</CardDescription></CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <Button type="button" variant="ghost" disabled={!canReview} className="h-auto justify-start gap-3 rounded-xl border p-3 text-start whitespace-normal" onClick={() => onOpenSection('reviews')}>
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><ClipboardCheck aria-hidden="true" className="size-4" /></span>
          <span className="min-w-0 flex-1"><span className="block font-medium">审核学习评价</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{summary.pendingReviews} 项等待处理</span></span>
          <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
        </Button>
        <Button type="button" variant="ghost" disabled={!canReview} className="h-auto justify-start gap-3 rounded-xl border p-3 text-start whitespace-normal" onClick={() => onOpenSection('learners')}>
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Users aria-hidden="true" className="size-4" /></span>
          <span className="min-w-0 flex-1"><span className="block font-medium">跟进学生进展</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{summary.dueReviews} 项复习已到期</span></span>
          <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
        </Button>
        <div className="mt-auto space-y-2 pt-3">
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>已提交学习证据</span><span className="tabular-nums">{summary.learnersWithEvidence} / {summary.learnerCount} 人</span></div>
          <Progress value={coverage} aria-label="已提交学习证据的学生占比" className="[&_[data-slot=progress-track]]:h-1.5" />
          {!canReview && <p className="text-xs text-muted-foreground">当前课程暂不支持审核与学生详情查看。</p>}
        </div>
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
      <CardContent className="grid gap-6 @min-[48rem]/learning-grid:grid-cols-2">
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
          <div key={item.status} className="rounded-xl bg-muted/50 p-3">
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
        <CardTitle><h3>待审核评价</h3></CardTitle>
        <CardAction><Badge variant="secondary">{reviews.length}</Badge></CardAction>
        <CardDescription>核对学习证据与评价标准，给出反馈</CardDescription>
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
                  <span className="block font-medium [overflow-wrap:anywhere]">
                    {review.learner_display_name} · {review.activity_title ?? '学习评价'}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    建议掌握等级 {review.demonstrated_level} · 置信度 {Math.round(review.confidence * 100)}%
                  </span>
                </span>
                <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
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
