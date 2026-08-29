import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useCallback, useEffect, useRef, useState } from 'react'
import { uploadsApi } from '@/features/platform/api'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { type AttachmentPreviewKind, type AttachmentPreviewState, formatTextPreview, inferTextPreviewFormat, PDF_PREVIEW_MAX_BYTES, readTextPreview, tokenizeJsonPreview } from '@/lib/attachmentPreview'
import type { Message } from '@/types'
import { TypesetMarkdown } from './Typeset'

GlobalWorkerOptions.workerSrc ||= pdfWorkerUrl

type Attachment = NonNullable<Message['attachment']>

async function freshUrl(attachment: Attachment): Promise<string> {
  if (/^(data:|blob:)/i.test(attachment.url) || attachment.url.startsWith('/')) return attachment.url
  if (!attachment.key) throw new Error('attachment storage key is missing')
  return (await uploadsApi.refreshUploadUrl({ key: attachment.key })).url
}

function ViewerShell({ name, url, onClose, children }: { name: string; url: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="flex h-[min(90vh,900px)] max-w-[min(94vw,1200px)] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-center justify-between border-b px-5 py-4 pr-16">
          <DialogTitle className="min-w-0 truncate">{name}</DialogTitle>
          <Button asChild variant="outline" size="sm">
            <a href={url} download={name} target="_blank" rel="noreferrer">下载</a>
          </Button>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

function PdfPage({ pageNumber, document, scale, onVisible }: { pageNumber: number; document: PDFDocumentProxy; scale: number; onVisible: (page: number) => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(pageNumber <= 2)
  const [ratio, setRatio] = useState(Math.SQRT2)
  useEffect(() => {
    const host = hostRef.current
    if (!host || !('IntersectionObserver' in window)) { setVisible(true); return }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return
      if (entry.isIntersecting) { setVisible(true); onVisible(pageNumber) }
    }, { rootMargin: '700px 0px', threshold: 0.18 })
    observer.observe(host)
    return () => observer.disconnect()
  }, [onVisible, pageNumber])
  useEffect(() => {
    if (!visible || !canvasRef.current) return
    let active = true
    let page: PDFPageProxy | null = null
    let task: ReturnType<PDFPageProxy['render']> | null = null
    void document.getPage(pageNumber).then((nextPage) => {
      if (!active || !canvasRef.current) return
      page = nextPage
      const viewport = page.getViewport({ scale })
      setRatio(viewport.height / viewport.width)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const canvas = canvasRef.current
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      const context = canvas.getContext('2d')
      if (!context) return
      task = page.render({ canvas, canvasContext: context, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] })
      return task.promise
    }).catch((error) => { if (active && error?.name !== 'RenderingCancelledException') console.warn('[pdf-preview] page failed', error) })
    return () => { active = false; task?.cancel(); page?.cleanup() }
  }, [document, pageNumber, scale, visible])
  return <div ref={hostRef} className="pdf-preview-page" style={{ aspectRatio: `1 / ${ratio}` }} data-page={pageNumber}>{visible && <canvas ref={canvasRef} />}<span>{pageNumber}</span></div>
}

function PdfViewer({ attachment, url, onClose }: { attachment: Attachment; url: string; onClose: () => void }) {
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState<string | null>(attachment.size && attachment.size > PDF_PREVIEW_MAX_BYTES ? 'PDF 超过 25 MB 预览上限' : null)
  const [scale, setScale] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const onVisible = useCallback((page: number) => setCurrentPage(page), [])
  useEffect(() => {
    if (error) return
    let active = true
    const task = getDocument({ url })
    void task.promise.then((pdf) => { if (active) setPdfDocument(pdf); else pdf.cleanup() }).catch(() => { if (active) setError('无法读取 PDF，请下载后查看') })
    return () => { active = false; void task.destroy() }
  }, [error, url])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      else if (event.key === '+' || event.key === '=') { event.preventDefault(); setScale((value) => Math.min(4, value + .25)) }
      else if (event.key === '-') { event.preventDefault(); setScale((value) => Math.max(.5, value - .25)) }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return <ViewerShell name={attachment.name} url={url} onClose={onClose}>
    <div className="pdf-preview-toolbar"><Button type="button" variant="outline" size="icon-sm" onClick={() => setScale((value) => Math.max(.5, value - .25))}>−</Button><span>{Math.round(scale * 100)}%</span><Button type="button" variant="outline" size="icon-sm" onClick={() => setScale((value) => Math.min(4, value + .25))}>＋</Button><span className="ml-auto">{pdfDocument ? `${currentPage} / ${pdfDocument.numPages}` : ''}</span></div>
    <div className="attachment-viewer-body pdf-preview-body">{error ? <PreviewError message={error} url={url} name={attachment.name} /> : !pdfDocument ? <PreviewLoading /> : Array.from({ length: pdfDocument.numPages }, (_, index) => <PdfPage key={index + 1} pageNumber={index + 1} document={pdfDocument} scale={scale} onVisible={onVisible} />)}</div>
  </ViewerShell>
}

function PreviewLoading() { return <ResourceSkeleton variant="media" className="h-full p-5" label="正在准备附件预览" /> }
function PreviewError({ message, url, name }: { message: string; url: string; name: string }) { return <div className="attachment-preview-state" role="alert"><strong>无法显示预览</strong><span>{message}</span><a href={url} download={name} target="_blank" rel="noreferrer">下载文件</a></div> }

function MarkdownDocument({ source }: { source: string }) {
  return <TypesetMarkdown
      as="article"
      preset="document"
      className="markdown-attachment-preview"
      content={source}
      components={{
        a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
        img: ({ alt }) => <span className="not-typeset markdown-attachment-image-placeholder">{alt || '图片'}</span>,
      }}
    />
}

function JsonDocument({ source }: { source: string }) {
  let formatted: string
  let valid = true
  try { formatted = JSON.stringify(JSON.parse(source), null, 2) } catch { formatted = source; valid = false }
  return <div className="json-attachment-preview">
    {!valid && <div className="json-preview-warning">JSON 格式无效</div>}
    <pre>{tokenizeJsonPreview(formatted).map((token, index) => <span key={`${index}-${token.kind}`} data-json-token={token.kind}>{token.value}</span>)}</pre>
  </div>
}

function TextDocument({ name, source }: { name: string; source: string }) {
  const format = inferTextPreviewFormat(name)
  if (format === 'markdown') return <MarkdownDocument source={source} />
  if (format === 'json') return <JsonDocument source={source} />
  return <pre className="plain-attachment-preview">{source}</pre>
}

function TextViewer({ attachment, url, onClose }: { attachment: Attachment; url: string; onClose: () => void }) {
  const [state, setState] = useState<AttachmentPreviewState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    void fetch(url, { signal: controller.signal }).then(readTextPreview).then((text) => setState({ status: 'ready', url, text: formatTextPreview(attachment.name, text) })).catch((reason) => {
      if ((reason as { name?: string }).name !== 'AbortError') setState({ status: 'error', message: reason instanceof Error ? reason.message : String(reason) })
    })
    return () => controller.abort()
  }, [attachment.name, attempt, url])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }
    document.addEventListener('keydown', onKey, true); return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return <ViewerShell name={attachment.name} url={url} onClose={onClose}><div className="attachment-viewer-body text-preview-body">{state.status === 'ready' ? <TextDocument name={attachment.name} source={state.text ?? ''} /> : state.status === 'error' ? <div className="attachment-preview-state" role="alert"><strong>无法显示预览</strong><span>{state.message}</span><Button type="button" variant="outline" onClick={() => setAttempt((value) => value + 1)}>重试</Button></div> : <PreviewLoading />}</div></ViewerShell>
}

function VideoViewer({ attachment, url, onClose }: { attachment: Attachment; url: string; onClose: () => void }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }
    document.addEventListener('keydown', onKey, true); return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return <ViewerShell name={attachment.name} url={url} onClose={onClose}><div className="attachment-viewer-body video-preview-body">{failed ? <PreviewError message="浏览器不支持该视频编码" url={url} name={attachment.name} /> : <video controls preload="metadata" src={url} onError={() => setFailed(true)} />}</div></ViewerShell>
}

export function AttachmentViewer({ attachment, kind, onClose }: { attachment: Attachment; kind: AttachmentPreviewKind; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    if (!attachment.url) { setError('附件没有可用的下载地址'); return }
    void freshUrl(attachment).then((value) => { if (active) setUrl(value) }).catch(() => { if (active) setError('无法刷新附件地址') })
    return () => { active = false }
  }, [attachment.url])
  if (typeof document === 'undefined') return null
  if (error || !url) return <ViewerShell name={attachment.name} url={attachment.url ?? '#'} onClose={onClose}>{error ? <PreviewError message={error} url={attachment.url ?? '#'} name={attachment.name} /> : <PreviewLoading />}</ViewerShell>
  if (kind === 'pdf') return <PdfViewer attachment={attachment} url={url} onClose={onClose} />
  if (kind === 'text') return <TextViewer attachment={attachment} url={url} onClose={onClose} />
  return <VideoViewer attachment={attachment} url={url} onClose={onClose} />
}
