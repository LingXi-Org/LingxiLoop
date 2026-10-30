import { useEffect, useMemo, useState } from 'react'
import { FileViewerPreview } from '@/components/retab/ui/file-viewer'
import { detectCategory } from '@/components/retab/lib/viewer-source'
import { createViewerResource } from '@/components/retab/lib/viewer-resource'
import { clearPdfDocumentResource } from '@/components/retab/lib/pdf-document-resource'
import { clearDocxDocumentResource } from '@/components/retab/lib/docx-document-resource'
import { http } from '@/api/core/http'
import { useAuth } from '@/stores/auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import type { KnowledgeSource } from '../knowledge/contracts'
import type { MaterialContext } from './data'
import { loadMaterialOriginal, originalResourceErrorMessage, type OriginalResource } from './original-resource'

export default function OriginalFileViewer({ source, context }: { source: KnowledgeSource; context: MaterialContext }) {
  const [resource, setResource] = useState<OriginalResource | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const current = () => useAuth.getState().user?.id === context.userId && useAuth.getState().activeCompanyId === context.companyId
    const unsubscribe = useAuth.subscribe(() => { if (!current()) { controller.abort(); setResource(null) } })
    setResource(null); setError('')
    void loadMaterialOriginal(context, controller.signal, {
      detail: signal => http<KnowledgeSource>(`/projects/${encodeURIComponent(context.projectId)}/sources/${encodeURIComponent(source.id)}`, {
        signal, headers: { 'x-company-id': context.companyId, 'x-project-id': context.projectId },
      }), fetch, isCurrent: current,
    }).then(setResource).catch(reason => { if (!controller.signal.aborted) setError(originalResourceErrorMessage(reason)) })
    return () => { controller.abort(); unsubscribe() }
  }, [context.companyId, context.userId, context.projectId, context.space, source.id, source.updatedAt, attempt])
  if (error) return <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-3">{error}<Button variant="outline" onClick={() => setAttempt(value => value + 1)}>重试</Button></AlertDescription></Alert>
  if (!resource) return <ResourceSkeleton variant="detail" label="正在加载原文件" />
  return <LoadedOriginal key={attempt} resource={resource} />
}

function LoadedOriginal({ resource }: { resource: OriginalResource }) {
  const source = useMemo(() => ({ kind: 'blob' as const, ...resource, identityKey: crypto.randomUUID() }), [resource])
  const detected = detectCategory('', resource.mimeType)
  const category = detected === 'unsupported' ? undefined : detected
  useEffect(() => {
    const content = createViewerResource(source, category).content
    return () => { clearPdfDocumentResource(content); clearDocxDocumentResource(content) }
  }, [source, category])
  return <FileViewerPreview source={source} category={category} className="h-[58dvh] min-h-64 overflow-hidden rounded-lg border" />
}
