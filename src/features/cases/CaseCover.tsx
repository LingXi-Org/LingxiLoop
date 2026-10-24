import { useEffect, useRef, useState } from 'react'
import { http } from '@/api/core/http'
import { useTheme } from '@/stores/theme'
import { caseCoverBudget, coverAssetPath, coverSandboxDocument, isCoverMessage } from './cover/sandbox'

/** Structurally matches the server-selected descriptor; never selects draft/published in the browser. */
export interface CaseCoverDescriptor {
  schemaVersion: 1
  status: 'pending' | 'generating' | 'ready' | 'failed' | 'cancelled'
  fingerprint: string
  generation: number
  alt: string | null
  previewUrl: string | null
  interactiveUrl: string | null
  canRetry: boolean
}
export function caseCoverIdentity(cover?: CaseCoverDescriptor | null) {
  return cover ? `${cover.fingerprint}:${cover.generation}:${cover.previewUrl ?? ''}:${cover.interactiveUrl ?? ''}` : 'original'
}
export function caseCoverPending(cover?: CaseCoverDescriptor | null) {
  return cover?.status === 'pending' || cover?.status === 'generating'
}

function useMedia(query: string) {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}

export function CaseCover({ cover, fallbackUrl, title, scopeKey, className = '', onRetry }: {
  cover?: CaseCoverDescriptor | null
  fallbackUrl?: string | null
  title: string
  /** Includes authenticated user and organization; a change destroys old sandbox/fetches. */
  scopeKey: string
  className?: string
  onRetry?: (cover: CaseCoverDescriptor) => Promise<unknown>
}) {
  const identity = `${scopeKey}:${caseCoverIdentity(cover)}:${fallbackUrl ?? ''}`
  return <ScopedCaseCover key={identity} {...{ cover, fallbackUrl, title, className, onRetry }} />
}

function ScopedCaseCover({ cover, fallbackUrl, title, className, onRetry }: Omit<Parameters<typeof CaseCover>[0], 'scopeKey'>) {
  const { theme } = useTheme()
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)')
  const finePointer = useMedia('(hover: hover) and (pointer: fine)')
  const container = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [visible, setVisible] = useState(false)
  const [foreground, setForeground] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [engaged, setEngaged] = useState(false)
  const [document, setDocument] = useState('')
  const [failedInteraction, setFailedInteraction] = useState(false)
  const [failedPreview, setFailedPreview] = useState(false)
  const [failedOriginal, setFailedOriginal] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState(false)
  const retryEpoch = useRef(0)
  const [ready, setReady] = useState(false)
  const readyTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const active = visible && foreground && !reducedMotion && !failedInteraction && (hovered || engaged)
  const description = cover?.alt?.trim() || `${title}的案例封面`
  const preview = !failedPreview ? cover?.previewUrl : null
  const image = preview || (!failedOriginal ? fallbackUrl : null)
  const imageDescription = preview ? description : `${title}的案例封面`

  useEffect(() => {
    const target = container.current
    if (!target) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { threshold: 0.05 })
    observer.observe(target)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const update = () => setForeground(globalThis.document.visibilityState !== 'hidden')
    update(); globalThis.document.addEventListener('visibilitychange', update)
    return () => globalThis.document.removeEventListener('visibilitychange', update)
  }, [])
  useEffect(() => () => { retryEpoch.current += 1 }, [])
  useEffect(() => {
    if (!active || !cover?.interactiveUrl) { setDocument(''); setReady(false); return }
    const abort = new AbortController()
    const release = caseCoverBudget.acquire(() => { abort.abort(); setDocument(''); setReady(false); setEngaged(false); setHovered(false) })
    setReady(false)
    try {
      const path = coverAssetPath(cover.interactiveUrl)
      readyTimeout.current = setTimeout(() => { abort.abort(); setDocument(''); setFailedInteraction(true) }, 12_000)
      void http<unknown>(path, { signal: abort.signal }).then(payload => {
        if (!abort.signal.aborted) setDocument(coverSandboxDocument(payload))
      }).catch(() => { if (!abort.signal.aborted) setFailedInteraction(true) })
    } catch { setFailedInteraction(true) }
    return () => { abort.abort(); if (readyTimeout.current) clearTimeout(readyTimeout.current); release(); setDocument(''); setReady(false) }
  }, [active, cover?.interactiveUrl])
  useEffect(() => {
    if (!document) return
    const receive = (event: MessageEvent) => {
      if (!isCoverMessage(event, frame.current?.contentWindow ?? null)) return
      if (event.data.type === 'case-cover:error') { setFailedInteraction(true); setDocument('') }
      else { if (readyTimeout.current) clearTimeout(readyTimeout.current); setReady(true) }
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [document])
  const environment = () => frame.current?.contentWindow?.postMessage({ type: 'case-cover:environment', version: 1, theme, reducedMotion, engaged }, '*')
  useEffect(() => { if (ready) environment() }, [ready, theme, reducedMotion, engaged])
  const retry = async () => {
    if (!cover?.canRetry || !onRetry || retrying) return
    const epoch = ++retryEpoch.current
    setRetrying(true); setRetryError(false)
    try { await onRetry(cover) } catch { if (retryEpoch.current === epoch) setRetryError(true) }
    finally { if (retryEpoch.current === epoch) setRetrying(false) }
  }

  return <div className={className} data-case-cover="" data-cover-status={cover?.status ?? 'original'}>
    <div ref={container} className="relative isolate aspect-[5/4] w-full overflow-hidden rounded-md bg-muted/30"
      onPointerEnter={event => { if (finePointer && event.pointerType === 'mouse') setHovered(true) }}
      onPointerLeave={() => setHovered(false)} style={{ touchAction: 'pan-y' }}>
      {image ? <img src={image} alt={imageDescription} width={400} height={320} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-contain" onError={() => { if (preview) setFailedPreview(true); else setFailedOriginal(true) }} />
        : <div role="img" aria-label={description} className="flex h-full items-center justify-center text-xs text-muted-foreground">案例封面</div>}
      {document && <iframe ref={frame} title={`${description}（交互）`} srcDoc={document} sandbox="allow-scripts" referrerPolicy="no-referrer" tabIndex={-1} aria-hidden="true" onLoad={environment}
        className="absolute inset-0 h-full w-full border-0" style={{ opacity: ready ? 1 : 0, pointerEvents: finePointer && ready ? 'auto' : 'none', touchAction: 'pan-y' }} />}
      {cover?.interactiveUrl && !reducedMotion && !failedInteraction && <button type="button" aria-label={`交互封面：${title}`} aria-pressed={engaged} onClick={() => setEngaged(value => !value)}
        className="absolute bottom-1 end-1 z-10 rounded bg-background/90 px-2 py-1 text-xs text-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{engaged ? '静止' : '交互'}</button>}
    </div>
    {caseCoverPending(cover) && <span className="sr-only" role="status">封面正在生成，完成后自动更新。</span>}
    {cover?.status === 'failed' && cover.canRetry && onRetry && <div className="mt-1 text-xs text-muted-foreground"><span>封面暂未生成。</span><button type="button" disabled={retrying} onClick={() => void retry()} className="ms-1 rounded underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">{retrying ? '正在重试…' : '重试封面'}</button>{retryError && <span role="status">重试失败，请稍后再试。</span>}</div>}
  </div>
}
