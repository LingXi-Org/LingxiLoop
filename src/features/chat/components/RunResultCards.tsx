import { DownloadIcon, PackageIcon } from 'lucide-react'
import type { ResponseEnvelope } from '@lyyzka/lingxios/ui'
import { File } from '@/components/assistant-ui/elements/file'
import { CardSurface, conversationCardSize } from '@/components/assistant-ui/elements/surfaces'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
