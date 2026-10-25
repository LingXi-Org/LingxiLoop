import { useEffect, useRef, useState } from 'react'
import { createCoverSession, type CoverWorkerPort } from './session'
import type { CoverPointer } from './geometry'
import { coverFrameSvg } from './svg'

export type CaseCoverPreviewProps = {
  program: string; altText: string; scopeKey: string; active?: boolean; reducedMotion?: boolean
  theme?: 'light' | 'dark'; pointer?: CoverPointer | null; className?: string
  onReady?: () => void; onFailure?: () => void; onError?: () => void
}

export default function CaseCoverPreview({ program, altText, scopeKey, active = true, reducedMotion = false, theme = 'light', pointer = null, className, onReady, onFailure, onError }: CaseCoverPreviewProps) {
  const [image, setImage] = useState<string>()
  const callbacks = useRef({ onReady, onFailure, onError })
  callbacks.current = { onReady, onFailure, onError }
  const environment = useRef({ reducedMotion, theme, pointer })
  environment.current = { reducedMotion, theme, pointer }
  const session = useRef<ReturnType<typeof createCoverSession> | null>(null)
  const frame = useRef<string | null>(null)
  const url = useRef<string | undefined>(undefined)
  const paint = useRef<(json: string) => void>(() => {})
  useEffect(() => {
    if (!active) return
    let live = true, timer: ReturnType<typeof setInterval> | undefined
    const clearImage = () => { if (url.current) URL.revokeObjectURL(url.current); url.current = undefined; frame.current = null; setImage(undefined) }
    const fail = () => {
      if (!live) return
      live = false; clearInterval(timer); session.current?.dispose(); session.current = null; clearImage()
      callbacks.current.onFailure?.(); callbacks.current.onError?.()
    }
    paint.current = json => {
      if (!live) return
      const next = URL.createObjectURL(new Blob([coverFrameSvg(json, environment.current.theme)], { type: 'image/svg+xml' }))
      const old = url.current; url.current = next; frame.current = json; setImage(next)
      if (old) URL.revokeObjectURL(old)
    }
    let worker: Worker | undefined
    try {
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'case-cover-vm' })
      session.current = createCoverSession({ program, scope: `${scopeKey}:${crypto.randomUUID()}`, worker: worker as unknown as CoverWorkerPort, onFrame: json => paint.current(json), onFailure: fail })
      session.current.send({ type: 'environment', visible: true, reducedMotion: environment.current.reducedMotion })
      if (environment.current.pointer) session.current.send({ type: 'pointer', kind: 'pointermove', ...environment.current.pointer })
      timer = setInterval(() => {
        if (live && !document.hidden && !environment.current.reducedMotion) session.current?.send({ type: 'tick', delta: 33 })
      }, 33)
    } catch { worker?.terminate(); fail() }
    return () => { live = false; clearInterval(timer); session.current?.dispose(); session.current = null; clearImage() }
  }, [program, scopeKey, active])
  useEffect(() => { session.current?.send({ type: 'environment', visible: active, reducedMotion }) }, [active, reducedMotion])
  useEffect(() => { if (pointer) session.current?.send({ type: 'pointer', kind: 'pointermove', ...pointer }) }, [pointer])
  useEffect(() => { if (frame.current) paint.current(frame.current) }, [theme])
  if (!image || !active) return null
  return <div className={className} role="img" aria-label={altText} style={{ touchAction: 'pan-y' }}>
    <img src={image} alt="" aria-hidden="true" draggable={false} onLoad={() => callbacks.current.onReady?.()} onError={() => callbacks.current.onFailure?.()} style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none', objectFit: 'cover', objectPosition: 'center' }} />
  </div>
}
