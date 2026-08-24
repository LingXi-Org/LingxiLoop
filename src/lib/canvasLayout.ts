export interface CanvasRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasPoint {
  x: number
  y: number
}

export const CANVAS_FRAME_GAP = 48

export function canvasRectsOverlap(a: CanvasRect, b: CanvasRect, gap = 0): boolean {
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y
}

/**
 * Places a new surface without covering an existing one. The first fallback
 * intentionally follows Doop's canvas behaviour: append to the right of the
 * right-most frame. Additional lanes keep the result deterministic when a
 * preferred row is already occupied.
 */
export function findCanvasPlacement(
  existing: readonly CanvasRect[],
  size: Pick<CanvasRect, 'width' | 'height'>,
  preferred: CanvasPoint = { x: 80, y: 80 },
  gap = CANVAS_FRAME_GAP,
): CanvasPoint {
  const width = Math.max(1, Number.isFinite(size.width) ? size.width : 420)
  const height = Math.max(1, Number.isFinite(size.height) ? size.height : 300)
  const start = {
    x: Number.isFinite(preferred.x) ? Math.round(preferred.x) : 80,
    y: Number.isFinite(preferred.y) ? Math.round(preferred.y) : 80,
  }
  const free = (point: CanvasPoint) => !existing.some((rect) => canvasRectsOverlap(
    { ...point, width, height }, rect, gap,
  ))

  if (free(start)) return start

  const rightMost = existing.reduce((edge, rect) => Math.max(edge, rect.x + rect.width), start.x)
  const appended = { x: Math.round(rightMost + gap), y: start.y }
  if (free(appended)) return appended

  const xLanes = Array.from(new Set([
    start.x,
    appended.x,
    ...existing.map((rect) => Math.round(rect.x + rect.width + gap)),
  ])).sort((a, b) => a - b)
  const yLanes = Array.from(new Set([
    start.y,
    ...existing.map((rect) => Math.round(rect.y)),
    ...existing.map((rect) => Math.round(rect.y + rect.height + gap)),
  ])).sort((a, b) => a - b)

  const candidates = yLanes.flatMap((y) => xLanes.map((x) => ({ x, y })))
    .sort((a, b) => (
      Math.abs(a.x - start.x) + Math.abs(a.y - start.y)
      - Math.abs(b.x - start.x) - Math.abs(b.y - start.y)
    ))
  const lane = candidates.find(free)
  if (lane) return lane

  // Defensive fallback for pathological imported boards. This loop is
  // bounded, deterministic, and always moves away from the occupied region.
  const stepX = width + gap
  const stepY = height + gap
  for (let row = 0; row < 100; row += 1) {
    for (let column = 0; column < 100; column += 1) {
      const point = { x: start.x + column * stepX, y: start.y + row * stepY }
      if (free(point)) return point
    }
  }
  return { x: rightMost + gap, y: Math.max(start.y, ...existing.map((rect) => rect.y + rect.height + gap)) }
}
