import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { FilePreviewDialog } from '@/components/retab/ui/file-preview-dialog'
import type { ViewerSource } from '@/components/retab/lib/viewer-source'
import { useAuth } from '@/stores/auth'
import { useApp } from '@/stores/app'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import type { ReactNode } from 'react'

export function ProtectedFileLinks({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<{ url: string; fileName: string } | null>(null)
  const close = useCallback(() => setSelected(null), [])
  return <>
    <div onClickCapture={event => {
      const target = event.target instanceof Element ? event.target.closest('a, img') : null
      const address = target instanceof HTMLAnchorElement ? target.href : target instanceof HTMLImageElement ? target.src : ''
      if (!address) return
      const url = new URL(address, window.location.href)
      if (url.origin !== window.location.origin || url.pathname !== '/api/files' || !url.searchParams.has('key')) return
      event.preventDefault(); event.stopPropagation()
      const fileName = target instanceof HTMLImageElement ? target.alt || '图片' : target?.textContent?.trim() || '文件'
      setSelected({ url: url.href, fileName })
    }}>{children}</div>
    {selected && <InlineForumFile key={selected.url} {...selected} onClose={close} />}
  </>
}

function InlineForumFile({ url, fileName, onClose }: { url: string; fileName: string; onClose(): void }) {
  const [source, setSource] = useState<ViewerSource | null>(null), [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController(), auth = useAuth.getState(), conversation = useApp.getState().selectedConversationId, workspace = getWorkspaceSession()
    const current = () => useAuth.getState().user?.id === auth.user?.id && useAuth.getState().activeCompanyId === auth.activeCompanyId && useApp.getState().selectedConversationId === conversation && getWorkspaceSession()?.projectId === workspace?.projectId && getWorkspaceSession()?.companyId === workspace?.companyId
    const check = () => { if (!current()) { controller.abort(); onClose() } }
    const a = useAuth.subscribe(check), b = useApp.subscribe(check)
    window.addEventListener('lingxiloop-workspace-changed', check)
    void fetch(url, { signal: controller.signal, credentials: 'include' }).then(response => {
      if (!response.ok) throw new Error('file unavailable')
      return response.blob()
    }).then(blob => { if (!controller.signal.aborted && current()) setSource({ kind: 'blob', blob, fileName, mimeType: blob.type, identityKey: crypto.randomUUID() }) })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => { controller.abort(); a(); b(); window.removeEventListener('lingxiloop-workspace-changed', check) }
  }, [url, fileName, onClose])
  if (source) return <FilePreviewDialog source={source} onClose={onClose} />
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent aria-describedby={undefined}><DialogTitle className="sr-only">{fileName}</DialogTitle>{error ? <p role="alert">文件无法读取，请关闭后重试。</p> : <p role="status">正在加载文件…</p>}</DialogContent></Dialog>
}
