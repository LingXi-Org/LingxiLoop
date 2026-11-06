import { type ReactNode, useContext, useMemo, useState } from 'react'
import { MessageFooterContext } from '../message-footer'
import { FilePreviewDialog } from '@/components/retab/ui/lazy-file-preview-dialog'
import { cn } from '@/lib/utils'
import { getFileDataKind } from './file'
import { FileExtBadge, FileKindIcon, fileExtension, fileKind } from './file-kind'

const PREVIEWABLE = /^(image\/|audio\/|video\/|text\/|application\/(pdf|json|vnd\.openxmlformats|msword|vnd\.ms-))/i

const ghost = 'grid size-[30px] shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 max-md:size-11'

export function AttachmentCard({ filename, data, mimeType, sourceType, variant = 'card' }: {
  filename: string; data: string; mimeType: string; sourceType?: 'url' | 'id'; variant?: 'card' | 'thumbnail'
}) {
  const [failed, setFailed] = useState(false), [viewerOpen, setViewerOpen] = useState(false)
  const footer = useContext(MessageFooterContext)
  const withFooter = (node: ReactNode) => footer
    ? <MessageFooterContext.Provider value={null}><div className="grid justify-items-end gap-1">{node}{footer}</div></MessageFooterContext.Provider> : node
  const kind = getFileDataKind(data, sourceType)
  const href = kind === 'id' ? `/api/files?key=${encodeURIComponent(data)}` : kind === 'base64' && /^[\w.+-]+\/[\w.+-]+$/.test(mimeType) ? `data:${mimeType};base64,${data}` : data
  const safeHref = href && (/^(https?:\/\/|\/api\/files\?|blob:|data:(?:image|audio|video)\/|data:application\/pdf;)/i.test(href) || ((kind === 'base64' || kind === 'data-uri') && /^data:[\w.+-]+\/[\w.+-]+;base64,[a-z0-9+/=\s]*$/i.test(href))) ? href : null
  const source = useMemo(() => safeHref ? ({ kind: 'url' as const, url: safeHref, fileName: filename, mimeType }) : null, [safeHref, filename, mimeType])
  const type = fileKind(mimeType, filename)
  const ext = fileExtension(filename, mimeType)
  const dialog = viewerOpen && source && <FilePreviewDialog source={source} onClose={() => setViewerOpen(false)} />
  if (type === 'image' && variant === 'thumbnail') return withFooter(<>
    <button type="button" data-slot="attachment-thumbnail" disabled={!source} title={filename} aria-label={`预览附件：${filename}`}
      className="relative flex h-[196px] w-[300px] max-w-full items-center justify-center overflow-hidden rounded-xl bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" onClick={() => setViewerOpen(true)}>
      {source && !failed ? <img src={safeHref!} alt={filename} loading="lazy" className="size-full object-cover" onError={() => setFailed(true)} /> : <FileKindIcon kind="image" />}
      <span className="absolute bottom-2.5 start-2.5 inline-flex h-6 max-w-[calc(100%-20px)] items-center truncate rounded-full bg-[rgb(20_20_18/55%)] px-2 text-[11.5px] text-white">{filename}</span>
    </button>{dialog}
  </>)
  const previewable = Boolean(source) && PREVIEWABLE.test(mimeType)
  if (!previewable) return withFooter(<div data-slot="attachment-card" data-previewable="false"
    className="flex w-[340px] max-w-full items-center gap-3 rounded-[14px] border border-dashed border-input p-2.5">
    <FileKindIcon kind="other" />
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate text-[13.5px] font-medium">{filename}</span>
      <span className="text-xs text-muted-foreground">{source ? '该格式暂不支持预览' : '文件暂不可用'}</span>
    </span>
    {source && <a href={safeHref!} download={filename} className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 text-[13px] font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring max-md:min-h-11">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-3.5"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>下载
    </a>}
  </div>)
  return withFooter(<><div data-slot="attachment-card" className="lx-card flex w-[340px] max-w-full items-center gap-3 p-2.5">
    <FileKindIcon kind={type} />
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate text-[13.5px] font-medium">{filename}</span>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><FileExtBadge kind={type} ext={ext} />文件附件</span>
    </span>
    <span className="flex shrink-0">
      <button type="button" className={ghost} onClick={() => setViewerOpen(true)} aria-label={`预览附件：${filename}`} title="预览">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
      </button>
      <a href={safeHref!} download={filename} className={cn(ghost)} aria-label={`下载附件：${filename}`} title="下载">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
      </a>
    </span>
  </div>{dialog}</>)
}
