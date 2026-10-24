import { AlertTriangleIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { Homework } from './contracts'

export function HomeworkValidation({ validation, dirty, busy, onRetry }: {
  validation: Homework['validation']; dirty: boolean; busy: boolean; onRetry(): void
}) {
  if (dirty) return <p role="status" className="text-sm text-muted-foreground">请先保存修改，重新检查后再确认发布。</p>
  if (validation.status === 'PENDING') return <p role="status" className="text-sm text-muted-foreground">正在检查要求与资料，完成后可以确认发布。</p>
  if (validation.status === 'READY') return validation.feedback ? <p role="status" className="text-sm text-muted-foreground">{validation.feedback}</p> : null
  const serviceError = validation.status === 'ERROR'
  const materialError = validation.status === 'MATERIAL_ERROR'
  return <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
    <AlertTriangleIcon aria-hidden="true" />
    <AlertTitle>{serviceError ? '检查暂未完成' : materialError ? '作业资料无法读取' : '作业要求需要修改'}</AlertTitle>
    <AlertDescription className="space-y-2">
      <p>{validation.feedback || (serviceError ? '检查服务暂时不可用，请稍后重试检查。' : materialError ? '请补充可读取的文字资料，或替换无法读取的附件与链接。' : '请补充明确的作业要求和可核验的验收标准。')}</p>
      <p>{serviceError ? '草稿和附件已保留。' : materialError ? '更新资料后保存并重新检查；如果资料可以正常打开，也可以重试检查。' : '修改作业要求或验收标准后，保存并重新检查。'}</p>
      {(serviceError || materialError) && <Button type="button" variant="outline" disabled={busy} onClick={onRetry}>重试检查</Button>}
    </AlertDescription>
  </Alert>
}
