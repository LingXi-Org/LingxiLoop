import { DownloadIcon, PackageIcon } from 'lucide-react'
import type { ResponseEnvelope } from '@lyyzka/lingxios/ui'
import { File } from '@/components/assistant-ui/elements/file'
import { CardSurface, conversationCardSize } from '@/components/assistant-ui/elements/surfaces'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'
import { FilePreviewDialog } from '@/components/retab/ui/file-preview-dialog'
import type { ViewerSource } from '@/components/retab/lib/viewer-source'
import { useAuth } from '@/stores/auth'
import { useApp } from '@/stores/app'

export function DeliveryCard({ artifacts, busy, onDownload, onPreview }: {
  artifacts: ResponseEnvelope['artifacts']; busy: boolean; onDownload: (artifact: ResponseEnvelope['artifacts'][number]) => void
  onPreview: (artifact: ResponseEnvelope['artifacts'][number]) => Promise<Blob>
}) {
  const [source, setSource] = useState<ViewerSource | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(false)
  const generation = useRef(0)
  const identity = useAuth(state => `${state.activeCompanyId}:${state.user?.id}`)
  const conversation = useApp(state => state.selectedConversationId)
  useEffect(() => { generation.current++; setSource(null); setLoading(false); return () => { generation.current++ } }, [identity, conversation])
  useEffect(() => {
    const changed = () => { generation.current++; setSource(null); setLoading(false) }
    window.addEventListener('lingxiloop-workspace-changed', changed)
    return () => window.removeEventListener('lingxiloop-workspace-changed', changed)
  }, [])
  const open = async (artifact: ResponseEnvelope['artifacts'][number]) => {
    const current = ++generation.current; setLoading(true); setError(false)
    try {
      const blob = await onPreview(artifact)
      if (current === generation.current) setSource({ kind: 'blob', blob, fileName: artifact.path.split('/').at(-1), mimeType: artifact.mime, identityKey: crypto.randomUUID() })
    } catch { if (current === generation.current) setError(true) }
    finally { if (current === generation.current) setLoading(false) }
  }
  return <CardSurface aria-label="交付清单" className={cn(conversationCardSize.standard, 'rounded-[6px_18px_18px_6px] p-4 text-foreground')}>
    <h3 className="flex items-center gap-2 text-sm font-medium"><PackageIcon aria-hidden className="size-4 text-muted-foreground" />交付清单<span className="ms-auto text-xs font-normal text-muted-foreground">{artifacts.length} 个文件</span></h3>
    <ul className="mt-2 divide-y divide-border">
      {artifacts.map(artifact => <li key={artifact.path}>
        <File.Root variant="ghost" className="w-full rounded-none px-0 py-3 hover:bg-transparent">
          <File.Icon mimeType={artifact.mime} />
          <div className="min-w-0 flex-1"><File.Name className="block text-xs">{artifact.path.split('/').at(-1)}</File.Name><File.Size bytes={artifact.size} className="text-xs text-muted-foreground" /></div>
          <Button type="button" size="sm" variant="outline" disabled={busy || loading} onClick={() => void open(artifact)}>打开</Button>
          <Button type="button" size="icon-sm" variant="outline" disabled={busy} aria-label={`下载 ${artifact.path.split('/').at(-1)}`} onClick={() => onDownload(artifact)}><DownloadIcon aria-hidden /></Button>
        </File.Root>
      </li>)}
    </ul>
    {error && <p role="alert">文件无法读取，请重试。</p>}
    {source && <FilePreviewDialog source={source} onClose={() => setSource(null)} />}
  </CardSurface>
}
