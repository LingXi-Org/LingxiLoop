import {
  ChartBarLineIcon,
  CheckmarkCircle02Icon,
  Task01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Pie, PieChart, XAxis } from 'recharts'
import { Button } from '@/components/ui/button'
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { statusLabel } from '../components/learningDisplay'
import type { TeacherLearningOverview } from '../contracts'

const countChartConfig = {
  count: { label: '数量', color: 'var(--chart-1)' },
} satisfies ChartConfig

const coverageChartConfig = {
  covered: { label: '已有证据', color: 'var(--chart-1)' },
  remaining: { label: '尚无证据', color: 'var(--muted)' },
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

function ChartEmpty({ title }: { title: string }) {
  return (
    <Empty className="min-h-52 border-0 p-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={ChartBarLineIcon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>有真实学习记录后，这里会自动汇总。</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function CountBarChart({
  title,
  description,
  data,
}: {
  title: string
  description: string
  data: Array<{ count: number; label: string }>
}) {
  return (
    <Card className="@min-[64rem]/learning-grid:col-span-6">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <ChartContainer config={countChartConfig} className="h-56 w-full aspect-auto">
            <BarChart
              accessibilityLayer
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[8, 8, 2, 2]} />
            </BarChart>
          </ChartContainer>
        ) : (
          <ChartEmpty title="暂无分布数据" />
        )}
      </CardContent>
    </Card>
  )
}

export function TeacherDashboardSummary({
  overview,
  onOpenLearner,
  priority,
}: {
  overview: TeacherLearningOverview
  onOpenLearner?: (learnerId: string) => void
  priority?: ReactNode
}) {
  const coveragePercent = overview.summary.learnerCount
    ? Math.round((overview.summary.learnersWithEvidence / overview.summary.learnerCount) * 100)
    : 0
  const metrics = [
    {
      label: '学习者',
      value: overview.summary.learnerCount,
      detail: `${overview.summary.learnersWithEvidence} 人已有证据`,
      badge: '课程规模',
      icon: UserGroupIcon,
    },
    {
      label: '证据尝试',
      value: overview.summary.attempts,
      detail: `近 ${overview.windowDays} 天真实提交`,
      badge: `${overview.windowDays} 天`,
      icon: ChartBarLineIcon,
    },
    {
      label: '待审核',
      value: overview.summary.pendingReviews,
      detail: `${overview.summary.dueReviews} 项复习已到期`,
      badge: '需处理',
      icon: Task01Icon,
    },
    {
      label: '证据覆盖',
      value: `${coveragePercent}%`,
      detail: `${overview.summary.learnersWithEvidence}/${overview.summary.learnerCount} 名学习者`,
      badge: '学习覆盖',
      icon: CheckmarkCircle02Icon,
    },
  ]
  const coverage = [
    {
      key: 'covered',
      label: '已有证据',
      count: overview.summary.learnersWithEvidence,
      fill: 'var(--color-covered)',
    },
    {
      key: 'remaining',
      label: '尚无证据',
      count: Math.max(
        overview.summary.learnerCount - overview.summary.learnersWithEvidence,
        0,
      ),
      fill: 'var(--color-remaining)',
    },
  ]
  const mastery = overview.masteryDistribution.map((item) => ({
    count: item.count,
    label: `等级 ${item.level}`,
  }))
  const missions = overview.missionDistribution.map((item) => ({
    count: item.count,
    label: statusLabel(item.status),
  }))
  const evaluations = overview.evaluationDistribution.map((item) => ({
    count: item.count,
    label: statusLabel(item.status),
  }))

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
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <span className="font-medium">{metric.badge}</span>
            <span className="text-muted-foreground">{metric.detail}</span>
          </CardFooter>
        </Card>
      ))}

      <Card className="@min-[64rem]/learning-grid:col-span-8">
        <CardHeader>
          <CardTitle>掌握等级结构</CardTitle>
          <CardDescription>全课程学习状态按掌握等级 0–4 汇总</CardDescription>
        </CardHeader>
        <CardContent>
          {mastery.length > 0 ? (
            <ChartContainer
              config={countChartConfig}
              className="h-64 w-full aspect-auto @min-[48rem]/learning-grid:h-72"
            >
              <BarChart
                accessibilityLayer
                data={mastery}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[8, 8, 2, 2]} />
              </BarChart>
            </ChartContainer>
          ) : (
            <ChartEmpty title="还没有掌握状态" />
          )}
        </CardContent>
      </Card>

      <Card className="@min-[64rem]/learning-grid:col-span-4">
        <CardHeader>
          <CardTitle>证据覆盖</CardTitle>
          <CardDescription>在课学习者的证据覆盖情况</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={coverageChartConfig}
            className="mx-auto h-64 w-full max-w-72 aspect-square @min-[48rem]/learning-grid:h-72"
          >
            <PieChart accessibilityLayer>
              <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
              <Pie
                data={coverage}
                dataKey="count"
                nameKey="key"
                innerRadius={58}
                outerRadius={88}
                strokeWidth={4}
              />
              <ChartLegend content={<ChartLegendContent nameKey="key" />} />
            </PieChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="@min-[64rem]/learning-grid:col-span-6">
        <CardHeader>
          <CardTitle>需要关注</CardTitle>
          <CardDescription>由到期复习、待审核与任务状态等现有记录生成</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {overview.attention.map((item) => {
            const content = (
              <>
                <span className="block font-medium">{item.displayName}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {item.reasons.map(attentionReasonLabel).join(' · ')}
                </span>
              </>
            )
            return onOpenLearner ? (
              <Button
                key={item.learnerId}
                type="button"
                variant="ghost"
                className="h-auto w-full justify-start rounded-2xl bg-muted p-3 text-start whitespace-normal"
                onClick={() => onOpenLearner(item.learnerId)}
              >
                <span className="min-w-0">{content}</span>
              </Button>
            ) : (
              <div key={item.learnerId} className="rounded-2xl bg-muted p-3">
                {content}
              </div>
            )
          })}
          {overview.attention.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              目前没有需要特别关注的学习者记录。
            </p>
          )}
        </CardContent>
      </Card>

      <div className="@min-[64rem]/learning-grid:col-span-6">{priority}</div>

      <CountBarChart
        title="学习任务"
        description="按当前任务状态汇总"
        data={missions}
      />
      <CountBarChart
        title="评价结果"
        description={`近 ${overview.windowDays} 天的真实评价结果`}
        data={evaluations}
      />
    </>
  )
}
