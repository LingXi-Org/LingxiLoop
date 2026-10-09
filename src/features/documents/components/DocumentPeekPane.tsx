import { File01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { DocumentSkeleton } from './DocumentSkeleton'
import { userFacingError } from '@/lib/userFacingError'
import { useApp } from '@/stores/app'
import { useSurface } from '@/stores/surface'
import { useDocuments } from '../state'
import { DocumentEditor } from './DocumentEditor'

export function DocumentPeekPane() {
  const documentId = useSurface((s) => s.surface?.kind === 'document' ? s.surface.documentId : null)
  const closeDocumentPeek = useSurface((s) => s.closeDocumentPeek)
  const setView = useApp((s) => s.setView)
  const list = useDocuments((s) => s.list)
  const loaded = useDocuments((s) => s.loaded)
  const load = useDocuments((s) => s.load)
  const selectDocument = useDocuments((s) => s.select)
  const doc = documentId ? list.find((d) => d.id === documentId) : null
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    setError('')
    if (!loaded) void load().catch(reason => { if (active) setError(userFacingError(reason, '文档加载失败，请重试。')) })
    return () => { active = false }
  }, [load, loaded, revision])

  if (!documentId) return null

  const openFullWorkspace = () => {
    selectDocument(documentId)
    closeDocumentPeek()
    setView('library')
  }

  if (!loaded) {
    return error ? <div role="alert" className="ui-enter grid gap-4 p-6 text-sm"><p>{error}</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}>重试</Button></div> : <DocumentSkeleton />
  }

  if (!doc) {
    return (
      <aside className="grid h-full min-w-0 place-items-center border-s border-[var(--im-divider)] bg-card px-8 text-center">
        <Empty><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={File01Icon} /></EmptyMedia><EmptyTitle>文档不可用</EmptyTitle><EmptyDescription>此文档可能已被删除，或你没有访问权限。</EmptyDescription></EmptyHeader><Button variant="outline" onClick={closeDocumentPeek}>关闭</Button></Empty>
      </aside>
    )
  }

  return (
    <aside className="h-full min-w-0 overflow-hidden border-s border-[var(--im-divider)] bg-card">
      <DocumentEditor
        documentId={documentId}
        variant="peek"
        onClose={closeDocumentPeek}
        onOpenFull={openFullWorkspace}
      />
    </aside>
  )
}
