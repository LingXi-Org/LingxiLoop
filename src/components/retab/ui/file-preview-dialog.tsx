import { useEffect, useMemo, useRef } from 'react'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { FileKindIcon, fileExtension, fileKind } from '@/components/assistant-ui/elements/file-kind'
import { clearPdfDocumentResource } from '@/components/retab/lib/pdf-document-resource'
import { clearDocxDocumentResource } from '@/components/retab/lib/docx-document-resource'
import { createViewerResource } from '@/components/retab/lib/viewer-resource'
import type { ViewerSource } from '@/components/retab/lib/viewer-source'
import { scopePreviewSource } from '@/components/retab/lib/preview-session'
import { FileViewerPreview } from './file-viewer-preview'
import { useAuth } from '@/stores/auth'
import { useApp } from '@/stores/app'
import { getWorkspaceSession } from '@/lib/workspaceSession'

export function FilePreviewContent({ source }: { source: ViewerSource }) {
  // Every opening owns a fresh cache identity, so a later authorization change
  // cannot reuse content loaded by an earlier preview of the same URL.
  const scopedSource = useMemo(() => scopePreviewSource(source), [source])
  const content = useMemo(() => createViewerResource(scopedSource).content, [scopedSource])
  useEffect(() => () => { clearPdfDocumentResource(content); clearDocxDocumentResource(content) }, [content])
  return <FileViewerPreview source={scopedSource} className="h-full min-h-64 overflow-hidden" />
}

export function FilePreviewDialog({ source, onClose }: { source: ViewerSource; onClose(): void }) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const auth = useAuth.getState(), conversationId = useApp.getState().selectedConversationId
    const workspace = getWorkspaceSession()
    const check = () => {
      const current = useAuth.getState(), nextWorkspace = getWorkspaceSession()
      if (current.user?.id !== auth.user?.id || current.activeCompanyId !== auth.activeCompanyId || useApp.getState().selectedConversationId !== conversationId || nextWorkspace?.projectId !== workspace?.projectId || nextWorkspace?.companyId !== workspace?.companyId) closeRef.current()
    }
    const authUnsubscribe = useAuth.subscribe(check), appUnsubscribe = useApp.subscribe(check)
    window.addEventListener('lingxiloop-workspace-changed', check)
    return () => { authUnsubscribe(); appUnsubscribe(); window.removeEventListener('lingxiloop-workspace-changed', check) }
  }, [])
  const name = source.fileName || '文件预览'
  const kind = fileKind(source.mimeType, source.fileName)
  const ext = fileExtension(source.fileName ?? '', source.mimeType)
  const href = source.kind === 'url' ? source.url : null
  const iconButton = 'grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring max-md:size-11'
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent showCloseButton={false} className="flex h-[85dvh] max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-[var(--popover-shadow)] sm:max-w-6xl" aria-describedby={undefined}>
      <header data-slot="file-preview-header" className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-border pe-2 ps-3">
        <FileKindIcon kind={kind} size={28} />
        <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
          <DialogTitle className="truncate text-[13.5px] font-medium">{name}</DialogTitle>
          {ext && <span className="text-[11.5px] text-muted-foreground">{ext}</span>}
        </span>
        {href && <a href={href} download={source.fileName} aria-label="下载" title="下载" className={iconButton}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
        </a>}
        <DialogClose aria-label="关闭" title="关闭" className={iconButton}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </DialogClose>
      </header>
      <div className="min-h-0 flex-1 bg-canvas"><FilePreviewContent source={source} /></div>
    </DialogContent>
  </Dialog>
}
