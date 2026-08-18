/** Thin vertical grip that sits on the right edge of a sidebar. Invisible
 *  by default — picks up a soft tint on hover/drag so the affordance is
 *  discoverable without cluttering the layout. */
export function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      aria-hidden="true"
      className="absolute top-0 right-0 z-20 h-full w-[6px] cursor-col-resize select-none group"
      // Half-overhangs the edge so the hit area straddles the visible border.
      style={{ transform: 'translateX(50%)' }}
    >
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 h-full w-px bg-transparent group-hover:bg-sky2-200 group-active:bg-sky2-300 transition-colors"
      />
    </div>
  )
}
