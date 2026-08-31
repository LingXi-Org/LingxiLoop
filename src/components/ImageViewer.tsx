import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { isElectron, isMac, trafficLightInset } from '@/lib/runtime'

// Electron's hidden titlebar (mac) is 44px tall and marked as a drag region.
// The portal renders on top of it, but the OS still treats those pixels as
// draggable — anything we put up there is unclickable. Push past the titlebar
// vertically; on mac also indent past the native traffic-light cluster so the
// filename chip doesn't crowd them.
const TOP_OFFSET = isElectron ? 56 : 20
const LEFT_OFFSET = isElectron && isMac ? trafficLightInset + 12 : 20

// `no-drag` on the modal root makes every pixel inside the viewer receive
// clicks normally, even where it overlays the titlebar's drag region.
const noDrag: CSSProperties = isElectron
  ? ({ WebkitAppRegion: 'no-drag' } as CSSProperties)
  : {}

interface ImageViewerProps {
  src: string
  name: string
  onClose: () => void
}

const MIN_SCALE = 0.1
const MAX_SCALE = 12

export function ImageViewer({ src, name, onClose }: ImageViewerProps) {
  const [scale, setScale] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 })
  const imgRef = useRef<HTMLImageElement | null>(null)

  const reset = useCallback(() => {
    setScale(1)
    setPos({ x: 0, y: 0 })
  }, [])

  const zoomBy = useCallback((factor: number) => {
    setScale((s) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s * factor)))
  }, [])

  const flashToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1600)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === '+' || e.key === '=') zoomBy(1.25)
      else if (e.key === '-' || e.key === '_') zoomBy(1 / 1.25)
      else if (e.key === '0') reset()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose, zoomBy, reset])

  // Wheel zoom anchored at cursor — the pixel under the pointer stays put as
  // scale changes, which matches native viewers (Preview, Photoshop).
  const onWheel = (e: React.WheelEvent<HTMLImageElement>) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const cx = e.clientX - (rect.left + rect.width / 2)
    const cy = e.clientY - (rect.top + rect.height / 2)
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor))
    const ratio = next / scale
    setPos({ x: pos.x + cx * (1 - ratio), y: pos.y + cy * (1 - ratio) })
    setScale(next)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    if (e.button !== 0) return
    setDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLImageElement>) => {
    if (!dragging) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    setPos({ x: dragStart.current.px + dx, y: dragStart.current.py + dy })
  }
  const onPointerUp = () => setDragging(false)

  const download = async () => {
    try {
      const res = await fetch(src)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name || '图片'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      flashToast('已下载')
    } catch {
      window.open(src, '_blank', 'noopener,noreferrer')
    }
  }

  // Clipboard image-write requires PNG on Chromium; convert via <canvas> if
  // the source is JPEG/WebP/etc. Falls back to copying the URL as a string.
  const copy = async () => {
    try {
      const res = await fetch(src)
      const blob = await res.blob()
      const pngBlob = blob.type === 'image/png' ? blob : await toPng(blob)
      // ClipboardItem and navigator.clipboard.write may be missing in older
      // environments (or in non-secure contexts) — guard before using.
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
        flashToast('已复制')
        return
      }
      throw new Error('Clipboard API unavailable')
    } catch {
      try {
        await navigator.clipboard.writeText(src)
        flashToast('图片地址已复制')
      } catch {
        flashToast('复制失败')
      }
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="fixed inset-0 top-0 left-0 z-[1000] flex h-screen max-h-none w-screen max-w-none translate-x-0 translate-y-0 select-none items-center justify-center rounded-none bg-foreground/95 p-0 text-background ring-0 backdrop-blur-sm"
        style={noDrag}
        onClick={onClose}
      >
      <DialogTitle className="sr-only">预览 {name}</DialogTitle>
      <img
        ref={imgRef}
        src={src}
        alt={name}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          e.stopPropagation()
          if (scale === 1) zoomBy(2)
          else reset()
        }}
        style={{
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
          transition: dragging ? 'none' : 'transform 0.12s ease-out',
          maxWidth: '92vw',
          maxHeight: '88vh',
          cursor: dragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          touchAction: 'none',
          willChange: 'transform',
        }}
      />

      <Toolbar
        scale={scale}
        onZoomIn={() => zoomBy(1.25)}
        onZoomOut={() => zoomBy(1 / 1.25)}
        onReset={reset}
        onCopy={copy}
        onDownload={download}
        onClose={onClose}
      />

      {name && (
        // No pill background — the chip's bg + internal padding made the
        // text read as centered. Bare text on the dark backdrop reads
        // unambiguously left-aligned and removes the visual "indent".
        <div
          className="absolute max-w-[min(50vw,520px)] truncate py-1 font-mono text-[12.5px] text-background/90"
          style={{
            top: TOP_OFFSET,
            left: LEFT_OFFSET,
            textShadow: '0 1px 2px rgba(0,0,0,0.6)',
            ...noDrag,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {name}
        </div>
      )}

      {toast && (
        <div
          className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-background px-3.5 py-1.5 text-[12.5px] text-foreground shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {toast}
        </div>
      )}
      </DialogContent>
    </Dialog>
  )
}

function Toolbar({
  scale, onZoomIn, onZoomOut, onReset, onCopy, onDownload, onClose,
}: {
  scale: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  onCopy: () => void
  onDownload: () => void
  onClose: () => void
}) {
  return (
    <div
      className="absolute flex items-center gap-0.5 rounded-full bg-background/90 px-1.5 py-1 text-foreground shadow-lg backdrop-blur-md"
      style={{ top: TOP_OFFSET, right: 20, ...noDrag }}
      onClick={(e) => e.stopPropagation()}
    >
      <ToolBtn title="缩小 (−)" onClick={onZoomOut}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </ToolBtn>
      <span className="w-12 select-none text-center font-mono text-[11px] tabular-nums text-foreground">
        {Math.round(scale * 100)}%
      </span>
      <ToolBtn title="放大 (+)" onClick={onZoomIn}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </ToolBtn>
      <ToolBtn title="重置 (0)" onClick={onReset}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
        </svg>
      </ToolBtn>
      <Sep />
      <ToolBtn title="复制图像" onClick={onCopy}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </ToolBtn>
      <ToolBtn title="下载" onClick={onDownload}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </ToolBtn>
      <Sep />
      <ToolBtn title="关闭（Esc）" onClick={onClose}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </ToolBtn>
    </div>
  )
}

function ToolBtn({ children, title, onClick }: {
  children: React.ReactNode
  title: string
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="size-8 rounded-full text-foreground hover:bg-accent hover:text-accent-foreground"
    >
      {children}
    </Button>
  )
}

function Sep() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
}

async function toPng(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d unavailable')
    ctx.drawImage(img, 0, 0)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
