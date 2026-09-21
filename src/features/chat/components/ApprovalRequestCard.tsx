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
    const controller = new AbortController()
    setReview(null); setError(null)
    void harnessApi.readApproval(approvalId, controller.signal).then(value => {
      const next = approvalContext(value, approvalId)
      if (!controller.signal.aborted) setReview(next)
    }).catch(cause => {
      if (!controller.signal.aborted) setError(userFacingError(cause, '审批详情暂时无法读取，请重试。'))
    })
    return () => controller.abort()
  }, [approvalId, revision])
  if (!review) return <CardSurface className={cn(conversationCardSize.standard, 'rounded-[6px_18px_18px_6px] p-4')}>
    <p role={error ? 'alert' : 'status'} className="text-xs text-muted-foreground">{error || '正在读取审批详情…'}</p>
    {error && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setRevision(value => value + 1)}>重试读取</Button>}
  </CardSurface>
  return <ApprovalCard title="任务审批" summary={review.summary} approved={review.approved} context={[{ label: '执行者', value: sender }, ...review.context]}
    busy={busy} onApprove={onApprove} onDeny={onDeny} />
}
