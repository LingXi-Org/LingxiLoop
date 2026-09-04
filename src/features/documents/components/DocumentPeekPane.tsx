import { File01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
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

  useEffect(() => {
    if (!loaded) void load()
  }, [load, loaded])

  if (!documentId) return null

  const openFullWorkspace = () => {
    selectDocument(documentId)
    closeDocumentPeek()
    setView('library')
  }

  if (!loaded) {
    return (
      <aside className="grid h-full min-w-0 place-items-center border-s border-[var(--im-divider)] bg-card p-6">
        <div className="w-full max-w-xs space-y-3"><Skeleton className="h-10" /><Skeleton className="h-40" /></div>
      </aside>
    )
  }

  if (!doc) {
    return (
      <aside className="grid h-full min-w-0 place-items-center border-s border-[var(--im-divider)] bg-card px-8 text-center">
        <Empty><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={File01Icon} /></EmptyMedia><EmptyTitle>文档不可用</EmptyTitle><EmptyDescription>此工件可能已被删除或移出此工作区。</EmptyDescription></EmptyHeader><Button variant="outline" onClick={closeDocumentPeek}>关闭</Button></Empty>
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
