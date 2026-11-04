// Frozen DesktopApp ownership from 584e1141, for the pre-fix persistence control.
import { useState } from 'react'
import { usePanelRef, type LayoutChangedMeta } from 'react-resizable-panels'
const key = 'lingxiloop:desktop-layout:sidebar-width:v1'
export function useSidebarWidth() {
  const panelRef = usePanelRef()
  const [width, setWidth] = useState(() => {
    try { const stored = localStorage.getItem(key); const value = stored === null ? 300 : Number(stored); return Number.isFinite(value) ? Math.min(360, Math.max(260, value)) : 300 } catch { return 300 }
  })
  return { width, panelRef, onLayoutChanged: (_layout: Record<string, number>, meta: LayoutChangedMeta) => {
    if (!meta.isUserInteraction) return
    const value = document.querySelector<HTMLElement>('[data-panel="conversations"]')?.getBoundingClientRect().width
    if (!value) return
    const clamped = Math.min(360, Math.max(260, Math.round(value)))
    setWidth(clamped)
    try { localStorage.setItem(key, String(clamped)) } catch { /* denied storage */ }
  } }
}
