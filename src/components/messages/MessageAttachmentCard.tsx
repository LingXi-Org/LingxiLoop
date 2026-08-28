import { useAuiState } from '@assistant-ui/react'
import { useRef, useState } from 'react'
import { Attachment, AttachmentContent, AttachmentDescription, AttachmentMedia, AttachmentTitle, AttachmentTrigger } from '@/components/ui/attachment'
import type { LingxiImMessageCustom } from '@/im/assistantMessage'
import { inferAttachmentPreview } from '@/lib/attachmentPreview'
import { useKnowledgeSources } from '@/features/knowledge/state'
import { AttachmentViewer } from '../AttachmentViewer'
import { ImageViewer } from '../ImageViewer'
import { IFigma, IFile } from '../icons'

type AttachmentState = 'processing' | 'error' | 'done'

function formatSize(size?: number) {
  if (!size) return null
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`
}

export function AttachmentCard() {
  const { message } = useAuiState((state) => state.message.metadata.custom) as unknown as LingxiImMessageCustom
  const [viewerOpen, setViewerOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const knowledgeSource = useKnowledgeSources((state) => state.list.find((source) => Boolean(source.originClientMsgNo) && source.originClientMsgNo === (message.clientId ?? message.id)))
  if (!message.attachment) throw new Error('Attachment part requires an attachment payload')

  const attachment = message.attachment
  const previewKind = inferAttachmentPreview(attachment)
  const mime = attachment.mime ?? ''
  const isImage = attachment.kind === 'img' || mime.startsWith('image/')
  const isAudio = previewKind === 'audio' || mime.startsWith('audio/')
  const isVideo = previewKind === 'video' || mime.startsWith('video/')
  const canPreview = previewKind === 'pdf' || previewKind === 'text'
  const state: AttachmentState = knowledgeSource?.status === 'failed' ? 'error' : knowledgeSource && knowledgeSource.status !== 'ready' ? 'processing' : 'done'
  const description = [mime || attachment.kind?.toUpperCase(), formatSize(attachment.size)].filter(Boolean).join(' · ')
  const knowledgeLabel = knowledgeSource ? knowledgeSource.status === 'ready' ? '已加入资料' : knowledgeSource.status === 'failed' ? '摄取失败' : '正在建立知识索引' : null
  const closeViewer = () => { setViewerOpen(false); window.requestAnimationFrame(() => triggerRef.current?.focus()) }
  const metadata = <AttachmentContent className="w-full">
    <AttachmentTitle data-find-content>{attachment.name}</AttachmentTitle>
    <AttachmentDescription>{description || '附件'}</AttachmentDescription>
    {knowledgeLabel && <AttachmentDescription>{knowledgeLabel}</AttachmentDescription>}
  </AttachmentContent>

  if (isImage) return <>
    <Attachment state={state} orientation="vertical" data-message-surface="card" data-card-variant="media" className="mt-2 w-[min(580px,78vw)] overflow-hidden">
      <AttachmentMedia variant="image"><img src={attachment.url} alt={attachment.name} loading="lazy" decoding="async" draggable={false} /></AttachmentMedia>
      {metadata}<AttachmentTrigger ref={triggerRef} onClick={() => setViewerOpen(true)} aria-label={`预览 ${attachment.name}`} className="cursor-zoom-in" />
    </Attachment>
    {viewerOpen && <ImageViewer src={attachment.url} name={attachment.name} onClose={closeViewer} />}
  </>

  if (isAudio) return <Attachment state={state} orientation="vertical" data-message-surface="card" data-card-variant="media" className="mt-2 w-[min(580px,78vw)]">
    <AttachmentMedia className="aspect-auto w-full bg-transparent p-2 pb-0"><audio className="w-full" controls preload="metadata" src={attachment.url}>浏览器不支持音频播放。</audio></AttachmentMedia>{metadata}
  </Attachment>

  if (isVideo) return <Attachment state={state} orientation="vertical" data-message-surface="card" data-card-variant="media" className="mt-2 w-[min(580px,78vw)] overflow-hidden">
    <AttachmentMedia variant="image" className="aspect-video w-full rounded-b-none bg-black p-0"><video className="h-full w-full object-contain" controls preload="metadata" src={attachment.url}>浏览器不支持视频播放。</video></AttachmentMedia>{metadata}
  </Attachment>

  const fileMedia = <AttachmentMedia>
    {attachment.kind === 'fig' ? <IFigma stroke="currentColor" strokeWidth={2} /> : <IFile stroke="currentColor" strokeWidth={1.5} />}
  </AttachmentMedia>

  if (canPreview) return <>
    <Attachment state={state} data-message-surface="card" data-card-variant="interactive" className="mt-2 w-[min(580px,78vw)]">{fileMedia}{metadata}<AttachmentTrigger ref={triggerRef} onClick={() => setViewerOpen(true)} aria-label={`预览 ${attachment.name}`} /></Attachment>
    {viewerOpen && <AttachmentViewer attachment={attachment} kind={previewKind} onClose={closeViewer} />}
  </>

  return <Attachment state={state} data-message-surface="card" data-card-variant="interactive" className="mt-2 w-[min(580px,78vw)]">
    {fileMedia}{metadata}<AttachmentTrigger render={<a href={attachment.url} download={attachment.name} target="_blank" rel="noopener noreferrer" aria-label={`下载 ${attachment.name}`} />} />
  </Attachment>
}
