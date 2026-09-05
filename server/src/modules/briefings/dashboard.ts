import type { TeacherBriefingDelivery } from './contracts.js'

const chartTokens = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
] as const

function summary(statistics: Record<string, number>) {
  const eventCount = statistics.eventCount ?? 0
  const attentionCount = statistics.attentionCount ?? 0
  return {
    eventCount,
    attentionCount,
    normalCount: Math.max(eventCount - attentionCount, 0),
    eventTypeCount: Object.keys(statistics).filter((key) => key !== 'eventCount' && key !== 'attentionCount').length,
  }
}

export function teacherBriefingDashboard(
  briefing: TeacherBriefingDelivery,
  previousStatistics: Record<string, number>[],
) {
  const history = [...previousStatistics, briefing.statistics].map(summary)
  const current = history.at(-1)!
  const metrics = [
    { key: 'updates', label: '学习更新', metric: 'eventCount' },
    { key: 'attention', label: '需要关注', metric: 'attentionCount' },
    { key: 'normal', label: '正常进展', metric: 'normalCount' },
    { key: 'types', label: '更新类型', metric: 'eventTypeCount' },
  ] as const

  return {
    id: `teacher-briefing-${briefing.id}`,
    role: 'information' as const,
    title: '学习情况总结',
    description: `序列 ${briefing.window_start_sequence}–${briefing.window_end_sequence}`,
    stats: metrics.map(({ key, label, metric }, index) => {
      const data = history.map((item) => item[metric])
      return {
        key,
        label,
        value: current[metric],
        format: { kind: 'number' as const, compact: true },
        sparkline: {
          data: data.length > 1 ? data : [data[0]!, data[0]!],
          color: chartTokens[index]!,
        },
      }
    }),
  }
}
