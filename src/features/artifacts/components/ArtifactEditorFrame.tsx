import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ws } from '@/api/core/realtime'
import { slideEditorContextSchema, type SlideEditorContext } from '../../../../shared/slides-editor-context'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Button } from '@/components/ui/button'
import { userFacingError } from '@/lib/userFacingError'
import { ARTIFACT_LABELS, type ArtifactKind, type ArtifactEditorGrant } from '../contracts'
import { editorGrant } from '../editor-preload'
import { subscribeDesignFrameReveal } from './design-frame-lifecycle'

/**
 * Each grant gets an isolated hostname: Design needs same-origin child frames,
 * and a real origin lets both editors reuse their cached code across opens.
 * No editor origin serves this application's session or API.
 */
export function ArtifactEditorFrame({ artifactId, kind, title, onEditorContext, agentWorking = false, exitPresentation = 0, visible = true }: {
  artifactId: string; kind: ArtifactKind; title: string
  onEditorContext?(context: SlideEditorContext): void
  agentWorking?: boolean
  exitPresentation?: number
  visible?: boolean
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const session = useRef<{ id: string; kind: ArtifactKind; grant: ArtifactEditorGrant; attempt: number } | null>(null)
  const nativeReady = useRef(false)
  const [authorized, setAuthorized] = useState(false)
  const [nonce] = useState(() => crypto.randomUUID())
  const contextCallback = useRef(onEditorContext)
  contextCallback.current = onEditorContext
  const [generation, setGeneration] = useState(0)
  const [url, setUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [designInitialized, setDesignInitialized] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const label = ARTIFACT_LABELS[kind]
  nativeReady.current = loaded && (kind !== 'design' || designInitialized)
  const ready = authorized && nativeReady.current
  // Only a grant's own isolated origin may keep its origin; an editor page on
  // this application's origin stays opaque (its CSP sandboxes it as well).
  const isolated = url !== null && new URL(url, location.href).origin !== location.origin

  useEffect(() => {
    if (kind === 'design' && url && frame.current) return subscribeDesignFrameReveal(frame.current, url, {
      initialized: () => setDesignInitialized(true),
      failed: () => setError('设计编辑器资源未能加载，请重试。'),
    })
  }, [kind, url])

  // A retained document is concealed before paint while current access is
  // checked. Keep the old origin only while its original grant is still valid
  // and its access mode matches; reauthorization never extends that grant.
  useLayoutEffect(() => {
    const controller = new AbortController()
    setAuthorized(false)
    if (!visible) return () => controller.abort()
    setError('')
    const previous = session.current
    editorGrant(artifactId, attempt > 0 || previous !== null)
      .then(grant => {
        if (controller.signal.aborted) return
        const reuse = previous?.id === artifactId && previous.kind === kind
          && previous.grant.expiresAt > Date.now() && previous.grant.write === grant.write && (previous.attempt === attempt || nativeReady.current)
        if (!reuse) {
          setGeneration(value => value + 1)
          setLoaded(false)
          setDesignInitialized(false)
          session.current = { id: artifactId, kind, grant, attempt }
          setUrl((grant.isolatedUrl ?? grant.url) + (kind === 'slides' ? `#workspace=${nonce}` : ''))
        }
        setAuthorized(true)
      })
      .catch(reason => {
        if (controller.signal.aborted) return
        const status = reason && typeof reason === 'object' && 'status' in reason ? reason.status : undefined
        if ([401, 403, 404, 410].includes(Number(status))) { session.current = null; setUrl(null) }
        setError(userFacingError(reason, `${label}编辑器暂时无法打开，请重试。`))
      })
    return () => controller.abort()
  }, [artifactId, attempt, kind, label, nonce, visible])

  // Recheck the original expiry before every reveal above. A background clock
  // must not destroy an editor's potentially unconfirmed local draft.

  useEffect(() => ws.on(event => {
    if (event.type !== 'artifact.changed' || event.artifactId !== artifactId || event.kind !== 'artifact.deleted') return
    session.current = null
    setAuthorized(false)
    setUrl(null)
    setError(`${label}已删除。`)
  }), [artifactId, label])

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
        if (visible && authorized) contextCallback.current?.(parsed.data)
      }
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [kind, nonce, visible, authorized])

  useEffect(() => {
    if (!visible || !url || ready || error) return
    const timer = setTimeout(() => setError(`${label}编辑器尚未打开，请重试。`), 30_000)
    return () => clearTimeout(timer)
  }, [visible, url, ready, label, error])

  useEffect(() => {
    frame.current?.contentWindow?.postMessage(kind === 'slides'
      ? { type: 'slides:visibility', nonce, visible: visible && authorized && !error }
      : { __lingxi_editor_visibility: true, visible: visible && authorized && !error }, '*')
  }, [kind, nonce, visible, authorized, loaded, error])

  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: 'slides:agent-activity', nonce, working: agentWorking }, '*')
  }, [agentWorking, loaded, nonce])
  useEffect(() => {
    if (exitPresentation) frame.current?.contentWindow?.postMessage({ type: 'slides:exit-presentation', nonce }, '*')
  }, [exitPresentation, nonce])

  const failure = error && <div role="alert" className="grid h-full place-content-center gap-3 p-6 text-center">
    <p className="text-sm text-muted-foreground">{error}</p>
    <Button variant="outline" onClick={() => setAttempt((current) => current + 1)}>重试</Button>
  </div>
  return <div aria-hidden={!visible} inert={!visible} style={{ visibility: visible ? 'visible' : 'hidden' }} className="relative h-full min-h-0 w-full" data-artifact-editor={kind}>
    {failure}
    {!error && !ready && <ResourceSkeleton variant="media" label={`正在打开${label}编辑器`} className="absolute inset-0" />}
    {url && <iframe
      ref={frame}
      key={generation}
      src={url}
      title={`${label}编辑器：${title}`}
      sandbox={`allow-scripts ${isolated ? 'allow-same-origin ' : ''}allow-downloads allow-popups allow-modals`}
      allow="clipboard-read; clipboard-write; fullscreen"
      referrerPolicy="no-referrer"
      onLoad={() => { if (kind !== 'slides') setLoaded(true) }}
      style={{ visibility: authorized && !error ? 'visible' : 'hidden' }}
      className="h-full w-full border-0 bg-background focus-visible:outline-2 focus-visible:outline-ring"
    />}
  </div>
}
