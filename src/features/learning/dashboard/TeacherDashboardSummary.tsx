import { ArrowRight, CheckCheck } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { statusLabel } from '../components/learningDisplay'
import type { LearningActivity, LearningObjective, TeacherLearningOverview } from '../contracts'

const countChartConfig = { count: { label: '数量', color: 'var(--chart-1)' } } satisfies ChartConfig
const ATTENTION_REASON_LABELS: Record<string, string> = {
  due_review: '有到期复习', due_reviews: '有到期复习',
  pending_review: '有待审核评价', pending_reviews: '有待审核评价',
  needs_review: '需要复核', no_evidence: '近期没有学习证据',
  paused_mission: '有暂停的学习任务', paused_missions: '有暂停的学习任务',
}

function attentionReasonLabel(reason: string): string {
  if (/\p{Script=Han}/u.test(reason)) return reason
  return ATTENTION_REASON_LABELS[reason.toLowerCase()] ?? '存在待处理学习事项'
}

export function TeacherAttention({ overview, onOpenLearner, onOpenRoster }: {
  overview: TeacherLearningOverview
  onOpenLearner?: (learnerId: string) => void
  onOpenRoster?: () => void
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle><h3>需要关注的学生</h3></CardTitle>
        <CardDescription>及时跟进复习、评价与暂停的任务</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {overview.attention.slice(0, 5).map((item) => {
          const content = <>
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-sm font-medium">{item.displayName.slice(0, 1)}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium [overflow-wrap:anywhere]">{item.displayName}</span>
              <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">{item.reasons.map(attentionReasonLabel).join(' · ')}</span>
            </span>
          </>
          return onOpenLearner ? (
            <Button key={item.learnerId} type="button" variant="ghost" className="h-auto w-full justify-start gap-3 rounded-xl p-3 text-start whitespace-normal" onClick={() => onOpenLearner(item.learnerId)}>
              {content}<ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            </Button>
          ) : <div key={item.learnerId} className="flex items-start gap-3 p-3">{content}</div>
        })}
        {overview.attention.length === 0 && <div className="grid min-h-40 place-content-center gap-2 text-center"><CheckCheck aria-hidden="true" className="mx-auto size-7 text-primary" /><p className="font-medium">暂无需要跟进的学生</p><p className="text-xs text-muted-foreground">新的关注事项会显示在这里。</p></div>}
        {onOpenRoster && <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={onOpenRoster}>查看全部学生 <ArrowRight aria-hidden="true" /></Button>}
      </CardContent>
    </Card>
  )
}

export function TeacherLearningInsights({ overview }: { overview: TeacherLearningOverview }) {
  const charts = [
    { title: '目标掌握分布', description: '全课程目标的掌握等级', data: overview.masteryDistribution.map((item) => ({ count: item.count, label: `等级 ${item.level}` })) },
    { title: '任务进展', description: '当前学习任务的状态', data: overview.missionDistribution.map((item) => ({ count: item.count, label: statusLabel(item.status) })) },
    { title: '评价结果', description: `近 ${overview.windowDays} 天的学习评价`, data: overview.evaluationDistribution.map((item) => ({ count: item.count, label: statusLabel(item.status) })) },
  ]
  return (
    <div className="grid gap-5 @min-[48rem]/learning-grid:grid-cols-2">
      {charts.map((chart, index) => (
        <Card key={chart.title} className={index === 0 ? '@min-[48rem]/learning-grid:col-span-2' : undefined}>
          <CardHeader><CardTitle><h3>{chart.title}</h3></CardTitle><CardDescription>{chart.description}</CardDescription></CardHeader>
          <CardContent>
            {chart.data.some((item) => item.count > 0) ? (
              <ChartContainer config={countChartConfig} className="h-56 w-full aspect-auto">
                <BarChart accessibilityLayer data={chart.data} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
                </BarChart>
              </ChartContainer>
            ) : <p className="grid min-h-40 place-items-center text-muted-foreground">有学习记录后，在这里查看分布。</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function TeacherContentChart({ objectives, activities }: {
  objectives: LearningObjective[]
  activities: LearningActivity[]
}) {
  const data = [
    { label: '学习目标', draft: objectives.filter((item) => item.status === 'DRAFT').length, published: objectives.filter((item) => item.status === 'PUBLISHED').length, closed: objectives.filter((item) => item.status === 'ARCHIVED').length },
    { label: '课程活动', draft: activities.filter((item) => item.status === 'DRAFT').length, published: activities.filter((item) => item.status === 'PUBLISHED').length, closed: activities.filter((item) => item.status === 'CLOSED').length },
  ]
  if (objectives.length + activities.length === 0) return <div className="grid min-h-44 place-content-center rounded-xl bg-muted/50 text-sm text-muted-foreground">暂无课程内容，点击查看详情</div>
  return <ChartContainer config={{ published: { label: '已发布', color: 'var(--chart-1)' }, draft: { label: '草稿', color: 'var(--chart-2)' }, closed: { label: '已归档 / 结束', color: 'var(--chart-3)' } }} className="h-44 w-full aspect-auto">
    <BarChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="label" tickLine={false} axisLine={false} />
      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
      <ChartLegend content={<ChartLegendContent className="flex-wrap gap-3" />} />
      <Bar dataKey="published" stackId="content" fill="var(--color-published)" maxBarSize={48} isAnimationActive={false} />
      <Bar dataKey="draft" stackId="content" fill="var(--color-draft)" maxBarSize={48} isAnimationActive={false} />
      <Bar dataKey="closed" stackId="content" fill="var(--color-closed)" maxBarSize={48} radius={[4, 4, 0, 0]} isAnimationActive={false} />
    </BarChart>
  </ChartContainer>
}
