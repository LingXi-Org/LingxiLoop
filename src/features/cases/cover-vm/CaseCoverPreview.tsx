import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createCoverSession, type CoverWorkerPort } from './session'
import { coverFrameSvg } from './svg'

export type CaseCoverPreviewProps = {
  program: string; altText: string; scopeKey: string; active?: boolean; reducedMotion?: boolean
  theme?: 'light' | 'dark'; engaged?: boolean; className?: string
  onReady?: () => void; onFailure?: () => void; onError?: () => void
}

export default function CaseCoverPreview({ program, altText, scopeKey, active = true, reducedMotion = false, theme = 'light', engaged = false, className, onReady, onFailure, onError }: CaseCoverPreviewProps) {
  const [image, setImage] = useState<string>()
  const callbacks = useRef({ onReady, onFailure, onError })
  callbacks.current = { onReady, onFailure, onError }
  const environment = useRef({ reducedMotion, theme, engaged })
  environment.current = { reducedMotion, theme, engaged }
  const session = useRef<ReturnType<typeof createCoverSession> | null>(null)
  const frame = useRef<string | null>(null)
  const url = useRef<string | undefined>(undefined)
  const paint = useRef<(json: string) => void>(() => {})
  useEffect(() => {
    if (!active) return
    let live = true, ready = false, timer: ReturnType<typeof setInterval> | undefined
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
      if (!ready) { ready = true; callbacks.current.onReady?.() }
    }
    let worker: Worker | undefined
    try {
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'case-cover-vm' })
      session.current = createCoverSession({ program, scope: `${scopeKey}:${crypto.randomUUID()}`, worker: worker as unknown as CoverWorkerPort, onFrame: json => paint.current(json), onFailure: fail })
      session.current.send({ type: 'environment', visible: true, reducedMotion: environment.current.reducedMotion })
      if (environment.current.engaged) session.current.send({ type: 'pointer', kind: 'pointermove', x: 200, y: 160, pointerType: 'mouse' })
      timer = setInterval(() => {
        if (live && !document.hidden && !environment.current.reducedMotion) session.current?.send({ type: 'tick', delta: 33 })
      }, 33)
    } catch { worker?.terminate(); fail() }
    return () => { live = false; clearInterval(timer); session.current?.dispose(); session.current = null; clearImage() }
  }, [program, scopeKey, active])
  useEffect(() => { session.current?.send({ type: 'environment', visible: active, reducedMotion }) }, [active, reducedMotion])
  useEffect(() => { session.current?.send({ type: 'pointer', kind: engaged ? 'pointermove' : 'pointerleave', x: 200, y: 160, pointerType: 'mouse' }) }, [engaged])
  useEffect(() => { if (frame.current) paint.current(frame.current) }, [theme])
  const pointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    if (!box.width || !box.height) return
    const scale = Math.min(box.width / 400, box.height / 320)
    const left = box.left + (box.width - 400 * scale) / 2, top = box.top + (box.height - 320 * scale) / 2
    session.current?.send({ type: 'pointer', kind: event.type as 'pointermove' | 'pointerdown' | 'pointerleave', x: Math.max(0, Math.min(400, (event.clientX - left) / scale)), y: Math.max(0, Math.min(320, (event.clientY - top) / scale)), pointerType: event.pointerType === 'touch' || event.pointerType === 'pen' ? event.pointerType : 'mouse' })
  }
  if (!image || !active) return null
  return <div className={className} role="img" aria-label={altText} tabIndex={0} style={{ aspectRatio: '5 / 4', touchAction: 'pan-y' }} onPointerMove={pointer} onPointerDown={pointer} onPointerLeave={pointer} onFocus={() => session.current?.send({ type: 'focus', focused: true })} onBlur={() => session.current?.send({ type: 'focus', focused: false })}>
    <img src={image} alt="" aria-hidden="true" draggable={false} style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none', objectFit: 'contain' }} />
  </div>
}
