// Attachment gallery/metadata rows adapt Memos MemoMetadata/Attachment (MIT); see memos/README.md.
import { DownloadIcon, FileIcon, PlayIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FilePreviewDialog } from '@/components/retab/ui/file-preview-dialog'
import { cn } from '@/lib/utils'
import type { ForumAttachment } from './contracts'
import { resolveVisualGalleryLayout } from './memos/visualGalleryLayout'

export const forumFileUrl = (file: ForumAttachment) => `/api/files?key=${encodeURIComponent(file.key)}`
export const attachmentKind = (name: string) => /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(name) ? 'image'
  : /\.(mp4|webm|mov|m4v)$/i.test(name) ? 'video' : /\.(mp3|wav|ogg|m4a|flac)$/i.test(name) ? 'audio' : 'file'
export interface ForumMediaItem extends ForumAttachment { id: string; kind: 'image' | 'video'; sourceUrl: string }

export function ForumFileOpen({ file, className, children }: { file: ForumAttachment; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const source = useMemo(() => ({ kind: 'url' as const, url: forumFileUrl(file), fileName: file.name }), [file.key, file.name])
  return <><button type="button" className={className} onClick={() => setOpen(true)}>{children}</button>
    {open && <FilePreviewDialog source={source} onClose={() => setOpen(false)} />}</>
}

export function ForumAttachments({ attachments }: { attachments: ForumAttachment[] }) {
  const [selected, setSelected] = useState<ForumAttachment | null>(null)
  const visual: ForumMediaItem[] = attachments.flatMap(file => {
    const kind = attachmentKind(file.name)
    return kind === 'image' || kind === 'video' ? [{ ...file, id: file.key, kind, sourceUrl: forumFileUrl(file) }] : []
  })
  const layout = resolveVisualGalleryLayout(visual)
  const open = (item: ForumMediaItem) => setSelected(item)
  const tile = (item: ForumMediaItem, className?: string, overlay?: string, single = false) => <Button type="button" key={item.key} variant="ghost" className={cn('group relative h-full w-full overflow-hidden rounded-lg border p-0', single && 'h-auto min-h-24 w-auto min-w-24 max-w-full', className)} aria-label={`预览附件：${item.name}`} onClick={() => open(item)}>
    {item.kind === 'image' ? <img src={item.sourceUrl} alt={item.name} loading="lazy" decoding="async" className={single ? 'max-h-96 max-w-full object-contain' : 'h-full w-full object-cover'} />
      : <><video src={item.sourceUrl} preload="metadata" className="h-full max-h-80 w-full object-cover" /><span className="absolute inset-0 flex items-center justify-center bg-background/20"><PlayIcon className="size-8" /></span></>}
    {overlay && <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-xl font-medium">{overlay}</span>}
  </Button>
  const source = useMemo(() => selected ? ({ kind: 'url' as const, url: forumFileUrl(selected), fileName: selected.name }) : null, [selected])
  return <div className="w-full min-w-0 space-y-2">
    {layout?.mode === 'single' ? tile(layout.item, undefined, undefined, true) : layout && <div className={layout.containerClassName}>{layout.cells.map(cell => tile(cell.item, cell.className, cell.overlayLabel))}</div>}
    {attachments.filter(file => !['image', 'video'].includes(attachmentKind(file.name))).map(file => <div key={file.key} className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
      <FileIcon className="size-4 shrink-0 text-muted-foreground" /><button type="button" onClick={() => setSelected(file)} className="min-w-0 flex-1 break-words text-start text-primary underline underline-offset-4">{file.name}</button>
      {attachmentKind(file.name) === 'audio' && <audio controls preload="metadata" src={forumFileUrl(file)} className="h-9 max-w-full" aria-label={file.name} />}
      <Button asChild variant="ghost" size="icon-sm"><a href={forumFileUrl(file)} download={file.name} aria-label={`下载附件：${file.name}`}><DownloadIcon /></a></Button>
    </div>)}
    {source && <FilePreviewDialog source={source} onClose={() => setSelected(null)} />}
  </div>
}
