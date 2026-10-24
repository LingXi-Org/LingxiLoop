import { useEffect, useState } from 'react'
import { ApprovalCard } from '@/components/assistant-ui/elements/approval-card'
import { CardSurface, conversationCardSize } from '@/components/assistant-ui/elements/surfaces'
import { Button } from '@/components/ui/button'
import { userFacingError } from '@/lib/userFacingError'
import { cn } from '@/lib/utils'
import { approvalContext } from '../runtime/approval-context'
import { harnessApi } from '../runtime/harness-api'

export function ApprovalRequestCard({ approvalId, sender, busy, onApprove, onDeny }: {
  approvalId: string; sender: string; busy: boolean; onApprove: () => Promise<unknown>; onDeny: () => Promise<unknown>
}) {
  const [review, setReview] = useState<ReturnType<typeof approvalContext> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (busy) return
    const controller = new AbortController()
    setReview(null); setError(null)
    void harnessApi.readApproval(approvalId, controller.signal).then(value => {
      const next = approvalContext(value, approvalId)
      if (!controller.signal.aborted) setReview(next)
    }).catch(cause => {
      if (!controller.signal.aborted) setError(userFacingError(cause, '审批详情暂时无法读取，请重试。'))
    })
    return () => controller.abort()
  }, [approvalId, revision, busy])
  if (!review) return <CardSurface className={cn(conversationCardSize.standard, 'rounded-[6px_18px_18px_6px] p-4')}>
    <p role={error ? 'alert' : 'status'} className="text-xs text-muted-foreground">{error || '正在读取审批详情…'}</p>
    {error && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setRevision(value => value + 1)}>重试读取</Button>}
  </CardSurface>
  if (review.retired) return <p className="text-sm text-muted-foreground">邮件和日历功能已停止支持；此审批已不可执行。</p>
  return <div className="grid gap-2"><ApprovalCard title="任务审批" summary={review.summary} approved={review.approved} statusLabel={review.statusLabel} context={[{ label: '执行者', value: sender }, ...review.context]}
    busy={busy} onApprove={onApprove} onDeny={onDeny} />
    {(review.status === 'APPROVED' || review.status === 'UNKNOWN') && <Button type="button" variant="outline" size="sm" disabled={busy} className="w-fit" onClick={() => setRevision(value => value + 1)}>刷新执行进度</Button>}
  </div>
}
