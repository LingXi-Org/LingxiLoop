import { useEffect, useRef } from 'react'

type Drag = { pointerId: number; x: number; initial: number; value: number; min: number; max: number; wrapper: HTMLElement }

/** Width adjustment only; Sidebar owns its offcanvas state, gap and motion. */
export function SidebarResizeHandle({ side, label, min, max, onResize, ...props }: {
  side: 'left' | 'right'
  label: string
  min: number | `${number}%`
  max: number | `${number}%`
  onResize(width: number): void
} & Omit<React.ComponentProps<'button'>, 'onResize'>) {
  const drag = useRef<Drag | null>(null)
  const width = (element: HTMLElement) => element.closest('[data-slot="sidebar-container"]')?.getBoundingClientRect().width ?? 0
  const bounds = (wrapper: HTMLElement) => {
    const available = wrapper.getBoundingClientRect().width
    const pixels = (bound: number | `${number}%`) => typeof bound === 'number' ? bound : available * Number.parseFloat(bound) / 100
    return { min: pixels(min), max: pixels(max) }
  }
  const finish = () => {
    const current = drag.current
    if (!current) return
    drag.current = null
    current.wrapper.removeAttribute('data-sidebar-resizing')
    if (current.value !== current.initial) onResize(current.value)
  }
  useEffect(() => () => {
    drag.current?.wrapper.removeAttribute('data-sidebar-resizing')
    drag.current = null
  }, [])
  return <button type="button" aria-label={label} title={label}
    className={`absolute inset-y-0 z-20 hidden w-2 touch-none cursor-col-resize items-center justify-center focus-visible:outline-2 focus-visible:outline-ring md:flex ${side === 'left' ? 'right-0' : 'left-0'}`}
    onPointerDown={event => {
      if (event.button !== 0 || drag.current) return
      const wrapper = event.currentTarget.closest<HTMLElement>('[data-slot="sidebar-wrapper"]')
      if (!wrapper) return
      const initial = width(event.currentTarget)
      drag.current = { pointerId: event.pointerId, x: event.clientX, initial, value: initial, ...bounds(wrapper), wrapper }
      wrapper.setAttribute('data-sidebar-resizing', '')
      event.currentTarget.setPointerCapture(event.pointerId)
      event.preventDefault()
    }}
    onPointerMove={event => {
      const current = drag.current
      if (!current || event.pointerId !== current.pointerId) return
      const value = Math.min(current.max, Math.max(current.min, current.initial + (event.clientX - current.x) * (side === 'left' ? 1 : -1)))
      current.value = value
      // Sidebar already uses this variable for its panel and gap. Continuous
      // geometry stays local; the owner receives one settled width on release.
      current.wrapper.style.setProperty('--sidebar-width', `${value}px`)
    }}
    onPointerUp={event => {
      if (drag.current?.pointerId !== event.pointerId) return
      finish()
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    }}
    onPointerCancel={event => { if (drag.current?.pointerId === event.pointerId) finish() }}
    onLostPointerCapture={event => { if (drag.current?.pointerId === event.pointerId) finish() }}
    onKeyDown={event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const wrapper = event.currentTarget.closest<HTMLElement>('[data-slot="sidebar-wrapper"]')
      if (!wrapper) return
      event.preventDefault()
      const limits = bounds(wrapper)
      const value = width(event.currentTarget) + (event.key === 'ArrowRight' ? 10 : -10) * (side === 'left' ? 1 : -1)
      onResize(Math.min(limits.max, Math.max(limits.min, value)))
    }} {...props}>
    <span aria-hidden="true" className="h-6 w-1 rounded-lg bg-border" />
  </button>
}
