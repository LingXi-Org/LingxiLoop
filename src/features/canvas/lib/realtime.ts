import type { CanvasFrame } from '@/features/canvas/contracts'

export function acceptsCanvasEventTimestamp(previous: string | undefined, incoming: string): boolean {
  if (!previous) return true
  const previousMs = Date.parse(previous)
  const incomingMs = Date.parse(incoming)
  if (!Number.isFinite(previousMs) || !Number.isFinite(incomingMs)) return true
  return incomingMs >= previousMs
}

/** Realtime delivery can be reordered across Redis/WebSocket reconnects. */
export function upsertCanvasFrame(frames: CanvasFrame[], frame: CanvasFrame): CanvasFrame[] {
  const index = frames.findIndex((item) => item.id === frame.id)
  if (index < 0) return [...frames, frame]
  if (frames[index].revision > frame.revision) return frames
  const next = frames.slice()
  next[index] = frame
  return next
}
