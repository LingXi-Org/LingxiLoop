import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import type { LearningEvidence } from '../contracts'
import { ASSISTANCE_LABELS, MasteryBadge, statusLabel } from './learningDisplay'

type EvidenceRecord = Record<string, unknown>
type EvidenceContext = { sourceLabel: string; objectiveTitles: string[] }

function evidenceText(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 600)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '已记录本次作答与学习过程。'
  const record = value as EvidenceRecord
  for (const key of ['answer', 'text', 'content', 'summary', 'response', 'reflection']) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().slice(0, 600)
  }
  return '已记录本次作答与学习过程。'
}

function rubricRows(value: unknown): Array<{ label: string; result: string }> {
  if (!Array.isArray(value)) return []
  return value.slice(0, 8).map((entry, index) => {
    const record = entry && typeof entry === 'object' ? entry as EvidenceRecord : {}
    const label = [record.criterion, record.title, record.label, record.name]
      .find((item): item is string => typeof item === 'string' && item.trim().length > 0)
      ?.trim() ?? `评价标准 ${index + 1}`
    const note = [record.feedback, record.reason, record.comment]
      .find((item): item is string => typeof item === 'string' && item.trim().length > 0)
      ?.trim()
    const result = note ?? (record.met === true ? '符合' : record.met === false ? '待加强'
      : typeof record.score === 'number' ? `${record.score} 分` : '已评价')
    return { label: label.slice(0, 100), result: result.slice(0, 240) }
  })
}

function EvidenceSource({ context }: { context?: EvidenceContext }) {
  if (!context) return null
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>来源：{context.sourceLabel}</span>
      {context.objectiveTitles.length > 0 && <span aria-hidden="true">·</span>}
      {context.objectiveTitles.length > 0 && <span>关联目标：</span>}
      {context.objectiveTitles.map((title, index) => (
        <Badge key={`${title}-${index}`} variant="outline">{title}</Badge>
      ))}
    </div>
  )
}

export function LearningEvidenceSection({
  evidence, contextByEvidenceId,
}: {
  evidence: LearningEvidence[]
  contextByEvidenceId?: ReadonlyMap<string, EvidenceContext>
}) {
  if (evidence.length === 0) {
    return <Empty className="min-h-72 border"><EmptyHeader><EmptyTitle>还没有学习证据</EmptyTitle><EmptyDescription>提交课程活动或完成学习任务后，证据与评价会显示在这里。</EmptyDescription></EmptyHeader></Empty>
  }
  return (
    <div className="space-y-3">
      {evidence.map((item, index) => (
        <Card key={item.id} size="sm">
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-heading text-sm font-medium">第 {evidence.length - index} 次尝试</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(item.created_at).toLocaleString('zh-CN')} · {ASSISTANCE_LABELS[item.assistance] ?? '辅助方式待同步'} · {statusLabel(item.status)}
                </p>
              </div>
              {item.demonstrated_level !== null
                ? <MasteryBadge level={item.demonstrated_level} />
                : <span className="text-xs text-muted-foreground">等待评价</span>}
            </div>
            <EvidenceSource context={contextByEvidenceId?.get(item.id)} />
            <div className="mt-4 grid gap-3 @min-[44rem]/learning-grid:grid-cols-2">
              <section className="rounded-2xl bg-muted p-3">
                <p className="text-xs font-medium text-muted-foreground">学习证据</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{evidenceText(item.evidence)}</p>
              </section>
              <section className="rounded-2xl bg-muted p-3">
                <p className="text-xs font-medium text-muted-foreground">评价</p>
                {item.evaluation_id ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="secondary">{item.demonstrated_level === null ? '等待掌握等级' : `掌握等级 ${item.demonstrated_level}`}</Badge>
                    {item.confidence !== null && <span>置信度 {Math.round(item.confidence * 100)}%</span>}
                    {item.evaluation_status && <span>{statusLabel(item.evaluation_status)}</span>}
                  </div>
                ) : <p className="mt-2 text-sm text-muted-foreground">等待评价</p>}
              </section>
            </div>
            {rubricRows(item.rubric_results).length > 0 && (
              <section className="mt-3 rounded-2xl border p-3">
                <p className="text-xs font-medium text-muted-foreground">评价标准</p>
                <div className="mt-2 grid gap-2 @min-[44rem]/learning-grid:grid-cols-2">
                  {rubricRows(item.rubric_results).map((row) => (
                    <div key={`${row.label}-${row.result}`} className="rounded-xl bg-muted px-3 py-2">
                      <p className="text-xs font-medium">{row.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{row.result}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {item.feedback && <section className="mt-3"><p className="text-xs font-medium text-muted-foreground">反馈</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{item.feedback}</p></section>}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
