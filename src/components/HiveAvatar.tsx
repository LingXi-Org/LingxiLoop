/**
 * HiveAvatar — clusters multiple member portraits in a honeycomb tile so the
 * group's icon shows you who's actually in there at a glance.
 *
 * 1 person  → full circle (degenerate, but supported for symmetry)
 * 2 people  → side-by-side
 * 3 people  → triangle (top + 2 bottom)
 * 4 people  → 2×2 quincunx
 * 5 people  → top + 2 middle + 2 bottom
 * 6 people  → full hex ring (6 around the center)
 * 7+ people → 5 around + a "+N" tile in the 6th slot
 */
import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import type { Participant } from '@/types'
import { Avatar } from './Avatar'

interface Pos {
  /** center x (0–1, fraction of container) */
  cx: number
  /** center y (0–1, fraction of container) */
  cy: number
  /** tile diameter (0–1, fraction of container) */
  d: number
}

// All coordinates are *centers* of each tile, in fractions of the container.
// Tile diameters are tuned so neighbors lightly kiss without overlapping.
const LAYOUTS: Record<number, Pos[]> = {
  1: [{ cx: 0.5, cy: 0.5, d: 1 }],

  2: [
    { cx: 0.30, cy: 0.5, d: 0.60 },
    { cx: 0.70, cy: 0.5, d: 0.60 },
  ],

  3: [
    { cx: 0.50, cy: 0.27, d: 0.54 },
    { cx: 0.27, cy: 0.71, d: 0.54 },
    { cx: 0.73, cy: 0.71, d: 0.54 },
  ],

  4: [
    { cx: 0.275, cy: 0.275, d: 0.50 },
    { cx: 0.725, cy: 0.275, d: 0.50 },
    { cx: 0.275, cy: 0.725, d: 0.50 },
    { cx: 0.725, cy: 0.725, d: 0.50 },
  ],

  5: [
    { cx: 0.50, cy: 0.20, d: 0.42 },
    { cx: 0.22, cy: 0.45, d: 0.42 },
    { cx: 0.78, cy: 0.45, d: 0.42 },
    { cx: 0.32, cy: 0.78, d: 0.42 },
    { cx: 0.68, cy: 0.78, d: 0.42 },
  ],

  // Hex ring around the center, starting at 12 o'clock and going clockwise.
  6: hexRing(0.34, 0.40),
}

function hexRing(radius: number, tileDiameter: number): Pos[] {
  const out: Pos[] = []
  // 12 o'clock first, then clockwise every 60°.
  for (let i = 0; i < 6; i++) {
    const angle = (-90 + i * 60) * (Math.PI / 180)
    out.push({
      cx: 0.5 + radius * Math.cos(angle),
      cy: 0.5 + radius * Math.sin(angle),
      d: tileDiameter,
    })
  }
  return out
}

interface Props {
  ps: Participant[]
  /** container diameter in px */
  size?: number
  ringColor?: string
  mode?: 'chat' | 'neutral'
  className?: string
}

export function HiveAvatar({ ps, size = 44, ringColor = 'var(--cloud)', mode = 'neutral', className }: Props) {
  if (ps.length === 0) {
    return <div className={cn('rounded-full', className)} style={{ width: size, height: size, background: 'var(--ink-100)' }} />
  }

  // Single member: just render the regular avatar.
  if (ps.length === 1) {
    return <SingleTile p={ps[0]} size={size} ringColor={ringColor} mode={mode} className={className} />
  }

  const max = 6
  const visible = ps.slice(0, Math.min(ps.length, max))
  const overflow = Math.max(0, ps.length - max)
  // If there are more people than fit, the LAST tile becomes a "+N" chip
  // and we show 5 portraits + the chip (still 6 cells in the hex).
  const cells = overflow > 0 ? Math.min(6, ps.length) : visible.length
  const layout = LAYOUTS[cells] ?? LAYOUTS[6]

  const portraitCount = overflow > 0 ? cells - 1 : cells
  const tiles = visible.slice(0, portraitCount)

  return (
    <div
      className={cn('relative overflow-hidden rounded-full', className)}
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--secondary-foreground) 6%, transparent), color-mix(in srgb, var(--primary) 8%, transparent))',
        // Three-layer ring: subtle inner dark hairline (defines the circle
        // against the tiles) → solid white outer band (the "cut" the user
        // asked for) → soft drop shadow under it for depth.
        boxShadow: 'inset 0 0 0 1.5px color-mix(in srgb, var(--primary) 10%, transparent), 0 0 0 2.5px var(--background), 0 2px 6px color-mix(in srgb, var(--foreground) 10%, transparent)',
      }}
    >
      {tiles.map((p, i) => {
        const pos = layout[i]
        return (
          <Tile
            key={p.id}
            p={p}
            container={size}
            cx={pos.cx}
            cy={pos.cy}
            d={pos.d}
            ringColor={ringColor}
            mode={mode}
          />
        )
      })}
      {overflow > 0 && (
        <OverflowTile
          n={overflow}
          container={size}
          cx={layout[cells - 1].cx}
          cy={layout[cells - 1].cy}
          d={layout[cells - 1].d}
          ringColor={ringColor}
        />
      )}
    </div>
  )
}

function tileStyle(container: number, cx: number, cy: number, d: number, ringColor: string): CSSProperties {
  const px = d * container
  return {
    position: 'absolute',
    left: cx * container - px / 2,
    top: cy * container - px / 2,
    width: px,
    height: px,
    borderRadius: '999px',
    overflow: 'hidden',
    boxShadow: `0 0 0 ${Math.max(1.2, container * 0.04)}px ${ringColor}`,
  }
}

function Tile({ p, container, cx, cy, d, ringColor, mode }: {
  p: Participant
  container: number
  cx: number
  cy: number
  d: number
  ringColor: string
  mode: 'chat' | 'neutral'
}) {
  const px = d * container
  return (
    <div
      style={tileStyle(container, cx, cy, d, ringColor)}
      className="grid place-items-center"
    >
      <Avatar p={p} size={px} ringColor={ringColor} mode={mode} />
    </div>
  )
}

function OverflowTile({ n, container, cx, cy, d, ringColor }: {
  n: number
  container: number
  cx: number
  cy: number
  d: number
  ringColor: string
}) {
  const px = d * container
  const fontSize = Math.max(8, Math.round(px * 0.36))
  return (
    <div
      style={tileStyle(container, cx, cy, d, ringColor)}
      className="grid place-items-center text-ink-700 font-bold"
    >
      <div
        className="w-full h-full grid place-items-center"
        style={{ background: 'var(--ink-100)', fontSize }}
      >+{n}</div>
    </div>
  )
}

function SingleTile({ p, size, ringColor, mode, className }: {
  p: Participant
  size: number
  ringColor: string
  mode: 'chat' | 'neutral'
  className?: string
}) {
  return <Avatar p={p} size={size} ringColor={ringColor} mode={mode} className={className} />
}
