import { ChartBarLineIcon, CheckmarkCircle02Icon, Task01Icon, UserGroupIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, Pie, PieChart, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Progress, ProgressLabel } from '@/components/ui/progress'
import type { LearnerLearningOverview, LearningOverview, TeacherLearningOverview } from '../contracts'
import { ASSISTANCE_LABELS, statusLabel } from '../components/learningDisplay'

const countChartConfig = {
  count: { label: '数量', color: 'var(--chart-1)' },
} satisfies ChartConfig

const coverageChartConfig = {
  covered: { label: '已有证据', color: 'var(--chart-1)' },
  remaining: { label: '尚无证据', color: 'var(--muted)' },
} satisfies ChartConfig

const masteryChartConfig = {
  level0: { label: '掌握等级 0', color: 'var(--chart-1)' },
  level1: { label: '掌握等级 1', color: 'var(--chart-2)' },
  level2: { label: '掌握等级 2', color: 'var(--chart-3)' },
  level3: { label: '掌握等级 3', color: 'var(--chart-4)' },
  level4: { label: '掌握等级 4', color: 'var(--chart-5)' },
} satisfies ChartConfig

const ATTENTION_REASON_LABELS: Record<string, string> = {
  due_review: '有到期复习',
  due_reviews: '有到期复习',
  pending_review: '有待审核评价',
  pending_reviews: '有待审核评价',
  needs_review: '需要复核',
  no_evidence: '近期没有学习证据',
  paused_mission: '有暂停的学习任务',
  paused_missions: '有暂停的学习任务',
}

function attentionReasonLabel(reason: string): string {
  if (/\p{Script=Han}/u.test(reason)) return reason
  return ATTENTION_REASON_LABELS[reason.toLowerCase()] ?? '存在待处理学习事项'
}

function OverviewStat({ label, value, icon }: {
  label: string
  value: number
  icon: typeof Task01Icon
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 font-heading text-3xl font-medium tabular-nums">{value}</p>
        </div>
        <span className="grid size-9 shrink-0 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4" />
        </span>
      </CardContent>
    </Card>
  )
}

function CountBarChart({ title, description, data, nameKey }: {
  title: string
  description: string
  data: Array<Record<string, string | number>>
  nameKey: string
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <ChartContainer config={countChartConfig} className="h-56 w-full aspect-auto">
            <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey={nameKey} tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[8, 8, 2, 2]} />
            </BarChart>
          </ChartContainer>
        ) : <ChartEmpty title="暂无分布数据" />}
      </CardContent>
    </Card>
  )
}

function ChartEmpty({ title }: { title: string }) {
  return (
    <Empty className="min-h-52 border-0 p-4">
      <EmptyHeader>
        <EmptyMedia variant="icon"><HugeiconsIcon icon={ChartBarLineIcon} strokeWidth={2} /></EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>有真实学习记录后，这里会自动汇总。</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function DueReviewTimeline({ overview }: { overview: LearnerLearningOverview }) {
  const reviews = [...overview.dueReviews].sort(
    (first, second) => new Date(first.nextReviewAt).getTime() - new Date(second.nextReviewAt).getTime(),
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle>到期复习时间线</CardTitle>
        <CardDescription>时间来自每个学习目标的下一次复习安排</CardDescription>
      </CardHeader>
      <CardContent>
        {reviews.length > 0 ? (
          <ol className="space-y-1">
            {reviews.map((review, index) => (
              <li key={review.knowledgeUnitId} className="relative grid grid-cols-[auto_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
                <div className="flex flex-col items-center">
                  <span className="mt-1.5 size-2.5 rounded-full bg-primary" />
                  {index < reviews.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
                </div>
                <div className="min-w-0">
                  <p className="font-medium">{review.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <time dateTime={review.nextReviewAt}>{new Date(review.nextReviewAt).toLocaleString('zh-CN')}</time>
                    {' · '}掌握等级 {review.level} · {statusLabel(review.status)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">当前没有到期复习。</p>
        )}
      </CardContent>
    </Card>
  )
}

function LearnerOverview({ overview }: { overview: LearnerLearningOverview }) {
  const mastery = overview.masteryDistribution.map((item) => ({ ...item, label: `掌握等级 ${item.level}` }))
  const assistance = overview.assistanceDistribution.map((item) => ({
    count: item.count,
    label: ASSISTANCE_LABELS[item.assistance] ?? '其他完成方式',
  }))
  const trend = overview.attemptTrend.map((item) => ({
    ...item,
    label: new Date(`${item.date}T00:00:00`).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
  }))

  return (
    <div className="space-y-6">
      <div className="grid gap-4 @min-[38rem]/learning-grid:grid-cols-2 @min-[64rem]/learning-grid:grid-cols-4">
        <OverviewStat label="到期复习" value={overview.summary.dueReviews} icon={Task01Icon} />
        <OverviewStat label="已验证目标" value={overview.summary.verifiedObjectives} icon={CheckmarkCircle02Icon} />
        <OverviewStat label="进行中任务" value={overview.summary.activeMissions} icon={Task01Icon} />
        <OverviewStat label="证据尝试" value={overview.summary.evidenceAttempts} icon={ChartBarLineIcon} />
      </div>
      <div className="grid gap-6 @min-[52rem]/learning-grid:grid-cols-2">
        <CountBarChart title="掌握等级分布" description="按已记录的掌握状态汇总" data={mastery} nameKey="label" />
        <CountBarChart title="完成方式分布" description="独立完成、使用提示与引导下完成的真实证据次数" data={assistance} nameKey="label" />
      </div>
      <div className="grid gap-6 @min-[52rem]/learning-grid:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>近 {overview.windowDays} 天证据尝试</CardTitle><CardDescription>仅统计实际提交的学习证据</CardDescription></CardHeader>
          <CardContent>
            {trend.length > 0 ? (
              <ChartContainer config={countChartConfig} className="h-56 w-full aspect-auto">
                <LineChart accessibilityLayer data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Line dataKey="count" type="monotone" stroke="var(--color-count)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ChartContainer>
            ) : <ChartEmpty title="这段时间还没有证据尝试" />}
          </CardContent>
        </Card>
        <DueReviewTimeline overview={overview} />
      </div>
      <Card>
        <CardHeader><CardTitle>学习计划进展</CardTitle><CardDescription>进度来自任务中已完成的步骤</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          {overview.missionProgress.map((mission) => {
            const value = mission.totalSteps > 0 ? mission.completedSteps / mission.totalSteps * 100 : 0
            return (
              <div key={mission.missionId} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{mission.goal}</p>
                  <span className="text-xs text-muted-foreground">{statusLabel(mission.status)} · {mission.completedSteps}/{mission.totalSteps} 步</span>
                </div>
                <Progress value={value} aria-label={`${mission.goal} 已完成 ${mission.completedSteps}/${mission.totalSteps} 步`}>
                  <ProgressLabel className="sr-only">{mission.goal}</ProgressLabel>
                </Progress>
              </div>
            )
          })}
          {overview.missionProgress.length === 0 && <p className="text-sm text-muted-foreground">还没有持续学习任务。</p>}
        </CardContent>
      </Card>
    </div>
  )
}

function TeacherOverview({ overview }: { overview: TeacherLearningOverview }) {
  const missions = overview.missionDistribution.map((item) => ({ count: item.count, label: statusLabel(item.status) }))
  const evaluations = overview.evaluationDistribution.map((item) => ({ count: item.count, label: statusLabel(item.status) }))
  const coverage = [
    { key: 'covered', label: '已有证据', count: overview.summary.learnersWithEvidence, fill: 'var(--color-covered)' },
    {
      key: 'remaining',
      label: '尚无证据',
      count: Math.max(overview.summary.learnerCount - overview.summary.learnersWithEvidence, 0),
      fill: 'var(--color-remaining)',
    },
  ]
  const mastery = [{
    label: '课程',
    ...Object.fromEntries(overview.masteryDistribution.map((item) => [`level${item.level}`, item.count])),
  }]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 @min-[38rem]/learning-grid:grid-cols-2 @min-[68rem]/learning-grid:grid-cols-5">
        <OverviewStat label="学习者" value={overview.summary.learnerCount} icon={UserGroupIcon} />
        <OverviewStat label="待审核" value={overview.summary.pendingReviews} icon={Task01Icon} />
        <OverviewStat label="证据尝试" value={overview.summary.attempts} icon={ChartBarLineIcon} />
        <OverviewStat label="有证据的学习者" value={overview.summary.learnersWithEvidence} icon={CheckmarkCircle02Icon} />
        <OverviewStat label="到期复习" value={overview.summary.dueReviews} icon={Task01Icon} />
      </div>
      <div className="grid gap-6 @min-[52rem]/learning-grid:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>证据覆盖</CardTitle><CardDescription>已有证据与尚无证据的在课学习者人数</CardDescription></CardHeader>
          <CardContent className="grid items-center gap-4 @min-[34rem]/learning-grid:grid-cols-[minmax(0,1fr)_auto]">
            <ChartContainer config={coverageChartConfig} className="mx-auto h-52 w-full max-w-64 aspect-square">
              <PieChart accessibilityLayer>
                <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
                <Pie data={coverage} dataKey="count" nameKey="key" innerRadius={54} outerRadius={80} strokeWidth={4} />
                <ChartLegend content={<ChartLegendContent nameKey="key" />} />
              </PieChart>
            </ChartContainer>
            <div className="space-y-1 text-center @min-[34rem]/learning-grid:text-start">
              <p className="font-heading text-2xl font-medium tabular-nums">{overview.summary.learnersWithEvidence}/{overview.summary.learnerCount}</p>
              <p className="text-xs text-muted-foreground">名学习者已有学习证据</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>掌握等级结构</CardTitle><CardDescription>全课程学习状态按掌握等级 0–4 堆叠</CardDescription></CardHeader>
          <CardContent>
            <ChartContainer config={masteryChartConfig} className="h-52 w-full aspect-auto">
              <BarChart accessibilityLayer data={mastery} layout="vertical" margin={{ top: 24, right: 8, bottom: 24, left: 8 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" hide />
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <ChartLegend content={<ChartLegendContent />} />
                {Object.keys(masteryChartConfig).map((key, index) => (
                  <Bar key={key} dataKey={key} stackId="mastery" fill={`var(--color-${key})`} radius={index === 0 ? [8, 0, 0, 8] : index === 4 ? [0, 8, 8, 0] : 0} />
                ))}
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 @min-[52rem]/learning-grid:grid-cols-2">
        <CountBarChart title="学习任务" description="按当前任务状态汇总" data={missions} nameKey="label" />
        <CountBarChart title="评价结果" description={`近 ${overview.windowDays} 天的真实评价结果`} data={evaluations} nameKey="label" />
      </div>
      <Card>
        <CardHeader><CardTitle>需要关注</CardTitle><CardDescription>由到期复习、待审核与任务状态等现有记录生成</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {overview.attention.map((item) => (
            <div key={item.learnerId} className="rounded-2xl bg-muted p-3">
              <p className="font-medium">{item.displayName}</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.reasons.map(attentionReasonLabel).join(' · ')}</p>
            </div>
          ))}
          {overview.attention.length === 0 && <p className="text-sm text-muted-foreground">目前没有需要特别关注的学习者记录。</p>}
        </CardContent>
      </Card>
    </div>
  )
}

export function OverviewSection({ overview }: { overview: LearningOverview }) {
  return overview.perspective === 'teacher'
    ? <TeacherOverview overview={overview} />
    : <LearnerOverview overview={overview} />
}
