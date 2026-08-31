import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { CanvasFrame, CanvasSnapshot } from '../contracts'
import { Skeleton } from '@/components/ui/skeleton'
import { CanvasFrameContent } from './CanvasFrameContent'

interface CanvasPreviewProps {
  snapshot: CanvasSnapshot | null
  title: string
  frameCount: number
  fill?: boolean
}

export function CanvasPreview({ snapshot, title, frameCount, fill = false }: CanvasPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [previewSize, setPreviewSize] = useState({ width: 620, height: 196 })
  const frames = useMemo(() => snapshot?.frames.filter((frame) => frame.type !== 'artifact') ?? [], [snapshot?.frames])
  const bounds = useMemo(() => {
    const surfaces = frames.map(({ x, y, width, height }) => ({ x, y, width, height }))
    if (surfaces.length === 0) return { minX: 0, minY: 0, width: 1000, height: 600 }
    const padding = fill ? 14 : 56
    const minX = Math.min(...surfaces.map((surface) => surface.x)) - padding
    const minY = Math.min(...surfaces.map((surface) => surface.y)) - padding
    const maxX = Math.max(...surfaces.map((surface) => surface.x + surface.width)) + padding
    const maxY = Math.max(...surfaces.map((surface) => surface.y + surface.height)) + padding
    return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
  }, [fill, frames])

  useLayoutEffect(() => {
    const preview = previewRef.current
    if (!preview || typeof ResizeObserver === 'undefined') return
    const update = () => setPreviewSize((current) => {
      const next = { width: preview.clientWidth, height: preview.clientHeight }
      return current.width === next.width && current.height === next.height ? current : next
    })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(preview)
    return () => observer.disconnect()
  }, [])

  const rectStyle = (rect: { x: number; y: number; width: number; height: number }) => ({
    left: `${((rect.x - bounds.minX) / bounds.width) * 100}%`,
    top: `${((rect.y - bounds.minY) / bounds.height) * 100}%`,
    width: `${(rect.width / bounds.width) * 100}%`,
    height: `${(rect.height / bounds.height) * 100}%`,
  })

  const htmlPreviewStyle = (frame: CanvasFrame) => {
    const displayedWidth = (frame.width / bounds.width) * previewSize.width
    const displayedHeight = (frame.height / bounds.height) * previewSize.height
    const sourceHeight = Math.max(1, frame.height)
    const scale = Math.max(0.01, Math.min(displayedWidth / frame.width, displayedHeight / sourceHeight))
    return { width: frame.width, height: sourceHeight, transform: `scale(${scale})` }
  }

  const agentColor = (frame: CanvasFrame) => snapshot?.assignments.find((assignment) => assignment.agentId === frame.updatedBy)?.color
    ?? snapshot?.assignments.find((assignment) => assignment.agentId === frame.createdBy)?.color
    ?? snapshot?.assignments.find((assignment) => assignment.activeFrameId === frame.id)?.color

  return (
    <div ref={previewRef} className="canvas-preview" style={fill ? { height: '100%', borderBottom: 0 } : undefined} aria-label={`${title}画布预览`}>
      {snapshot ? (
        <div className="absolute inset-0">
          {frames.map((frame) => (
            <div key={frame.id} className="canvas-preview-frame" style={{ ...rectStyle(frame), '--canvas-frame-accent': agentColor(frame) ?? 'var(--accent)' } as CSSProperties}>
              <div className="canvas-preview-frame-content">
                {frame.type === 'html'
                  ? <div className="canvas-preview-html-scale" style={htmlPreviewStyle(frame)}><CanvasFrameContent frame={frame} preview /></div>
                  : <CanvasFrameContent frame={frame} preview />}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <div className="canvas-preview-loading" role="status" aria-label="正在加载画布预览">
            {Array.from({ length: Math.max(2, Math.min(frameCount, 4)) }).map((_, index) => <Skeleton key={index} />)}
          </div>
        </div>
      )}
      <div className="canvas-preview-vignette" />
    </div>
  )
}
