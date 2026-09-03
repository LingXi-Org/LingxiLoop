import { ProductLogo } from '@/components/Avatar'
import { isElectron, isWindows, trafficLightInset } from '@/lib/runtime'

export function TitleBar() {
  // In Electron with hidden titleBarStyle on mac, native traffic lights land in this strip.
  // Reserve space on the left for them, and make the bar a draggable region.
  const dragStyle = isElectron
    ? { WebkitAppRegion: 'drag' as const, userSelect: 'none' as const }
    : {}

  // Three equal-flex columns so the middle cell (and therefore the title)
  // is anchored to the WINDOW's horizontal center regardless of how wide
  // the left (traffic lights) or right (workspace switcher) cells happen
  // to be. The auto middle column shrinks to the title's intrinsic width,
  // so the 1fr cells on either side balance perfectly.
  const reservedLeft = Math.max(84, trafficLightInset)
  return (
    <header
      className="grid items-center px-4 border-b border-ink-100"
      style={{
        height: isWindows ? 36 : 44,
        background: 'linear-gradient(180deg, var(--card) 0%, var(--muted) 100%)',
        gridTemplateColumns: `1fr auto 1fr`,
        ...dragStyle,
      }}
    >
      {!isElectron ? (
        <div className="flex gap-2" style={{ paddingLeft: 0 }}>
          <span className="w-3 h-3 rounded-full" style={{ background: '#FF6058', boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.1)' }} />
          <span className="w-3 h-3 rounded-full" style={{ background: '#FFBD2E', boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.1)' }} />
          <span className="w-3 h-3 rounded-full" style={{ background: '#28C940', boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.1)' }} />
        </div>
      ) : (
        // Empty cell — native traffic lights paint over this region on mac.
        // We still need at least `reservedLeft` of width so the title's 1fr
        // start can't push back to 0 (which would let the title slide under
        // the traffic lights).
        <div style={{ minWidth: reservedLeft }} />
      )}
      <div className="flex items-center justify-center gap-2 font-display font-medium text-[13px] text-ink-700 tracking-wide whitespace-nowrap">
        <ProductLogo />
        <span>LingxiLoop</span>
        {!isWindows && <em className="font-normal text-ink-500" style={{ fontStyle: 'italic' }}>— 智能助教团队的协作空间</em>}
      </div>
      <div className="flex items-center justify-end pr-2">
      </div>
    </header>
  )
}
