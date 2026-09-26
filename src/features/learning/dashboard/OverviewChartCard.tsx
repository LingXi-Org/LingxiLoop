import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Label, Pie, PieChart, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer } from '@/components/ui/chart'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export function OverviewChartCard({ title, value, description, chart, children, className, open, onOpenChange }: {
  title: string
  value: string
  description: string
  chart: ReactNode
  children: ReactNode
  className?: string
  open: boolean
  onOpenChange(open: boolean): void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Card className={cn('relative min-w-0', className)}>
        <CardHeader>
          <CardTitle><h3>{title}</h3></CardTitle>
          <CardDescription>{description}</CardDescription>
          <CardAction><ArrowUpRight aria-hidden="true" className="size-4 text-muted-foreground" /></CardAction>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        </CardHeader>
        <CardContent aria-hidden="true" inert>{chart}</CardContent>
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" className="absolute inset-0 z-10 h-full w-full rounded-[inherit] p-0 hover:bg-accent/20 focus-visible:ring-inset" aria-label={`查看${title}：${value}`}>
            <span className="sr-only">展开{title}</span>
          </Button>
        </DialogTrigger>
      </Card>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden sm:max-w-5xl motion-reduce:animate-none">
        <DialogHeader className="pe-10">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="@container/learning-grid min-h-0 overflow-y-auto overscroll-contain p-1 [scrollbar-gutter:stable]">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export type OverviewChartDatum = { label: string; count: number }
const chartColors = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

export function OverviewDonutChart({ data, value }: { data: OverviewChartDatum[]; value: string }) {
  const chartData = data.map((item, index) => ({ ...item, fill: chartColors[index % chartColors.length] }))
  if (!data.some((item) => item.count > 0)) return <ChartPlaceholder />
  return (
    <div className="flex min-h-44 flex-wrap items-center justify-center gap-4">
      <ChartContainer config={{ count: { label: '数量' } }} className="size-44 shrink-0 aspect-square">
        <PieChart accessibilityLayer={false}>
          <Pie data={chartData} dataKey="count" nameKey="label" innerRadius="65%" outerRadius="90%" paddingAngle={3} strokeWidth={0} isAnimationActive={false}>
            <Label value={value} position="center" className="fill-foreground text-2xl font-semibold" />
          </Pie>
        </PieChart>
      </ChartContainer>
      <dl className="min-w-28 flex-1 space-y-3">
        {chartData.map((item) => <div key={item.label} className="flex items-center justify-between gap-4 text-xs">
          <dt className="flex items-center gap-2 text-muted-foreground"><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.fill }} />{item.label}</dt>
          <dd className="font-medium tabular-nums">{item.count}</dd>
        </div>)}
      </dl>
    </div>
  )
}

export function OverviewBarChart({ data, layout = 'horizontal' }: { data: OverviewChartDatum[]; layout?: 'horizontal' | 'vertical' }) {
  if (!data.some((item) => item.count > 0)) return <ChartPlaceholder />
  const horizontalBars = layout === 'vertical'
  return (
    <ChartContainer config={{ count: { label: '数量', color: 'var(--chart-1)' } }} className="h-44 w-full aspect-auto">
      <BarChart accessibilityLayer={false} data={data} layout={layout} margin={{ top: 8, right: 16, left: horizontalBars ? 0 : -24, bottom: 0 }}>
        <CartesianGrid vertical={horizontalBars} horizontal={!horizontalBars} />
        <XAxis type={horizontalBars ? 'number' : 'category'} dataKey={horizontalBars ? undefined : 'label'} allowDecimals={false} tickLine={false} axisLine={false} minTickGap={8} />
        <YAxis type={horizontalBars ? 'category' : 'number'} dataKey={horizontalBars ? 'label' : undefined} width={horizontalBars ? 56 : 40} allowDecimals={false} tickLine={false} axisLine={false} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  )
}

function ChartPlaceholder() {
  return <div className="grid min-h-44 place-content-center rounded-xl bg-muted/50 text-center text-sm text-muted-foreground">暂无记录，点击查看详情</div>
}
