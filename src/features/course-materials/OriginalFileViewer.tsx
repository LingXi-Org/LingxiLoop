import { useEffect, useMemo, useState } from 'react'
import { FilePreviewContent } from '@/components/retab/ui/file-preview-dialog'
import { http } from '@/api/core/http'
import { useAuth } from '@/stores/auth'
import { useApp } from '@/stores/app'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import type { KnowledgeSource } from '../knowledge/contracts'
import type { MaterialContext } from './data'
import { fetchMaterialOriginal, formatOriginalResourceDiagnostic, loadMaterialOriginal, originalResourceErrorMessage, type OriginalResource } from './original-resource'

export default function OriginalFileViewer({ source, context, conversationId }: { source: KnowledgeSource; context: MaterialContext; conversationId?: string }) {
  const [resource, setResource] = useState<OriginalResource | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const current = () => useAuth.getState().user?.id === context.userId && useAuth.getState().activeCompanyId === context.companyId && (!conversationId || (useApp.getState().selectedConversationId === conversationId && getWorkspaceSession()?.projectId === context.projectId))
    const unsubscribe = useAuth.subscribe(() => { if (!current()) { controller.abort(); setResource(null) } })
    const unsubscribeApp = useApp.subscribe(() => { if (!current()) { controller.abort(); setResource(null) } })
    const scopeChanged = () => { if (!current()) { controller.abort(); setResource(null) } }
    window.addEventListener('lingxiloop-workspace-changed', scopeChanged)
    setResource(null); setError('')
    void loadMaterialOriginal(context, controller.signal, {
      detail: signal => http<KnowledgeSource>(conversationId ? `/conversations/${encodeURIComponent(conversationId)}/sources/${encodeURIComponent(source.id)}` : `/projects/${encodeURIComponent(context.projectId)}/sources/${encodeURIComponent(source.id)}`, {
        signal, headers: { 'x-company-id': context.companyId, 'x-project-id': context.projectId },
      }), fetch: fetchMaterialOriginal, isCurrent: current,
      diagnostic: event => console.warn(formatOriginalResourceDiagnostic(event)),
    }).then(setResource).catch(reason => { if (!controller.signal.aborted) setError(originalResourceErrorMessage(reason)) })
    return () => { controller.abort(); unsubscribe(); unsubscribeApp(); window.removeEventListener('lingxiloop-workspace-changed', scopeChanged) }
  }, [context.companyId, context.userId, context.projectId, context.space, conversationId, source.id, source.updatedAt, attempt])
  if (error) return <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-3">{error}<Button variant="outline" onClick={() => setAttempt(value => value + 1)}>重试</Button></AlertDescription></Alert>
  if (!resource) return <ResourceSkeleton variant="detail" label="正在加载原文件" />
  return <LoadedOriginal key={attempt} resource={resource} />
}

function LoadedOriginal({ resource }: { resource: OriginalResource }) {
  const source = useMemo(() => ({ kind: 'blob' as const, ...resource, identityKey: crypto.randomUUID() }), [resource])
  return <FilePreviewContent source={source} />
}
