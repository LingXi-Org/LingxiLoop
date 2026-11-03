import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ws } from '@/api/core/realtime'
import { slideEditorContextSchema, type SlideEditorContext } from '../../../../shared/slides-editor-context'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { userFacingError } from '@/lib/userFacingError'
import { ARTIFACT_LABELS, type ArtifactKind, type ArtifactEditorGrant } from '../contracts'
import { editorGrant } from '../editor-preload'
import { subscribeDesignFrameReveal } from './design-frame-lifecycle'
import { RecoveryHandoffError, requestArtifactRecovery } from './artifact-recovery-handoff'

const denied = (reason: unknown) => [401, 403, 404, 410].includes(Number(reason && typeof reason === 'object' && 'status' in reason ? reason.status : undefined))
const releaseDownloads = (urls: Set<string>) => { for (const href of urls) URL.revokeObjectURL(href);urls.clear() }

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
  const [recoveryCopy, setRecoveryCopy] = useState<{ artifactId: string; kind: ArtifactKind; id: string; blob: Blob } | null>(null)
  const copy = useRef(recoveryCopy)
  copy.current = recoveryCopy
  const [recoveryStatus, setRecoveryStatus] = useState('')
  const [inspectionAttempt, setInspectionAttempt] = useState(0)
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [handoffBlocked, setHandoffBlocked] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState<'frame' | 'copy' | null>(null)
  const discard = useRef<typeof session.current>(null)
  const confirmedReload = useRef<typeof session.current>(null)
  const lifecycle = useRef<AbortController | null>(null)
  const downloadUrls = useRef(new Set<string>())
  const label = ARTIFACT_LABELS[kind]
  nativeReady.current = loaded && (kind !== 'design' || designInitialized)
  const ready = authorized && nativeReady.current
  // Only a grant's own isolated origin may keep its origin; an editor page on
  // this application's origin stays opaque (its CSP sandboxes it as well).
  const isolated = url !== null && new URL(url, location.href).origin !== location.origin

  useEffect(() => {
    if (kind !== 'design' || !url || !frame.current) return
    const current = frame.current
    let active = true
    const stop = subscribeDesignFrameReveal(current, url, {
      initialized: () => { if (active && frame.current === current) setDesignInitialized(true) },
      failed: () => { if (active && frame.current === current) setError('设计编辑器资源未能加载，请重试。') },
    })
    return () => { active = false;stop() }
  }, [kind, url, generation])

  // A retained document is concealed before paint while current access is
  // checked. Keep the old origin only while its original grant is still valid
  // and its access mode matches; reauthorization never extends that grant.
  useLayoutEffect(() => {
    const controller = new AbortController()
    lifecycle.current = controller
    if (copy.current && (copy.current.artifactId !== artifactId || copy.current.kind !== kind)) setRecoveryCopy(null)
    if (session.current && (session.current.id !== artifactId || session.current.kind !== kind)) releaseDownloads(downloadUrls.current)
    setAuthorized(false)
    setRecoveryBusy(false)
    setConfirmDiscard(null)
    if (!visible) return () => controller.abort()
    setError('')
    const previous = session.current
    editorGrant(artifactId, attempt > 0 || previous !== null)
      .then(async grant => {
        if (controller.signal.aborted) return
        const reuse = previous?.id === artifactId && previous.kind === kind
          && previous.grant.expiresAt > Date.now() && previous.grant.write === grant.write && (previous.attempt === attempt || nativeReady.current)
          && confirmedReload.current !== previous
        if (!reuse) {
          if (previous?.id === artifactId && previous.kind === kind && frame.current
            && (previous.grant.expiresAt <= Date.now() || previous.grant.write !== grant.write || confirmedReload.current === previous) && discard.current !== previous) {
            setHandoffBlocked(true)
            const previousUrl = (previous.grant.isolatedUrl ?? previous.grant.url) + (kind === 'slides' ? `#workspace=${nonce}` : '')
            const snapshot = await requestArtifactRecovery(frame.current, previousUrl, kind, nonce, 'snapshot', controller.signal)
            if (controller.signal.aborted) return
            if (snapshot.result === 'snapshot' && snapshot.bytes && snapshot.id) {
              if (copy.current) throw new RecoveryHandoffError('已有本地副本尚未处理。请先下载并移除该副本，再重试；原编辑器仍保留。')
              setRecoveryCopy({ artifactId, kind, id: snapshot.id, blob: new Blob([snapshot.bytes], { type: 'application/json' }) })
            } else if (snapshot.result !== 'clean') throw new RecoveryHandoffError('未能备份本地更改，原编辑器仍保留。请重试。')
          }
          discard.current = null
          confirmedReload.current = null
          setGeneration(value => value + 1)
          setLoaded(false)
          setDesignInitialized(false)
          session.current = { id: artifactId, kind, grant, attempt }
          setUrl((grant.isolatedUrl ?? grant.url) + (kind === 'slides' ? `#workspace=${nonce}` : ''))
        }
        setHandoffBlocked(false)
        setAuthorized(true)
      })
      .catch(reason => {
        if (controller.signal.aborted) return
        if (denied(reason)) { controller.abort();releaseDownloads(downloadUrls.current);session.current = null;setUrl(null);setRecoveryCopy(null);setHandoffBlocked(false) }
        setError(reason instanceof RecoveryHandoffError ? reason.message : userFacingError(reason, `${label}编辑器暂时无法打开，请重试。`))
      })
    return () => controller.abort()
  }, [artifactId, attempt, kind, label, nonce, visible])

  // Recheck the original expiry before every reveal above. A background clock
  // must not destroy an editor's potentially unconfirmed local draft.

  useEffect(() => ws.on(event => {
    if (event.type !== 'artifact.changed' || event.artifactId !== artifactId || event.kind !== 'artifact.deleted') return
    lifecycle.current?.abort()
    releaseDownloads(downloadUrls.current)
    session.current = null
    setAuthorized(false)
    setUrl(null)
    setRecoveryCopy(null)
    setError(`${label}已删除。`)
  }), [artifactId, label])

  useEffect(() => () => releaseDownloads(downloadUrls.current), [])
  useEffect(() => {
    if (!recoveryCopy) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault();event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [recoveryCopy])

  useEffect(() => {
    if (!recoveryCopy || !ready || !visible || !url || !frame.current) return
    const controller = new AbortController()
    setRecoveryStatus('')
    const inspect = async () => {
      for (let attempt = 0; attempt < 20 && !controller.signal.aborted; attempt++) {
        let status
        try { status = await requestArtifactRecovery(frame.current!, url, kind, nonce, 'status', controller.signal) }
        catch (reason) {
          if (!controller.signal.aborted && attempt < 2) continue
          throw reason
        }
        if (controller.signal.aborted) return
        if (attempt < 19 && (status.result === 'loading' || status.result === 'readonly' && session.current?.grant.write)) {
          await new Promise(resolve => setTimeout(resolve, 250));continue
        }
        if (status.result !== 'ready') { setRecoveryStatus(status.result);return }
        const result = await requestArtifactRecovery(frame.current!, url, kind, nonce, 'inspect', controller.signal, await recoveryCopy.blob.arrayBuffer())
        if (!controller.signal.aborted) setRecoveryStatus(result.result)
        return
      }
    }
    void inspect().catch(() => { if (!controller.signal.aborted) setRecoveryStatus('unavailable') })
    return () => controller.abort()
  }, [recoveryCopy, ready, visible, url, kind, nonce, inspectionAttempt])

  useEffect(() => {
    if (!recoveryCopy || !url) return
    const origin = new URL(url, location.href).origin
    const receive = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && event.origin === (origin === location.origin ? 'null' : origin)
        && event.data?.type === 'artifact:recovery-saved' && event.data.nonce === nonce && event.data.id === recoveryCopy.id && typeof event.data.exact === 'boolean') {
        if (event.data.exact) setRecoveryCopy(null)
        else setRecoveryStatus('saved-with-copy')
        // Reopen from acknowledged native files so guest preview caches and
        // history use the same authoritative version. The handoff still takes
        // another snapshot before replacement, protecting edits after the ACK.
        confirmedReload.current = session.current;setAttempt(value => value + 1)
      }
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [recoveryCopy, url, nonce])

  const actOnRecovery = async (action: 'download' | 'restore') => {
    const controller = lifecycle.current, retained = copy.current
    if (!controller || !retained || recoveryBusy) return
    setRecoveryBusy(true)
    try {
      const grant = await editorGrant(artifactId, true)
      if (controller.signal.aborted) return
      if (action === 'download') {
        const href = URL.createObjectURL(retained.blob), link = document.createElement('a')
        downloadUrls.current.add(href)
        link.href = href;link.download = `${label}-未同步副本.lingxi-recovery.json`;link.click()
        setTimeout(() => { URL.revokeObjectURL(href);downloadUrls.current.delete(href) }, 60_000)
      } else {
        if (!grant.write) { setRecoveryStatus('readonly');setAttempt(value => value + 1);return }
        if (!session.current || session.current.grant.expiresAt <= Date.now()) { setAttempt(value => value + 1);return }
        if (!frame.current || !url) return
        const result = await requestArtifactRecovery(frame.current, url, kind, nonce, 'restore', controller.signal, await retained.blob.arrayBuffer())
        if (controller.signal.aborted) return
        if (result.result === 'restored') {
          setRecoveryCopy(null);confirmedReload.current = session.current;setAttempt(value => value + 1)
        }
        else setRecoveryStatus(result.result)
      }
    } catch (reason) {
      if (controller.signal.aborted) return
      if (denied(reason)) { controller.abort();releaseDownloads(downloadUrls.current);session.current = null;setUrl(null);setRecoveryCopy(null);setAuthorized(false) }
      setError(reason instanceof RecoveryHandoffError ? reason.message : userFacingError(reason, '暂时无法处理本地副本，请重试。'))
    } finally { if (!controller.signal.aborted) setRecoveryBusy(false) }
  }

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
    {handoffBlocked && <Button variant="ghost" onClick={() => setConfirmDiscard('frame')}>放弃本地更改并重新打开</Button>}
  </div>
  return <div aria-hidden={!visible} inert={!visible} style={{ visibility: visible ? 'visible' : 'hidden' }} className="relative flex h-full min-h-0 w-full flex-col" data-artifact-editor={kind}>
    {recoveryCopy && <div role="status" className="shrink-0 border-b bg-background p-3 text-sm">
      <p>{recoveryStatus === 'pending' ? '更改已恢复，仍在等待保存；本地副本会继续保留。' : recoveryStatus === 'saved-with-copy' ? '恢复后的版本已保存，原副本仍保留供核对。' : '上次未同步的本地更改已保留在当前标签页，关闭或刷新前请先下载。'}
        {recoveryStatus === 'readonly' ? '当前仅可查看，可下载本地副本。' : recoveryStatus === 'changed' ? '服务器内容已变化，未覆盖；请下载副本后比较。' : recoveryStatus === 'incompatible' ? '版本格式不同，请先下载副本。' : ''}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={recoveryBusy} onClick={() => void actOnRecovery('download')}>下载本地副本</Button>
        {recoveryStatus === 'restorable' && <Button size="sm" disabled={recoveryBusy || !authorized} onClick={() => void actOnRecovery('restore')}>恢复并重新打开</Button>}
        {['unavailable', 'loading'].includes(recoveryStatus) && <Button size="sm" variant="outline" onClick={() => setInspectionAttempt(value => value + 1)}>重新核对</Button>}
        <Button size="sm" variant="ghost" disabled={recoveryBusy} onClick={() => setConfirmDiscard('copy')}>移除已保留副本</Button>
      </div>
    </div>}
    <div className="relative min-h-0 flex-1">
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
      onLoad={event => { if (kind !== 'slides' && event.currentTarget === frame.current) setLoaded(true) }}
      style={{ visibility: authorized && !error ? 'visible' : 'hidden' }}
      className="h-full w-full border-0 bg-background focus-visible:outline-2 focus-visible:outline-ring"
    />}
    </div>
    <AlertDialog open={visible && confirmDiscard !== null} onOpenChange={open => { if (!open) setConfirmDiscard(null) }}>
      <AlertDialogContent><AlertDialogHeader>
        <AlertDialogTitle>{confirmDiscard === 'frame' ? '放弃未同步更改？' : '移除本地副本？'}</AlertDialogTitle>
        <AlertDialogDescription>{confirmDiscard === 'frame' ? '重新打开会丢弃当前编辑器中尚未同步、也未备份的更改。若需保留，请取消并重试。' : '服务器内容不会改变。若副本仍有需要，请先下载；移除后无法从当前标签页找回。'}</AlertDialogDescription>
      </AlertDialogHeader><AlertDialogFooter>
        <AlertDialogCancel>保留</AlertDialogCancel>
        <AlertDialogAction onClick={() => {
          if (confirmDiscard === 'frame') { discard.current = session.current;setAttempt(value => value + 1) }
          else setRecoveryCopy(null)
          setConfirmDiscard(null)
        }}>{confirmDiscard === 'frame' ? '放弃并重新打开' : '移除副本'}</AlertDialogAction>
      </AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </div>
}
