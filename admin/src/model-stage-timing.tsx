import * as React from 'react'
import type { RunStageTiming } from '../../shared/model-stage-timing'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const ms = (value: number | undefined) => value === undefined ? '未提供' : `${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} ms`
const phaseLabels = [
  ['totalMs', '观测模型调用总耗时'], ['modelPermitWaitMs', '本次调用许可等待'], ['httpToHeadersMs', 'HTTP 至响应头'],
  ['httpToFirstContentMs', 'HTTP 至首个正文'], ['httpToFirstCompleteToolCallMs', 'HTTP 至首个完整工具调用'],
  ['observedStreamMs', '观测流读取'], ['finalProtocolValidationMs', '最终协议校验'],
  ['outputCallbackTotalMs', '输出回调累计'], ['outputCallbackWaitMs', '输出回调等待区间并集'],
] as const
const failureStages = { operation: '操作确认', delta: '文本增量', end: '输出结束', seal: '最终封存' }
const failureCodes = { persistence_rejected: '持久化确认被拒绝', cancelled: '已取消' }

export function ModelStageTimingCard({ stages }: { stages?: RunStageTiming }) {
  const headingId = React.useId()
  if (!stages) return null
  return <Card aria-labelledby={headingId}><CardHeader><CardTitle id={headingId}>模型与输出阶段</CardTitle><CardDescription>已观测调用与输出确认的阶段计时；历史缺失字段不补写为零。</CardDescription></CardHeader><CardContent className="space-y-5">
    {!stages.modelCallsAvailable && <p role="status">模型阶段账本暂不可用。</p>}
    {stages.modelCallsAvailable && !stages.calls.length && <p>暂无可用的模型阶段计时。</p>}
    {stages.calls.map(call => <details key={JSON.stringify([call.callId, call.fence, call.requestVersion])} className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">{call.operation === 'correction' ? '协议纠正' : call.operation === 'generation' ? '生成' : '模型调用'} · {call.status === 'succeeded' ? '成功' : '失败'} · {call.callId}</summary>
      {call.status === 'failed' && <p className="mt-3 text-sm">失败来源：{call.failureAttribution?.kind === 'output' ? '本地输出' : '未提供'}{call.failureAttribution?.outputCallback ? `；${call.failureAttribution.outputCallback === 'operation' ? '输出操作回调' : '文本增量回调'}` : ''}</p>}
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{phaseLabels.map(([key, label]) => <div key={key}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="tabular-nums">{ms(call.stages[key])}</dd></div>)}
        <div><dt>HTTP 请求次数</dt><dd>{call.stages.httpRequestCount ?? '未提供'}</dd></div><div><dt>输出回调次数</dt><dd>{call.stages.outputCallbackCount ?? '未提供'}</dd></div>
        <div><dt>流读取正常结束</dt><dd>{call.stages.streamCompleted === undefined ? '未提供' : call.stages.streamCompleted ? '是' : '否'}</dd></div>
      </dl></details>)}
    {!stages.publicationMeasurementsAvailable && <p role="status">输出确认计时暂不可用。</p>}
    {stages.publicationMeasurementsAvailable && !stages.publicationTimings.length && <p>暂无可用的输出确认计时。</p>}
    {stages.publicationTimings.map(value => <details key={JSON.stringify([value.callId, value.fence, value.requestVersion])} className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">输出确认 · 修订 {value.revision} · {value.callId}</summary>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2"><div><dt>持久化确认累计等待</dt><dd>{ms(value.publicationTotalMs)}</dd></div><div><dt>持久化确认等待区间并集</dt><dd>{ms(value.publicationWaitMs)}</dd></div><div><dt>确认完成 / 尝试写入</dt><dd>{value.acknowledgedCount} / {value.publicationCount}</dd></div></dl>
      {value.failure && <p className="mt-3">{failureStages[value.failure.stage]}：{failureCodes[value.failure.code]}</p>}
    </details>)}
    {(stages.callsTruncated || stages.publicationsTruncated) && <p>仅展示各自最近 64 条可用测量，不能据此推断全量。</p>}
    <p className="text-sm text-muted-foreground">各阶段使用进程内时钟，区间可能重叠。流读取包含回调反压，不能相加或相减推算供应商纯推理时间。输出确认不代表 IM 投递或用户已收到。</p>
    <p className="text-sm text-muted-foreground">供应商独立耗时、未归因运行时间和当前正在等待模型许可的状态仍未提供。</p>
  </CardContent></Card>
}
