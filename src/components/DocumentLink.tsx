import { useEffect } from 'react'
import { useApp } from '@/stores/app'
import { useDocuments } from '@/stores/documents'
import { useResolvedDocumentId } from '@/lib/useArtifactId'
import { IFile } from './icons'

export function DocumentLink({ id: rawId }: { id: string }) {
  // Resolve a git-style short id (e.g. `doc_ab12`) to the full document id.
  const id = useResolvedDocumentId(rawId)
  const setView = useApp((s) => s.setView)
  const view = useApp((s) => s.view)
  const openDocumentPeek = useApp((s) => s.openDocumentPeek)
  const selectDocument = useDocuments((s) => s.select)
  const loaded = useDocuments((s) => s.loaded)
  const loadDocuments = useDocuments((s) => s.load)
  const doc = useDocuments((s) => s.list.find((d) => d.id === id))
  const label = doc?.title?.trim() || id

  useEffect(() => {
    if (!loaded) void loadDocuments()
  }, [loadDocuments, loaded])

  return (
    <a
      href={`#documents/${id}`}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        selectDocument(id)
        if (view === 'conversations') openDocumentPeek(id)
        else setView('documents')
      }}
      className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full border border-sky2-100 bg-sky2-50 px-2 py-0.5 text-[13px] font-semibold text-skype-deep no-underline transition hover:border-sky2-200 hover:bg-sky2-100"
      style={{ verticalAlign: '-0.16em' }}
      title={`Open document ${id}`}
      aria-label={`Open document ${label}`}
    >
      <IFile className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </a>
  )
}
