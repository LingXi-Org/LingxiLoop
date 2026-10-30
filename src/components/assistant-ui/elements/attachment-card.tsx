import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FilePreviewDialog } from '@/components/retab/ui/file-preview-dialog'
import { cn } from '@/lib/utils'
import { File, getFileDataKind } from './file'
import { CardSurface, conversationCardSize } from './surfaces'

export function AttachmentCard({ filename, data, mimeType, sourceType, variant = 'card' }: {
  filename: string; data: string; mimeType: string; sourceType?: 'url' | 'id'; variant?: 'card' | 'thumbnail'
}) {
  const [failed, setFailed] = useState(false), [viewerOpen, setViewerOpen] = useState(false)
  const kind = getFileDataKind(data, sourceType)
  const href = kind === 'id' ? `/api/files?key=${encodeURIComponent(data)}` : kind === 'base64' && /^[\w.+-]+\/[\w.+-]+$/.test(mimeType) ? `data:${mimeType};base64,${data}` : data
  const safeHref = href && (/^(https?:\/\/|\/api\/files\?|blob:|data:(?:image|audio|video)\/|data:application\/pdf;)/i.test(href) || ((kind === 'base64' || kind === 'data-uri') && /^data:[\w.+-]+\/[\w.+-]+;base64,[a-z0-9+/=\s]*$/i.test(href))) ? href : null
  const source = useMemo(() => safeHref ? ({ kind: 'url' as const, url: safeHref, fileName: filename, mimeType }) : null, [safeHref, filename, mimeType])
  const image = mimeType.startsWith('image/')
  const dialog = viewerOpen && source && <FilePreviewDialog source={source} onClose={() => setViewerOpen(false)} />
  if (image && variant === 'thumbnail') return <>
    <button type="button" data-slot="attachment-thumbnail" disabled={!source} title={filename} aria-label={`预览附件：${filename}`} className="relative flex size-32 max-w-full items-center justify-center overflow-hidden rounded-xl border bg-muted focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setViewerOpen(true)}>
      {source && !failed ? <img src={safeHref!} alt={filename} loading="lazy" className="max-h-full max-w-full object-contain" onError={() => setFailed(true)} /> : <File.Icon mimeType={mimeType} />}
    </button>{dialog}
  </>
  return <><CardSurface data-slot="attachment-card" className={cn(conversationCardSize.standard, 'rounded-2xl')}>
    <File.Root variant="ghost" className="w-full p-3.5 hover:bg-transparent"><File.Icon mimeType={mimeType} />
      <div className="min-w-0 flex-1"><File.Name className="block text-sm">{filename}</File.Name><p className="text-xs text-muted-foreground">文件附件</p></div>
      <Button type="button" variant="outline" size="sm" disabled={!source} onClick={() => setViewerOpen(true)} aria-label={`预览附件：${filename}`}>打开</Button>
    </File.Root>
  </CardSurface>{dialog}</>
}
