import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { File, getFileDataKind } from './file'
import { CardSurface, conversationCardSize } from './surfaces'

export function AttachmentCard({ filename, data, mimeType, sourceType }: {
  filename: string; data: string; mimeType: string; sourceType?: 'url' | 'id'
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const kind = getFileDataKind(data, sourceType)
  const href = kind === 'id' ? null : kind === 'base64' ? `data:${mimeType};base64,${data}` : data
  const safeHref = href && /^(https?:\/\/|blob:|data:)/i.test(href) ? href : null
  const isImage = mimeType.startsWith('image/')
  return <CardSurface data-slot="attachment-card" className={cn(conversationCardSize.standard, 'rounded-[6px_18px_18px_6px]')}>
    {isImage && safeHref && failedImage !== safeHref && <a href={safeHref} target="_blank" rel="noopener noreferrer" aria-label={`查看图片：${filename}`} className="block bg-muted focus-visible:outline-2 focus-visible:outline-ring">
      <img src={safeHref} alt={filename} loading="lazy" className="max-h-64 w-full object-contain" onError={() => setFailedImage(safeHref)} />
    </a>}
    <File.Root variant="ghost" className="w-full p-3.5 hover:bg-transparent">
      <File.Icon mimeType={mimeType} />
      <div className="min-w-0 flex-1"><File.Name className="block text-sm">{filename}</File.Name><p className="text-xs text-muted-foreground">{isImage ? failedImage === safeHref ? '图片预览不可用' : '图片附件' : '文件附件'}</p></div>
      {safeHref && <Button asChild variant="outline" size="sm"><a href={safeHref} target="_blank" rel="noopener noreferrer" aria-label={`打开附件：${filename}`}>打开</a></Button>}
    </File.Root>
  </CardSurface>
}
