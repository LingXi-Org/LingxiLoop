import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { http } from '@/api/core/http'
import { useTheme } from '@/stores/theme'
import { caseCoverBudget, coverAssetPath } from './cover/sandbox'

function UnavailablePreview({ onFailure }: { onFailure?: () => void }) {
  useEffect(() => { onFailure?.() }, [onFailure])
  return null
}
const CaseCoverPreview = lazy(() => import('./cover-vm/CaseCoverPreview').catch(() => ({ default: UnavailablePreview })))

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
  return <ScopedCaseCover key={identity} {...{ cover, fallbackUrl, title, className, onRetry }} scopeKey={identity} />
}

function ScopedCaseCover({ cover, fallbackUrl, title, className, onRetry, scopeKey }: Parameters<typeof CaseCover>[0]) {
  const { theme } = useTheme()
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)')
  const finePointer = useMedia('(hover: hover) and (pointer: fine)')
  const container = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [foreground, setForeground] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [engaged, setEngaged] = useState(false)
  const [program, setProgram] = useState('')
  const [failedInteraction, setFailedInteraction] = useState(false)
  const [failedPreview, setFailedPreview] = useState(false)
  const [failedOriginal, setFailedOriginal] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState(false)
  const retryEpoch = useRef(0)
  const [ready, setReady] = useState(false)
  const readyTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const interactionFailed = useCallback(() => { setFailedInteraction(true); setProgram(''); setReady(false) }, [])
  const interactionReady = useCallback(() => { if (readyTimeout.current) clearTimeout(readyTimeout.current); setReady(true) }, [])
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
    if (!active || !cover?.interactiveUrl) { setProgram(''); setReady(false); return }
    const abort = new AbortController()
    const release = caseCoverBudget.acquire(() => { abort.abort(); setProgram(''); setReady(false); setEngaged(false); setHovered(false) })
    setReady(false)
    try {
      const path = coverAssetPath(cover.interactiveUrl)
      readyTimeout.current = setTimeout(() => { abort.abort(); interactionFailed() }, 12_000)
      void http<unknown>(path, { signal: abort.signal }).then(payload => {
        if (abort.signal.aborted) return
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length !== 1
          || !Object.hasOwn(payload, 'html') || !('html' in payload) || typeof payload.html !== 'string'
          || !payload.html.length || payload.html.length > 131_072) throw new Error('invalid cover program')
        setProgram(payload.html)
      }).catch(() => { if (!abort.signal.aborted) setFailedInteraction(true) })
    } catch { setFailedInteraction(true) }
    return () => { abort.abort(); if (readyTimeout.current) clearTimeout(readyTimeout.current); release(); setProgram(''); setReady(false) }
  }, [active, cover?.interactiveUrl, interactionFailed])
  const retry = async () => {
    if (!cover?.canRetry || !onRetry || retrying) return
    const epoch = ++retryEpoch.current
    setRetrying(true); setRetryError(false)
    try { await onRetry(cover) } catch { if (retryEpoch.current === epoch) setRetryError(true) }
    finally { if (retryEpoch.current === epoch) setRetrying(false) }
  }

  return <div className={`relative ${className ?? ''}`} data-case-cover="" data-cover-status={cover?.status ?? 'original'}>
    <div ref={container} className="relative isolate aspect-[5/4] w-full overflow-hidden rounded-md bg-muted/30"
      onPointerEnter={event => { if (finePointer && event.pointerType === 'mouse') setHovered(true) }}
      onPointerLeave={() => setHovered(false)} style={{ touchAction: 'pan-y' }}>
      {image ? <img src={image} alt={imageDescription} width={400} height={320} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-contain" style={{ objectFit: preview ? 'contain' : 'cover' }} onError={() => { if (preview) setFailedPreview(true); else setFailedOriginal(true) }} />
        : <div role="img" aria-label={description} className="flex h-full items-center justify-center text-xs text-muted-foreground">案例封面</div>}
      {program && <Suspense fallback={null}><CaseCoverPreview program={program} altText={description} scopeKey={scopeKey}
        active={active} reducedMotion={reducedMotion} theme={theme} engaged={engaged} onReady={interactionReady} onFailure={interactionFailed}
        className={`absolute inset-0 h-full w-full ${ready ? '' : 'pointer-events-none'}`} /></Suspense>}
      {cover?.interactiveUrl && !reducedMotion && !failedInteraction && <button type="button" aria-label={`交互封面：${title}`} aria-pressed={engaged} onClick={() => setEngaged(value => !value)}
        className="absolute bottom-1 end-1 z-10 rounded bg-background/90 px-2 py-1 text-xs text-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{engaged ? '静止' : '交互'}</button>}
    </div>
    {caseCoverPending(cover) && <span className="sr-only" role="status">封面正在生成，完成后自动更新。</span>}
    {cover?.status === 'failed' && cover.canRetry && onRetry && <div className="absolute bottom-1 start-1 z-10 rounded bg-background/90 px-2 py-1 text-xs text-muted-foreground"><span>封面暂未生成。</span><button type="button" disabled={retrying} onClick={() => void retry()} className="ms-1 rounded underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">{retrying ? '正在重试…' : '重试封面'}</button>{retryError && <span role="status">重试失败，请稍后再试。</span>}</div>}
  </div>
}
