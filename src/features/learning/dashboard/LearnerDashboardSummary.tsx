import {
  ChartBarLineIcon,
  CheckmarkCircle02Icon,
  GoalIcon,
  Task01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { ASSISTANCE_LABELS } from '../components/learningDisplay'
import type { LearnerLearningOverview } from '../contracts'
import type { LearnerDashboardModel } from './learnerDashboardModel'

const trendConfig = {
  attempts: { label: '证据尝试', color: 'var(--chart-2)' },
} satisfies ChartConfig

const masteryConfig = {
  count: { label: '目标数', color: 'var(--primary)' },
} satisfies ChartConfig

const assistanceConfig = {
  NONE: { label: '独立完成', color: 'var(--chart-1)' },
  HINT: { label: '使用提示', color: 'var(--chart-2)' },
  GUIDED: { label: '引导下完成', color: 'var(--chart-4)' },
} satisfies ChartConfig

export function formatLearningDateTime(value: string | undefined | null): string {
  if (!value) return '尚未安排时间'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN') : '时间待同步'
}

function ChartEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-44 place-items-center rounded-2xl bg-muted/60 p-4 text-center text-sm text-muted-foreground @min-[48rem]/learning-grid:min-h-52 @min-[48rem]/learning-grid:rounded-3xl @min-[48rem]/learning-grid:p-6">
      {children}
    </div>
  )
}

export function LearnerDashboardSummary({
  overview,
  model,
  missionLabel,
}: {
  overview: LearnerLearningOverview | null
  model: LearnerDashboardModel
  missionLabel: string
}) {
  const trend =
    overview?.attemptTrend.map((item) => ({
      attempts: item.count,
      label: new Date(`${item.date}T00:00:00`).toLocaleDateString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
      }),
    })) ?? []
  const mastery =
    overview?.masteryDistribution.map((item) => ({
      count: item.count,
      label: `等级 ${item.level}`,
    })) ?? []
  const assistance =
    overview?.assistanceDistribution.map((item) => ({
      key: item.assistance,
      count: item.count,
      label: ASSISTANCE_LABELS[item.assistance] ?? '其他方式',
      fill: `var(--color-${item.assistance})`,
    })) ?? []
  const readyActivities = model.activities.filter((item) => item.stage === 'ready')
  const activeMission = model.missions.find(
    (item) => item.mission.status !== 'COMPLETED' && item.mission.status !== 'CANCELLED',
  )
  const nextMissionStep = activeMission?.steps.find(
    ({ step }) => step.status !== 'COMPLETED' && step.status !== 'CANCELLED',
  )
  const metrics = [
    {
      label: '待复习',
      value: overview?.summary.dueReviews ?? 0,
      detail: '来自真实复习安排',
      icon: Task01Icon,
    },
    {
      label: '已验证目标',
      value: overview?.summary.verifiedObjectives ?? 0,
      detail: '已有可验证掌握证据',
      icon: CheckmarkCircle02Icon,
    },
    {
      label: `进行中${missionLabel}`,
      value: overview?.summary.activeMissions ?? 0,
      detail: '按未完成任务汇总',
      icon: GoalIcon,
    },
    {
      label: '证据尝试',
      value: overview?.summary.evidenceAttempts ?? 0,
      detail: `近 ${overview?.windowDays ?? 30} 天真实提交`,
      icon: ChartBarLineIcon,
    },
  ]

  return (
    <>
      {metrics.map((metric) => (
        <Card
          key={metric.label}
          className="@container/card bg-linear-to-t from-primary/5 to-card shadow-xs @min-[42rem]/learning-grid:col-span-6 @min-[64rem]/learning-grid:col-span-3"
        >
          <CardHeader>
            <CardDescription>{metric.label}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {metric.value}
            </CardTitle>
            <CardAction>
              <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary">
                <HugeiconsIcon icon={metric.icon} strokeWidth={2} className="size-4" />
              </span>
            </CardAction>
          </CardHeader>
          <CardFooter className="text-sm text-muted-foreground">{metric.detail}</CardFooter>
        </Card>
      ))}

      <Card className="@min-[64rem]/learning-grid:col-span-8">
        <CardHeader>
          <CardTitle>证据节奏</CardTitle>
          <CardDescription>近 {overview?.windowDays ?? 30} 天实际提交的学习尝试</CardDescription>
        </CardHeader>
        <CardContent>
          {trend.length > 0 ? (
            <ChartContainer config={trendConfig} className="h-48 w-full aspect-auto @min-[48rem]/learning-grid:h-56">
              <AreaChart accessibilityLayer data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="learner-evidence-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-attempts)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--color-attempts)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Area dataKey="attempts" type="monotone" fill="url(#learner-evidence-fill)" stroke="var(--color-attempts)" strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          ) : <ChartEmpty>产生学习证据后，这里会显示趋势。</ChartEmpty>}
        </CardContent>
      </Card>

      <Card className="bg-muted/40 @min-[64rem]/learning-grid:col-span-4">
        <CardHeader>
          <CardTitle>现在做什么</CardTitle>
          <CardDescription>来自真实截止时间、复习安排和任务步骤</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {overview?.dueReviews.slice(0, 2).map((review) => (
            <div
              key={review.knowledgeUnitId}
              className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-foreground/5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge>复习</Badge>
                <span className="text-xs text-muted-foreground">
                  {formatLearningDateTime(review.nextReviewAt)}
                </span>
              </div>
              <p className="mt-2 font-medium">{review.title}</p>
            </div>
          ))}
          {readyActivities.slice(0, 1).map((item) => (
            <div
              key={item.activity.id}
              className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-foreground/5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">活动</Badge>
                <span className="text-xs text-muted-foreground">
                  {formatLearningDateTime(item.activity.dueAt)}
                </span>
              </div>
              <p className="mt-2 font-medium">{item.activity.title}</p>
            </div>
          ))}
          {nextMissionStep && activeMission && (
            <div className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-foreground/5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">下一步</Badge>
                <span className="text-xs text-muted-foreground">{activeMission.mission.goal}</span>
              </div>
              <p className="mt-2 font-medium">{nextMissionStep.step.description}</p>
            </div>
          )}
          {!overview?.dueReviews.length && readyActivities.length === 0 && !nextMissionStep && (
            <p className="rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">
              当前没有待处理的学习事项。
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="@min-[64rem]/learning-grid:col-span-6">
        <CardHeader><CardTitle>掌握结构</CardTitle><CardDescription>目标在等级 0–4 的真实分布</CardDescription></CardHeader>
        <CardContent>
          {mastery.length > 0 ? (
            <ChartContainer config={masteryConfig} className="h-48 w-full aspect-auto @min-[48rem]/learning-grid:h-56">
              <BarChart accessibilityLayer data={mastery} layout="vertical" margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={48} tickLine={false} axisLine={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ChartContainer>
          ) : <ChartEmpty>还没有掌握状态。</ChartEmpty>}
        </CardContent>
      </Card>

      <Card className="@min-[64rem]/learning-grid:col-span-6">
        <CardHeader><CardTitle>完成方式</CardTitle><CardDescription>独立、提示与引导下的证据</CardDescription></CardHeader>
        <CardContent>
          {assistance.some((item) => item.count > 0) ? (
            <ChartContainer config={assistanceConfig} className="h-48 w-full aspect-auto @min-[48rem]/learning-grid:h-56">
              <PieChart accessibilityLayer>
                <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
                <Pie data={assistance} dataKey="count" nameKey="key" innerRadius={42} outerRadius={72} strokeWidth={4} />
                <ChartLegend content={<ChartLegendContent nameKey="key" className="flex-wrap gap-x-3 gap-y-1" />} />
              </PieChart>
            </ChartContainer>
          ) : <ChartEmpty>还没有完成方式记录。</ChartEmpty>}
        </CardContent>
      </Card>
    </>
  )
}
