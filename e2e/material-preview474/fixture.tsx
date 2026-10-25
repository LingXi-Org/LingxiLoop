import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { FileViewerPreview, type ViewerSource } from '@/components/retab/ui/file-viewer'
import { MaterialPreview } from '@/features/course-materials/MaterialPreview'
import { materialsQueryClient } from '@/features/course-materials/queries'
import { materialMimes, materialQueryKey, type MaterialContext } from '@/features/course-materials/data'
import type { KnowledgeSource } from '@/features/knowledge/contracts'
import '@/styles/globals.css'

if (!import.meta.env.DEV) throw new Error('Synthetic development fixture only')
const format = new URLSearchParams(location.search).get('format') ?? 'pdf'
const context: MaterialContext = { companyId: 'synthetic-preview474', userId: 'synthetic-preview474', projectId: 'synthetic-preview474', space: 'private' }
const source: KnowledgeSource = {
  id: 'synthetic-zip', title: 'triangle.zip', kind: 'file', mimeType: 'application/zip', sizeBytes: 22,
  status: 'stored', stage: 'stored_only', originalUrl: null, error: null, isTruncated: false,
  visibilityScope: 'PRIVATE', ownerUserId: context.userId, createdBy: context.userId, createdVia: 'USER',
  createdAt: '2026-10-25T00:00:00Z', updatedAt: '2026-10-25T00:00:00Z',
  capabilities: { canDownload: true, canRename: true, canDelete: true }, extractedText: 'SYNTHETIC_PARSED_TEXT_ONLY',
}
// Preloaded local UI state only. No API, credentials, object storage, or authorization is exercised.
const queryKey = [...materialQueryKey(context), 'detail', source.id]
materialsQueryClient.setQueryDefaults(queryKey, { enabled: false, staleTime: Infinity, gcTime: Infinity, refetchOnMount: false })
materialsQueryClient.setQueryData(queryKey, source)
function Fixture() {
  const [viewerSource, setViewerSource] = useState<ViewerSource>()
  useEffect(() => {
    if (format === 'zip') return
    void (async () => {
      const text = format === 'csv' ? 'name,sides\nTriangle,3\nSquare,4\n' : format === 'json' ? '{"shape":"Triangle","sides":3}' : 'Triangle has three sides.'
      const blob = ['csv', 'json', 'txt'].includes(format)
        ? new Blob([text], { type: materialMimes[format] })
        : await fetch(format === 'pptx' ? '/e2e/material-preview474/synthetic-slide.pptx' : `/e2e/fixtures/course-materials/triangle.${format}`).then(response => {
          if (!response.ok) throw new Error(`fixture ${response.status}`)
          return response.blob()
        })
      setViewerSource({ kind: 'blob', blob, fileName: `triangle.${format}`, mimeType: materialMimes[format], identityKey: `synthetic-${format}` })
    })()
  }, [])
  return <main style={{ padding: 24 }}>
    <h1>Original file format acceptance: {format}</h1>
    <p>Local synthetic Blob fixtures. Backend authorization and storage are outside this harness.</p>
    {format === 'zip' ? <MaterialPreview source={source} context={context} onClose={() => {}} onDownload={() => {}} downloadBusy={false} />
      : viewerSource ? <div style={{ height: 680 }}><FileViewerPreview source={viewerSource} className="h-full overflow-hidden rounded-lg border" /></div> : <p>Loading fixture</p>}
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
