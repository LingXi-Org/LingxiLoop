import { ArrowRight, BookOpen, CheckCheck, Clock3, ListTodo } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { ASSISTANCE_LABELS } from '../components/learningDisplay'
import type { LearnerLearningOverview } from '../contracts'
import type { LearnerDashboardModel } from './learnerDashboardModel'

const trendConfig = { attempts: { label: '学习提交', color: 'var(--chart-2)' } } satisfies ChartConfig
const masteryConfig = { count: { label: '目标数', color: 'var(--chart-1)' } } satisfies ChartConfig

export type LearnerOverviewSection = 'activities' | 'missions' | 'objectives' | 'evidence'

export function formatLearningDateTime(value: string | undefined | null): string {
  if (!value) return '未设截止时间'
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '时间待同步'
}

export function LearnerNextSteps({ overview, model, canSubmit, onOpenSection }: {
  overview: LearnerLearningOverview | null
  model: LearnerDashboardModel
  canSubmit: boolean
  onOpenSection(section: LearnerOverviewSection): void
}) {
  const review = overview?.dueReviews[0]
  const activity = canSubmit ? model.activities.find((item) => item.stage === 'ready') : undefined
  const mission = model.missions.find((item) => item.mission.status === 'ACTIVE' || item.mission.status === 'PLANNING')
  const step = mission?.steps.find((item) => item.step.status === 'OPEN' || item.step.status === 'IN_PROGRESS')
  const actions = [
    ...(review ? [{ key: 'objectives' as const, label: '待复习', title: review.title, detail: `复习安排 · ${formatLearningDateTime(review.nextReviewAt)}`, icon: <Clock3 /> }] : []),
    ...(activity ? [{ key: 'activities' as const, label: '待完成', title: activity.activity.title, detail: activity.activity.dueAt ? `截止 · ${formatLearningDateTime(activity.activity.dueAt)}` : '按自己的节奏完成', icon: <BookOpen /> }] : []),
    ...(mission && step ? [{ key: 'missions' as const, label: '下一步', title: step.step.description, detail: `${mission.completedSteps}/${mission.totalSteps} 步已完成 · ${mission.mission.goal}`, icon: <ListTodo /> }] : []),
  ]
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle><h3>接下来学什么</h3></CardTitle>
        <CardDescription>聚焦当前最值得推进的一步</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {actions.length > 0 ? actions.map((action) => (
          <Button key={action.key} type="button" variant="ghost" aria-label={`${action.label}：${action.title}，${action.detail}`} className="h-auto w-full items-start justify-start gap-3 rounded-xl border p-3 text-start whitespace-normal" onClick={() => onOpenSection(action.key)}>
            <span aria-hidden="true" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4">{action.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium leading-5 [overflow-wrap:anywhere]">{action.title}</span>
              <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground [overflow-wrap:anywhere]">{action.detail}</span>
            </span>
            <ArrowRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />
          </Button>
        )) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl bg-muted/40 p-6 text-center">
            <CheckCheck aria-hidden="true" className="size-7 text-primary" />
            <p className="font-medium">{overview ? '按自己的节奏继续' : '学习安排待同步'}</p>
            <p className="text-sm leading-6 text-muted-foreground">{overview ? '可以回顾学习记录，或在课程对话中探索新的问题。' : '概览加载后，这里会显示复习与学习安排。'}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenSection('evidence')}>回顾学习记录 <ArrowRight aria-hidden="true" /></Button>
          </div>
        )}
        {!canSubmit && <p className="mt-auto pt-2 text-xs leading-5 text-muted-foreground">当前课程为只读状态，可继续回顾目标与学习记录。</p>}
      </CardContent>
    </Card>
  )
}

export function LearnerAttemptChart({ overview }: { overview: LearnerLearningOverview | null }) {
  const data = overview?.attemptTrend.map((item) => ({ attempts: item.count, label: new Date(item.date + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) })) ?? []
  if (!data.some((item) => item.attempts > 0)) return <div className="grid min-h-44 place-content-center rounded-xl bg-muted/50 text-center text-sm text-muted-foreground">提交活动后查看学习节奏</div>
  return <ChartContainer config={trendConfig} className="h-44 w-full aspect-auto">
    <AreaChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 12, left: -24, bottom: 0 }}>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} />
      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
      <Area dataKey="attempts" type="monotone" fill="var(--color-attempts)" fillOpacity={0.15} stroke="var(--color-attempts)" strokeWidth={2} isAnimationActive={false} />
    </AreaChart>
  </ChartContainer>
}

export function LearnerLearningInsights({ overview }: { overview: LearnerLearningOverview | null }) {
  const trend = overview?.attemptTrend.map((item) => ({ attempts: item.count, label: new Date(`${item.date}T00:00:00`).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) })) ?? []
  const mastery = overview?.masteryDistribution.map((item) => ({ count: item.count, label: `等级 ${item.level}` })) ?? []
  const assistance = overview?.assistanceDistribution ?? []
  return (
    <div className="grid gap-5 @min-[48rem]/learning-grid:grid-cols-2">
      <Card className="@min-[48rem]/learning-grid:col-span-2">
        <CardHeader><CardTitle><h3>学习节奏</h3></CardTitle><CardDescription>{overview ? `近 ${overview.windowDays} 天的学习提交` : '统计暂不可用'}</CardDescription></CardHeader>
        <CardContent>
          {trend.some((item) => item.attempts > 0) ? (
            <ChartContainer config={trendConfig} className="h-56 w-full aspect-auto">
              <AreaChart accessibilityLayer data={trend} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area dataKey="attempts" type="monotone" fill="var(--color-attempts)" fillOpacity={0.12} stroke="var(--color-attempts)" strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ChartContainer>
          ) : <p className="grid min-h-40 place-items-center text-muted-foreground">提交活动后，在这里查看学习节奏。</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle><h3>目标掌握</h3></CardTitle><CardDescription>掌握等级 0–4 的目标分布</CardDescription></CardHeader>
        <CardContent>
          {mastery.some((item) => item.count > 0) ? (
            <ChartContainer config={masteryConfig} className="h-52 w-full aspect-auto">
              <BarChart accessibilityLayer data={mastery} layout="vertical" margin={{ right: 12 }}>
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" width={48} tickLine={false} axisLine={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />
              </BarChart>
            </ChartContainer>
          ) : <p className="grid min-h-40 place-items-center text-muted-foreground">有目标掌握记录后显示分布。</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle><h3>完成方式</h3></CardTitle><CardDescription>了解自己如何完成学习尝试</CardDescription></CardHeader>
        <CardContent>
          {assistance.some((item) => item.count > 0) ? <dl className="divide-y">{assistance.map((item) => (
            <div key={item.assistance} className="flex items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
              <dt className="text-sm">{ASSISTANCE_LABELS[item.assistance]}</dt><dd><Badge variant="secondary" className="tabular-nums">{item.count} 次</Badge></dd>
            </div>
          ))}</dl> : <p className="grid min-h-40 place-items-center text-muted-foreground">完成学习后显示记录。</p>}
        </CardContent>
      </Card>
    </div>
  )
}
