import { useEffect, useRef, useState } from 'react'
import { slideEditorContextSchema, type SlideEditorContext } from '../../../../shared/slides-editor-context'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Button } from '@/components/ui/button'
import { userFacingError } from '@/lib/userFacingError'
import { ARTIFACT_LABELS, type ArtifactKind } from '../contracts'
import { editorGrant, editorWarming } from '../editor-preload'
import { subscribeDesignFrameReveal } from './design-frame-lifecycle'

/**
 * Each grant gets an isolated hostname: Design needs same-origin child frames,
 * and a real origin lets both editors reuse their cached code across opens.
 * No editor origin serves this application's session or API.
 */
export function ArtifactEditorFrame({ artifactId, kind, title, onEditorContext, agentWorking = false, exitPresentation = 0 }: {
  artifactId: string; kind: ArtifactKind; title: string
  onEditorContext?(context: SlideEditorContext): void
  agentWorking?: boolean
  exitPresentation?: number
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [nonce] = useState(() => crypto.randomUUID())
  const contextCallback = useRef(onEditorContext)
  contextCallback.current = onEditorContext
  const [url, setUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [designInitialized, setDesignInitialized] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const label = ARTIFACT_LABELS[kind]
  const ready = loaded && (kind !== 'design' || designInitialized)
  // Only a grant's own isolated origin may keep its origin; an editor page on
  // this application's origin stays opaque (its CSP sandboxes it as well).
  const isolated = url !== null && new URL(url, location.href).origin !== location.origin

  useEffect(() => {
    if (kind === 'design' && url && frame.current) return subscribeDesignFrameReveal(frame.current, url, {
      initialized: () => setDesignInitialized(true),
      failed: () => setError('设计编辑器资源未能加载，请重试。'),
    })
  }, [kind, url])

  useEffect(() => {
    const controller = new AbortController()
    setUrl(null)
    setLoaded(false)
    setDesignInitialized(false)
    setError('')
    // A retry asks for a new grant; an open right after intent reuses its grant
    // and lets an in-flight warm-up finish rather than downloading twice.
    Promise.all([editorGrant(artifactId, attempt > 0), editorWarming(kind)])
      .then(([grant]) => { if (!controller.signal.aborted) setUrl((grant.isolatedUrl ?? grant.url) + (kind === 'slides' ? `#workspace=${nonce}` : '')) })
      .catch((reason) => { if (!controller.signal.aborted) setError(userFacingError(reason, `${label}编辑器暂时无法打开，请重试。`)) })
    return () => controller.abort()
  }, [artifactId, attempt, kind, label, nonce])

  useEffect(() => {
    if (kind !== 'slides') return
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.nonce !== nonce || event.data?.type !== 'slides:context') return
      const parsed = slideEditorContextSchema.safeParse(event.data.context)
      if (parsed.success) {
        // A mounted editor can report its view before subresources finish.
        // iframe load alone neither proves application readiness nor lets a
        // usable Slides editor escape a hung font/image request.
        setLoaded(true)
        contextCallback.current?.(parsed.data)
      }
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [kind, nonce])

  useEffect(() => {
    if (!url || ready || error) return
    const timer = setTimeout(() => setError(`${label}编辑器尚未打开，请重试。`), 30_000)
    return () => clearTimeout(timer)
  }, [url, ready, label, error])

  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: 'slides:agent-activity', nonce, working: agentWorking }, '*')
  }, [agentWorking, loaded, nonce])
  useEffect(() => {
    if (exitPresentation) frame.current?.contentWindow?.postMessage({ type: 'slides:exit-presentation', nonce }, '*')
  }, [exitPresentation, nonce])

  if (error) return <div role="alert" className="grid h-full place-content-center gap-3 p-6 text-center">
    <p className="text-sm text-muted-foreground">{error}</p>
    <Button variant="outline" onClick={() => setAttempt((current) => current + 1)}>重试</Button>
  </div>
  return <div className="relative h-full min-h-0 w-full" data-artifact-editor={kind}>
    {!ready && <ResourceSkeleton variant="media" label={`正在打开${label}编辑器`} className="absolute inset-0" />}
    {url && <iframe
      ref={frame}
      key={url}
      src={url}
      title={`${label}编辑器：${title}`}
      sandbox={`allow-scripts ${isolated ? 'allow-same-origin ' : ''}allow-downloads allow-popups allow-modals`}
      allow="clipboard-read; clipboard-write; fullscreen"
      referrerPolicy="no-referrer"
      onLoad={() => { if (kind !== 'slides') setLoaded(true) }}
      className="h-full w-full border-0 bg-background focus-visible:outline-2 focus-visible:outline-ring"
    />}
  </div>
}
