// Attachment gallery/metadata rows adapt Memos MemoMetadata/Attachment (MIT); see memos/README.md.
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, FileIcon, PlayIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { ForumAttachment } from './contracts'
import { resolveVisualGalleryLayout } from './memos/visualGalleryLayout'

export const forumFileUrl = (file: ForumAttachment) => `/api/files?key=${encodeURIComponent(file.key)}`
export const attachmentKind = (name: string) => /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(name) ? 'image'
  : /\.(mp4|webm|mov|m4v)$/i.test(name) ? 'video' : /\.(mp3|wav|ogg|m4a|flac)$/i.test(name) ? 'audio' : 'file'
export interface ForumMediaItem extends ForumAttachment { id: string; kind: 'image' | 'video'; sourceUrl: string }

export function ForumAttachments({ attachments }: { attachments: ForumAttachment[] }) {
  const [selected, setSelected] = useState<number | null>(null), returnFocus = useRef<HTMLElement | null>(null)
  const visual: ForumMediaItem[] = attachments.flatMap(file => {
    const kind = attachmentKind(file.name)
    return kind === 'image' || kind === 'video' ? [{ ...file, id: file.key, kind, sourceUrl: forumFileUrl(file) }] : []
  })
  const layout = resolveVisualGalleryLayout(visual)
  const open = (item: ForumMediaItem) => { returnFocus.current = document.activeElement as HTMLElement; setSelected(visual.findIndex(file => file.key === item.key)) }
  const tile = (item: ForumMediaItem, className?: string, overlay?: string, single = false) => <Button type="button" key={item.key} variant="ghost" className={cn('group relative h-full w-full overflow-hidden rounded-lg border p-0', single && 'h-auto min-h-24 w-auto min-w-24 max-w-full', className)} aria-label={`预览附件：${item.name}`} onClick={() => open(item)}>
    {item.kind === 'image' ? <img src={item.sourceUrl} alt={item.name} loading="lazy" decoding="async" className={single ? 'max-h-96 max-w-full object-contain' : 'h-full w-full object-cover'} />
      : <><video src={item.sourceUrl} preload="metadata" className="h-full max-h-80 w-full object-cover" /><span className="absolute inset-0 flex items-center justify-center bg-background/20"><PlayIcon className="size-8" /></span></>}
    {overlay && <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-xl font-medium">{overlay}</span>}
  </Button>
  const current = selected === null ? undefined : visual[selected]
  return <div className="w-full min-w-0 space-y-2">
    {layout?.mode === 'single' ? tile(layout.item, undefined, undefined, true) : layout && <div className={layout.containerClassName}>{layout.cells.map(cell => tile(cell.item, cell.className, cell.overlayLabel))}</div>}
    {attachments.filter(file => !['image', 'video'].includes(attachmentKind(file.name))).map(file => <div key={file.key} className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
      <FileIcon className="size-4 shrink-0 text-muted-foreground" /><a href={forumFileUrl(file)} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 break-words text-primary underline underline-offset-4">{file.name}</a>
      {attachmentKind(file.name) === 'audio' && <audio controls preload="metadata" src={forumFileUrl(file)} className="h-9 max-w-full" aria-label={file.name} />}
      <Button asChild variant="ghost" size="icon-sm"><a href={forumFileUrl(file)} download={file.name} aria-label={`下载附件：${file.name}`}><DownloadIcon /></a></Button>
    </div>)}
    {current && <Dialog open onOpenChange={open => { if (!open) setSelected(null) }}><DialogContent className="sm:max-w-4xl" onCloseAutoFocus={event => { event.preventDefault(); returnFocus.current?.focus() }}>
      <DialogHeader className="pe-8"><DialogTitle>{current.name}</DialogTitle><DialogDescription>附件预览 · {selected! + 1} / {visual.length}</DialogDescription></DialogHeader>
      {current.kind === 'image' ? <img src={current.sourceUrl} alt={current.name} className="mx-auto max-h-[65dvh] max-w-full rounded-lg object-contain" /> : <video src={current.sourceUrl} controls autoPlay={false} className="max-h-[65dvh] w-full" aria-label={current.name} />}
      <div className="flex justify-between gap-2"><Button variant="outline" disabled={selected === 0} onClick={() => setSelected(value => Math.max(0, value! - 1))} aria-label="上一个附件"><ChevronLeftIcon />上一个</Button>
        <Button asChild variant="outline"><a href={current.sourceUrl} download={current.name}><DownloadIcon />下载</a></Button>
        <Button variant="outline" disabled={selected === visual.length - 1} onClick={() => setSelected(value => Math.min(visual.length - 1, value! + 1))} aria-label="下一个附件">下一个<ChevronRightIcon /></Button></div>
    </DialogContent></Dialog>}
  </div>
}
