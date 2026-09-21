import { DownloadIcon, PackageIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ResponseEnvelope, RunView } from '@lyyzka/lingxios/ui'
import { File } from '@/components/assistant-ui/elements/file'
import { ProgressCard, type ProgressStep } from '@/components/assistant-ui/elements/progress-card'
import { CardSurface, conversationCardSize } from '@/components/assistant-ui/elements/surfaces'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { harnessFailure, harnessLabel } from '../runtime/harness'

export function DeliveryCard({ artifacts, busy, onDownload }: {
  artifacts: ResponseEnvelope['artifacts']; busy: boolean; onDownload: (artifact: ResponseEnvelope['artifacts'][number]) => void
}) {
  return <CardSurface aria-label="交付清单" className={cn(conversationCardSize.standard, 'rounded-[6px_18px_18px_6px] p-4 text-foreground')}>
    <h3 className="flex items-center gap-2 text-sm font-medium"><PackageIcon aria-hidden className="size-4 text-muted-foreground" />交付清单<span className="ms-auto text-xs font-normal text-muted-foreground">{artifacts.length} 个文件</span></h3>
    <ul className="mt-2 divide-y divide-border">
      {artifacts.map(artifact => <li key={artifact.path}>
        <File.Root variant="ghost" className="w-full rounded-none px-0 py-3 hover:bg-transparent">
          <File.Icon mimeType={artifact.mime} />
          <div className="min-w-0 flex-1"><File.Name className="block text-xs">{artifact.path.split('/').at(-1)}</File.Name><File.Size bytes={artifact.size} className="text-xs text-muted-foreground" /></div>
          <Button type="button" size="icon-sm" variant="outline" disabled={busy} aria-label={`下载 ${artifact.path.split('/').at(-1)}`} onClick={() => onDownload(artifact)}><DownloadIcon aria-hidden /></Button>
        </File.Root>
      </li>)}
    </ul>
  </CardSurface>
}

export function RunProgressCard({ view, error, children }: { view: RunView; error?: string | null; children?: ReactNode }) {
  const outcome = view.goalOutcome
  const failed = view.lifecycle === 'failed'
  const stopped = view.lifecycle === 'cancelled' || outcome?.status === 'partial' || outcome?.status === 'blocked'
  const gaps = outcome && 'gaps' in outcome ? outcome.gaps : undefined
  const steps: ProgressStep[] = [{
    id: 'execution', label: '执行任务',
    status: failed ? 'failed' : stopped ? 'stopped' : outcome?.status === 'satisfied' ? 'complete' : view.lifecycle === 'leased' ? 'running' : 'pending',
    detail: <>{harnessLabel(view)}{error && <p className="mt-1 text-destructive">{harnessFailure(error)}</p>}{gaps?.length ? <ul className="mt-1 list-disc ps-4">{[...new Set(gaps)].map(gap => <li key={gap}>{harnessFailure(gap)}</li>)}</ul> : null}</>,
  }, {
    id: 'result', label: '准备交付', status: view.message ? 'complete' : failed || stopped ? 'stopped' : 'pending',
    detail: view.message ? '答复已生成' : '尚无已提交的答复',
  }, {
    id: 'delivery', label: '投递到会话',
    status: view.delivery === 'failed' ? 'failed' : view.delivery === 'delivered' ? 'complete' : 'pending',
    detail: view.delivery === 'failed' ? '投递未完成，可重试投递。' : view.delivery === 'delivered' ? '已投递' : '等待投递结果',
  }]
  return <ProgressCard title="任务结果" steps={steps}>{children}</ProgressCard>
}
