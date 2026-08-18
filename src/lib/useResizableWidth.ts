import { useCallback, useEffect, useRef, useState } from 'react'

interface Options {
  min?: number
  max?: number
}

/** Drives a draggable sidebar: returns the current width (px) and a
 *  mousedown handler to attach to the resize grip. Width is persisted to
 *  localStorage under `storageKey` so it survives reloads / app restarts. */
export function useResizableWidth(
  storageKey: string,
  defaultWidth: number,
  { min = 220, max = 560 }: Options = {},
) {
  const clamp = useCallback(
    (v: number) => Math.max(min, Math.min(max, Math.round(v))),
    [min, max],
  )

  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return defaultWidth
    const raw = window.localStorage.getItem(storageKey)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) ? clamp(n) : defaultWidth
  })

  useEffect(() => {
    try { window.localStorage.setItem(storageKey, String(width)) }
    catch { /* private mode / quota — ignore */ }
  }, [storageKey, width])

  // Latest width in a ref so the mousemove closure doesn't go stale between
  // drags (otherwise each drag starts from the value captured at handler
  // creation, not the user's last resize).
  const widthRef = useRef(width)
  widthRef.current = width

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = widthRef.current
    const onMove = (ev: MouseEvent) => setWidth(clamp(startW + (ev.clientX - startX)))
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    // Lock the cursor + suppress text selection for the duration of the
    // drag — otherwise dragging across text in the chat pane highlights it.
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [clamp])

  return { width, onResizeStart }
}
