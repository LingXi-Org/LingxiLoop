import { useEffect, useMemo, useRef } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
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
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="h-[85dvh] max-h-[85dvh] gap-0 overflow-hidden p-0 sm:max-w-6xl [&_[data-slot=viewer-controls]]:pe-14" aria-describedby={undefined}>
      <DialogTitle className="sr-only">{source.fileName || '文件预览'}</DialogTitle>
      <FilePreviewContent source={source} />
    </DialogContent>
  </Dialog>
}
