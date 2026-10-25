import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ImageViewer } from '@/components/ImageViewer'
import { cn } from '@/lib/utils'
import { File, getFileDataKind } from './file'
import { CardSurface, conversationCardSize } from './surfaces'

export function AttachmentCard({ filename, data, mimeType, sourceType, variant = 'card' }: {
  filename: string; data: string; mimeType: string; sourceType?: 'url' | 'id'; variant?: 'card' | 'thumbnail'
}) {
  const [failedPreview, setFailedPreview] = useState<string | null>(null)
  const [loadedPreview, setLoadedPreview] = useState<string | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const kind = getFileDataKind(data, sourceType)
  const href = kind === 'id' ? `/api/files?key=${encodeURIComponent(data)}` : kind === 'base64' ? `data:${mimeType};base64,${data}` : data
  const safeHref = href && /^(https?:\/\/|\/api\/files\?|blob:|data:(?:image|audio|video)\/|data:application\/pdf;)/i.test(href) ? href : null
  const isImage = mimeType.startsWith('image/')
  if (isImage && variant === 'thumbnail') {
    const failed = !safeHref || failedPreview === safeHref
    const preview = <>
      {failed ? <span className="grid justify-items-center gap-1 p-2 text-xs text-muted-foreground"><File.Icon mimeType={mimeType} />图片预览不可用</span>
        : <>
          {loadedPreview !== safeHref && <span role="status" className="absolute text-xs text-muted-foreground">正在加载图片…</span>}
          <img src={safeHref} alt={filename} loading="lazy" className={cn('max-h-full max-w-full object-contain', loadedPreview !== safeHref && 'opacity-0')}
            onLoad={() => setLoadedPreview(safeHref)} onError={() => setFailedPreview(safeHref)} />
        </>}
    </>
    const className = 'relative flex size-32 max-w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
    return <>
      {safeHref ? <button type="button" data-slot="attachment-thumbnail" title={filename} aria-label={`查看图片：${filename}`} className={className} onClick={() => setViewerOpen(true)}>{preview}</button>
        : <div data-slot="attachment-thumbnail" role="img" aria-label={`${filename}：图片预览不可用`} className={className}>{preview}</div>}
      {viewerOpen && safeHref && <ImageViewer src={safeHref} name={filename} onClose={() => setViewerOpen(false)} />}
    </>
  }
  return <CardSurface data-slot="attachment-card" className={cn(conversationCardSize.standard, 'rounded-2xl')}>
    {isImage && safeHref && failedPreview !== safeHref && <a href={safeHref} target="_blank" rel="noopener noreferrer" aria-label={`查看图片：${filename}`} className="block bg-muted focus-visible:outline-2 focus-visible:outline-ring">
      <img src={safeHref} alt={filename} loading="lazy" className="max-h-64 w-full object-contain" onError={() => setFailedPreview(safeHref)} />
    </a>}
    {safeHref && mimeType.startsWith('audio/') && <audio controls preload="metadata" src={safeHref} aria-label={filename} className="w-full" onError={() => setFailedPreview(safeHref)} />}
    {safeHref && mimeType.startsWith('video/') && <video controls preload="metadata" src={safeHref} aria-label={filename} className="max-h-80 w-full" onError={() => setFailedPreview(safeHref)} />}
    <File.Root variant="ghost" className="w-full p-3.5 hover:bg-transparent">
      <File.Icon mimeType={mimeType} />
      <div className="min-w-0 flex-1"><File.Name className="block text-sm">{filename}</File.Name><p className="text-xs text-muted-foreground">{failedPreview && failedPreview === safeHref ? isImage ? '图片预览不可用' : '媒体预览不可用' : isImage ? '图片附件' : '文件附件'}</p></div>
      {safeHref && <Button asChild variant="outline" size="sm"><a href={safeHref} target="_blank" rel="noopener noreferrer" aria-label={`打开附件：${filename}`}>打开</a></Button>}
    </File.Root>
  </CardSurface>
}
