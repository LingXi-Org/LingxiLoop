import { CircleCheckIcon, CircleDashedIcon, CircleXIcon, ListChecksIcon, LoaderCircleIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { CardSurface, conversationCardSize } from './surfaces'

export interface ProgressStep {
  id: string
  label: string
  status: 'pending' | 'running' | 'complete' | 'failed' | 'stopped'
  detail?: ReactNode
}

const statusLabels = { pending: '等待处理', running: '进行中', complete: '已完成', failed: '失败', stopped: '已停止' }
const statusIcons = { pending: CircleDashedIcon, running: LoaderCircleIcon, complete: CircleCheckIcon, failed: CircleXIcon, stopped: CircleDashedIcon }

export function ProgressCard({ title, steps, children }: { title: string; steps: ProgressStep[]; children?: ReactNode }) {
  return <CardSurface data-slot="progress-card" className={cn(conversationCardSize.standard, 'rounded-[6px_18px_18px_6px] p-4 text-foreground')}>
    <h3 className="mb-3 flex items-center gap-2 text-sm font-medium"><ListChecksIcon aria-hidden className="size-4 text-muted-foreground" />{title}</h3>
    <ol className="space-y-3">
      {steps.map(step => {
        const Icon = statusIcons[step.status]
        return <li key={step.id} aria-current={step.status === 'running' ? 'step' : undefined} className="flex min-w-0 gap-2.5">
          <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', step.status === 'failed' ? 'text-destructive' : step.status === 'pending' || step.status === 'stopped' ? 'text-muted-foreground' : 'text-primary', step.status === 'running' && 'animate-spin motion-reduce:animate-none')} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs"><span className="font-medium">{step.label}</span><span className="text-muted-foreground">{statusLabels[step.status]}</span></div>
            {step.detail && <div className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">{step.detail}</div>}
          </div>
        </li>
      })}
    </ol>
    {children}
  </CardSurface>
}
