import { useMemo } from 'react'
import type { CanvasSnapshot } from '@/types'
import { CanvasFrameContent } from './CanvasFrameContent'

const FRAME_TYPE_LABELS = {
  markdown: '文本',
  html: '网页',
  document: '文档',
  image: '图片',
  artifact: '成果',
} as const

interface CanvasPreviewProps {
  snapshot: CanvasSnapshot | null
  title: string
  frameCount: number
}

export function CanvasPreview({ snapshot, title, frameCount }: CanvasPreviewProps) {
  const frames = useMemo(() => snapshot?.frames.filter((frame) => frame.type !== 'artifact') ?? [], [snapshot?.frames])
  const bounds = useMemo(() => {
    const surfaces = frames.map(({ x, y, width, height }) => ({ x, y, width, height }))
    if (surfaces.length === 0) return { minX: 0, minY: 0, width: 1000, height: 600 }
    const padding = 56
    const minX = Math.min(...surfaces.map((surface) => surface.x)) - padding
    const minY = Math.min(...surfaces.map((surface) => surface.y)) - padding
    const maxX = Math.max(...surfaces.map((surface) => surface.x + surface.width)) + padding
    const maxY = Math.max(...surfaces.map((surface) => surface.y + surface.height)) + padding
    return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
  }, [frames])

  const rectStyle = (rect: { x: number; y: number; width: number; height: number }) => ({
    left: `${((rect.x - bounds.minX) / bounds.width) * 100}%`,
    top: `${((rect.y - bounds.minY) / bounds.height) * 100}%`,
    width: `${(rect.width / bounds.width) * 100}%`,
    height: `${(rect.height / bounds.height) * 100}%`,
  })

  return (
    <div className="canvas-preview" aria-label={`${title}画布预览`}>
      {snapshot ? (
        <div className="absolute inset-0">
          {frames.map((frame) => (
            <div key={frame.id} className="canvas-preview-frame" style={rectStyle(frame)}>
              <div className="canvas-preview-frame-header">
                <span className="truncate">{frame.title}</span>
                <span className="opacity-55">{FRAME_TYPE_LABELS[frame.type]}</span>
              </div>
              <div className="canvas-preview-frame-content">
                <CanvasFrameContent frame={frame} preview />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <div className="canvas-preview-loading">
            {Array.from({ length: Math.max(2, Math.min(frameCount, 4)) }).map((_, index) => <span key={index} />)}
          </div>
        </div>
      )}
      <div className="canvas-preview-vignette" />
    </div>
  )
}
