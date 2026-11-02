import { useRef } from 'react'

/** Width adjustment only; Sidebar owns its offcanvas state, gap and motion. */
export function SidebarResizeHandle({ side, label, min, max, onResize, ...props }: {
  side: 'left' | 'right'
  label: string
  min: number | `${number}%`
  max: number | `${number}%`
  onResize(width: number): void
} & Omit<React.ComponentProps<'button'>, 'onResize'>) {
  const drag = useRef<{ x: number; width: number } | null>(null)
  const width = (element: HTMLElement) => element.closest('[data-slot="sidebar-container"]')?.getBoundingClientRect().width ?? 0
  const change = (value: number, element: HTMLElement) => {
    const available = element.closest('[data-slot="sidebar-wrapper"]')?.getBoundingClientRect().width ?? 0
    const pixels = (bound: number | `${number}%`) => typeof bound === 'number' ? bound : available * Number.parseFloat(bound) / 100
    onResize(Math.min(pixels(max), Math.max(pixels(min), value)))
  }
  return <button type="button" aria-label={label} title={label}
    className={`absolute inset-y-0 z-20 hidden w-2 touch-none cursor-col-resize items-center justify-center focus-visible:outline-2 focus-visible:outline-ring md:flex ${side === 'left' ? 'right-0' : 'left-0'}`}
    onPointerDown={event => {
      if (event.button !== 0) return
      drag.current = { x: event.clientX, width: width(event.currentTarget) }
      event.currentTarget.setPointerCapture(event.pointerId)
      event.preventDefault()
    }}
    onPointerMove={event => {
      if (drag.current) change(drag.current.width + (event.clientX - drag.current.x) * (side === 'left' ? 1 : -1), event.currentTarget)
    }}
    onPointerUp={event => { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId) }}
    onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }}
    onKeyDown={event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      change(width(event.currentTarget) + (event.key === 'ArrowRight' ? 10 : -10) * (side === 'left' ? 1 : -1), event.currentTarget)
    }} {...props}>
    <span aria-hidden="true" className="h-6 w-1 rounded-lg bg-border" />
  </button>
}
