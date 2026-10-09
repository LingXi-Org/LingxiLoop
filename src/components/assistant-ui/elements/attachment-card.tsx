import { useContext, useState } from 'react'
import { MessageFooterContext } from '../message-footer'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { File, getFileDataKind } from './file'
import { CardSurface, conversationCardSize } from './surfaces'

export function AttachmentCard({ filename, data, mimeType, sourceType }: {
  filename: string; data: string; mimeType: string; sourceType?: 'url' | 'id'
}) {
  const [failedPreview, setFailedPreview] = useState<string | null>(null)
  const footer = useContext(MessageFooterContext)
  const kind = getFileDataKind(data, sourceType)
  const href = kind === 'id' ? `/api/files?key=${encodeURIComponent(data)}` : kind === 'base64' ? `data:${mimeType};base64,${data}` : data
  const safeHref = href && /^(https?:\/\/|\/api\/files\?|blob:|data:(?:image|audio|video)\/|data:application\/pdf;)/i.test(href) ? href : null
  const isImage = mimeType.startsWith('image/')
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
    {footer && <div className="px-3.5 pb-2">{footer}</div>}
  </CardSurface>
}
