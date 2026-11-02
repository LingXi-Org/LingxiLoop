import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer } from '@/components/ui/chart'

export type OverviewChartDatum = { label: string; count: number }
export function OverviewBarChart({ data, layout = 'horizontal' }: { data: OverviewChartDatum[]; layout?: 'horizontal' | 'vertical' }) {
  if (!data.some((item) => item.count > 0)) return <ChartPlaceholder />
  const horizontalBars = layout === 'vertical'
  return (
    <ChartContainer config={{ count: { label: '数量', color: 'var(--chart-1)' } }} className="h-56 w-full aspect-auto">
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
  return <div className="grid min-h-56 place-content-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">暂无记录</div>
}
