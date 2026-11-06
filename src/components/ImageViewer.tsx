import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

interface ImageViewerProps {
  src: string
  name: string
  onClose: () => void
  onCloseAutoFocus?: ComponentProps<typeof DialogContent>['onCloseAutoFocus']
}

const MIN_SCALE = 0.1
const MAX_SCALE = 12

export function ImageViewer({ src, name, onClose, onCloseAutoFocus }: ImageViewerProps) {
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
        onCloseAutoFocus={onCloseAutoFocus}
        className="fixed inset-0 top-0 left-0 z-[1000] flex h-screen max-h-none w-screen max-w-none translate-x-0 translate-y-0 select-none items-center justify-center overflow-hidden rounded-none border-0 bg-[rgb(18_18_17/92%)] p-0 text-white ring-0 backdrop-blur-sm sm:max-w-none"
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
      />

      <div className="absolute inset-x-0 top-0 flex h-[52px] items-center gap-2.5 pe-2.5 ps-4 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-0 flex-1 truncate text-[13.5px]">{name}</span>
        <kbd className="rounded-[5px] border border-white/20 px-[5px] font-sans text-[11.5px] text-white/55">Esc</kbd>
        <button type="button" aria-label="关闭（Esc）" title="关闭（Esc）" onClick={onClose}
          className="grid size-[34px] place-items-center rounded-[9px] text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      {toast && (
        <div
          className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-xl bg-[#1A1A19] px-3 py-2 text-[13px] text-white shadow-[0_10px_28px_rgb(20_20_18/25%)]"
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
  scale, onZoomIn, onZoomOut, onReset, onCopy, onDownload,
}: {
  scale: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  onCopy: () => void
  onDownload: () => void
}) {
  return (
    <div
      className="absolute bottom-[18px] left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl bg-white/10 p-1 text-white backdrop-blur-md"
      onClick={(e) => e.stopPropagation()}
    >
      <ToolBtn title="缩小 (−)" onClick={onZoomOut}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </ToolBtn>
      <ToolBtn title="放大 (+)" onClick={onZoomIn}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </ToolBtn>
      <ToolBtn title="重置 (0)" onClick={onReset}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
        </svg>
      </ToolBtn>
      <span className="min-w-11 select-none text-center font-mono text-[11.5px] tabular-nums text-white/80">{Math.round(scale * 100)}%</span>
      <Sep />
      <ToolBtn title="复制图像" onClick={onCopy}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </ToolBtn>
      <ToolBtn title="下载" onClick={onDownload}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
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
      className="size-[34px] rounded-[9px] text-white hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
    >
      {children}
    </Button>
  )
}

function Sep() {
  return <span className="mx-1 h-4 w-px bg-white/20" aria-hidden="true" />
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
