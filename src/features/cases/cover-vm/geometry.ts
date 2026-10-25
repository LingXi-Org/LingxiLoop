export type CoverPointer = { x: number; y: number; pointerType: 'mouse' | 'touch' | 'pen' }

/** Both image layers use object-fit: cover with a centered 400 × 320 canvas. */
export function coverPointerAt(clientX: number, clientY: number, box: { left: number; top: number; width: number; height: number }): CoverPointer {
  const scale = Math.max(box.width / 400, box.height / 320) || 1
  const left = box.left + (box.width - 400 * scale) / 2
  const top = box.top + (box.height - 320 * scale) / 2
  return { x: Math.max(0, Math.min(400, (clientX - left) / scale)), y: Math.max(0, Math.min(320, (clientY - top) / scale)), pointerType: 'mouse' }
}
