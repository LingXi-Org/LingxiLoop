import * as React from 'react'
import type { AgentRunTiming } from '../../shared/agent-run-timing'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const seconds = (value: number | null) => value === null ? '未提供' : `${(value / 1000).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 秒`
const queueLabels = { eligible: '可执行，正在排队', delayed: '尚未到可执行时间', 'not-queued': '当前未排队', unknown: '排队时间未知' }

export function AgentRunTimingCard({ timing }: { timing?: AgentRunTiming }) {
  const headingId = React.useId()
  if (!timing) return null
  const values: Array<[string, number | null]> = [
    ['当前可执行排队', timing.eligibleQueueMs], ['距离可执行时间', timing.availableDelayMs],
    ['首次可执行至开始', timing.initialEligibleToStartedMs], ['各次尝试累计执行', timing.attemptExecutionTotalMs],
    ['最近心跳距今', timing.heartbeatAgeMs], ['当前模型许可等待', timing.modelPermitWaitMs], ['端到端完成', timing.endToEndMs],
  ]
  return <Card aria-labelledby={headingId}><CardHeader><CardTitle id={headingId}>排队与执行</CardTitle><CardDescription>{queueLabels[timing.queueState]}</CardDescription></CardHeader>
    <CardContent className="space-y-4"><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{values.map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 font-medium tabular-nums">{seconds(value)}</dd></div>)}</dl>
      <p className="text-sm text-muted-foreground">首次等待包含领取后的恢复。累计执行可能包含模型许可等待；多个尝试、模型和并行工具的耗时不能相加作为端到端用时。</p>
      {timing.queueState === 'delayed' && <p className="text-sm text-muted-foreground">任务尚未到可执行时间，不能据此判断 Worker 容量不足。</p>}
      {timing.leaseValidity === 'unknown' && <p className="text-sm text-muted-foreground">已领取不代表模型已经开始。现有观测无法确认租约有效期或当前模型许可等待。</p>}
    </CardContent></Card>
}
