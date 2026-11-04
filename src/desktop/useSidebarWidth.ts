import { useEffect, useRef, useState } from 'react'
import { usePanelRef, type LayoutChangedMeta } from 'react-resizable-panels'

const DESKTOP_SIDEBAR_WIDTH_KEY = 'lingxiloop:desktop-layout:sidebar-width:v1'
export const LEFT_COLUMN_DEFAULT = 300
export const LEFT_COLUMN_MIN = 260
export const LEFT_COLUMN_MAX = 360
const clamp = (width: number) => Math.min(LEFT_COLUMN_MAX, Math.max(LEFT_COLUMN_MIN, width))

function loadSidebarWidth(): number {
  if (typeof window === 'undefined') return LEFT_COLUMN_DEFAULT
  try {
    const stored = window.localStorage.getItem(DESKTOP_SIDEBAR_WIDTH_KEY)
    const width = stored === null ? LEFT_COLUMN_DEFAULT : Number(stored)
    return Number.isFinite(width) ? clamp(width) : LEFT_COLUMN_DEFAULT
  } catch { return LEFT_COLUMN_DEFAULT }
}

/** The native Panel owns live geometry; only completed user gestures persist it. */
export function useSidebarWidth() {
  const panelRef = usePanelRef()
  const [width, setWidth] = useState(loadSidebarWidth)
  const pending = useRef<number | null>(null)
  useEffect(() => () => { if (pending.current !== null) cancelAnimationFrame(pending.current) }, [])
  const onLayoutChanged = (_layout: Record<string, number>, meta: LayoutChangedMeta) => {
    if (!meta.isUserInteraction) return
    // 4.12.3 emits a keyboard layout commit before its Panel DOM is updated.
    // Its public inPixels getter reads that DOM, so sample after React commits.
    if (pending.current !== null) cancelAnimationFrame(pending.current)
    pending.current = requestAnimationFrame(() => {
      pending.current = null
      const current = panelRef.current?.getSize().inPixels
      if (current === undefined || !Number.isFinite(current)) return
      const settled = clamp(Math.round(current))
      setWidth(settled)
      try { window.localStorage.setItem(DESKTOP_SIDEBAR_WIDTH_KEY, String(settled)) }
      catch { /* private browsing can deny storage access */ }
    })
  }
  return { width, panelRef, onLayoutChanged }
}
