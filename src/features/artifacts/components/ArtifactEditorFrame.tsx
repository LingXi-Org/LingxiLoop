import { useEffect, useState } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Button } from '@/components/ui/button'
import { userFacingError } from '@/lib/userFacingError'
import { artifactsApi } from '../api'
import { ARTIFACT_LABELS, type ArtifactKind } from '../contracts'

/**
 * Design needs same-origin child frames, so each grant gets an isolated hostname.
 * Slides stays opaque; neither editor origin serves this application's session or API.
 */
export function ArtifactEditorFrame({ artifactId, kind, title }: { artifactId: string; kind: ArtifactKind; title: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const label = ARTIFACT_LABELS[kind]

  useEffect(() => {
    const controller = new AbortController()
    setUrl(null)
    setLoaded(false)
    setError('')
    artifactsApi.editorGrant(artifactId, controller.signal)
      .then((grant) => setUrl(grant.url))
      .catch((reason) => { if (!controller.signal.aborted) setError(userFacingError(reason, `${label}编辑器暂时无法打开，请重试。`)) })
    return () => controller.abort()
  }, [artifactId, attempt, label])

  if (error) return <div role="alert" className="grid h-full place-content-center gap-3 p-6 text-center">
    <p className="text-sm text-muted-foreground">{error}</p>
    <Button variant="outline" onClick={() => setAttempt((current) => current + 1)}>重试</Button>
  </div>
  return <div className="relative h-full min-h-0 w-full" data-artifact-editor={kind}>
    {!loaded && <ResourceSkeleton variant="media" label={`正在打开${label}编辑器`} className="absolute inset-0" />}
    {url && <iframe
      key={url}
      src={url}
      title={`${label}编辑器：${title}`}
      sandbox={kind === 'design' ? 'allow-scripts allow-same-origin allow-downloads allow-popups allow-modals' : 'allow-scripts allow-downloads allow-popups allow-modals'}
      allow="clipboard-read; clipboard-write; fullscreen"
      referrerPolicy="no-referrer"
      onLoad={() => setLoaded(true)}
      className="h-full w-full border-0 bg-background focus-visible:outline-2 focus-visible:outline-ring"
    />}
  </div>
}
