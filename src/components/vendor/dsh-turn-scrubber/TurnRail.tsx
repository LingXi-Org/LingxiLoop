/**
 * Adapted directly from wsxwj123/dsh-plugins TurnRail.tsx, commit
 * c92ff6b61461de988cbf152bd2c6273ceb7406cc (MIT).
 * Copyright (c) 2026 wsxwj123 and dsh-plugins contributors.
 * See third_party/dsh-turn-scrubber for license, hashes and integration changes.
 */
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import css from './rail.module.css'

/** Comfortable per-line pitch when turns are few (px) — mini-map density
 *  (2px line + ~4px breathing room); compressed toward the message-area
 *  height as the cluster grows. */
const COMFORT_PITCH = 6
/** Fisheye spread: lines within this many slots of the pointer widen. */
const FISHEYE_RADIUS = 3
/** Fisheye peak: × this pitch at the pointer center (far lines compress to compensate). */
const FISHEYE_STRENGTH = 3
/** Fixed idle line length (px) — uniform, short, does NOT grow with turn
 *  count (the full-index rail can show hundreds of turns; a length that grew
 *  with count would max out and look loud). */
const LINE_LEN = 6

/**
 * Dock-style magnification by CONTINUOUS pointer distance (Gaussian falloff).
 * The hover position is fractional (line units), so the wave peak glides
 * smoothly across the cluster instead of jumping line to line.
 * @param d - signed distance from the pointer, in line units (fractional).
 */
const PEAK_SCALE = 2.4
const FALLOFF = 1.4
function waveScale(d: number): number {
  return 1 + (PEAK_SCALE - 1) * Math.exp(-(d * d) / FALLOFF)
}
function waveGlow(d: number): number {
  return 0.4 + 0.6 * Math.exp(-(d * d) / FALLOFF)
}

/** Fixed idle line length (px). */
function lineLength(): number {
  return LINE_LEN
}

export interface RailLine {
  id: string
  text: string
}

// The host supplies canonical questions and navigation; the imported component
// owns the Codex waveform, Gaussian falloff and fisheye geometry.
export function TurnRail({ lines, activeId, onNavigate, before }: {
  lines: RailLine[]
  activeId: string | null
  onNavigate: (id: string) => void
  before?: ReactNode
}) {
  const [hoverPos, setHoverPos] = useState<number | null>(null)
  const [focusPos, setFocusPos] = useState<number | null>(null)
  const [tip, setTip] = useState<number | null>(null)
  const showTimer = useRef(0)
  const hideTimer = useRef(0)
  const [box, setBox] = useState<{ height: number; seat: number } | null>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)
  const hoverTimer = useRef(0)

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const measure = () => setBox({ height: rail.clientHeight, seat: 0 })
    const observer = new ResizeObserver(measure)
    observer.observe(rail)
    measure()
    return () => { observer.disconnect(); clearTimeout(hoverTimer.current); clearTimeout(showTimer.current); clearTimeout(hideTimer.current) }
  }, [])

  // Use the reserved message-area gutter rather than the DSH absolute overlay.
  // Hooks remain mounted for empty/short sessions and history pagination.
  const effectiveBox = box ?? { height: 0, seat: 0 }
  const count = lines.length
  const width = lineLength()
  // The rail covers the MESSAGE area only (excludes the composer seat).
  const areaH = Math.max(0, effectiveBox.height - effectiveBox.seat)
  // Per-line pitch: comfortable (COMFORT_PITCH) when few turns, otherwise the
  // exact share of the message area — the full cluster ALWAYS fits and stays
  // vertically centered (never spills top-to-bottom, never mis-centers).
  const pitch = Math.min(COMFORT_PITCH, areaH / Math.max(1, count))
  // Visual line height shrinks with pitch (down to ~1px) so ultra-long
  // sessions stay a tidy strip instead of a solid block.
  const lineH = Math.min(2, pitch)
  const groupH = count * pitch
  const groupTop = Math.max(4, (areaH - groupH) / 2)

  /**
   * Fisheye offsets: with the pointer parked at `hoverPos`, the ±RADIUS lines
   * around it spread apart (STRENGTH× at the peak, Gaussian falloff) while the
   * far lines compress to compensate — total height stays exactly `count*pitch`,
   * so the cluster never overflows and stays centered, yet the lines under the
   * pointer become readable and clickable even in ultra-dense sessions.
   * @returns per-line translateY in px, or null when idle (no fisheye).
   */
  const fisheye = (hoverPos: number | null): number[] | null => {
    if (hoverPos === null) return null
    const w = new Array<number>(count)
    let total = 0
    for (let i = 0; i < count; i++) {
      const d = i - hoverPos
      const weight = Math.exp(-(d * d) / (FISHEYE_RADIUS * FISHEYE_RADIUS))
      w[i] = weight
      total += weight
    }
    const avg = total / count
    const offsets = new Array<number>(count)
    let acc = 0
    for (let i = 0; i < count; i++) {
      offsets[i] = acc * (FISHEYE_STRENGTH - 1) * pitch
      acc += w[i] - avg
    }
    return offsets
  }
  // O(n) per render — hundreds of lines is microseconds; no memo needed (and
  // hooks must not run after the early returns above).
  const offsets = fisheye(hoverPos ?? focusPos)

  /** Line index whose DISPLAYED center is nearest the viewport Y (fisheye-aware). */
  const hoverFromPointer = (clientY: number): number => {
    const top = groupRef.current?.getBoundingClientRect().top
    if (top === undefined) return 0
    const rel = clientY - top
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < count; i++) {
      const center = i * pitch + (offsets?.[i] ?? 0) + pitch / 2
      const d = Math.abs(rel - center)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best // integer slot index; wave + fisheye smooth via transitions
  }

  // Retain the source rail-level preview timers: fisheye transforms can move
  // the hovered button away from the pointer, so per-button hover is unstable.
  const enter = (frac: number): void => {
    clearTimeout(hoverTimer.current)
    setHoverPos(frac)
    const idx = Math.max(0, Math.min(count - 1, Math.round(frac)))
    clearTimeout(hideTimer.current)
    clearTimeout(showTimer.current)
    showTimer.current = window.setTimeout(() => setTip(idx), 220)
  }
  const park = (): void => {
    clearTimeout(showTimer.current)
    clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setHoverPos(null), 600)
    clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setTip(null), 120)
  }
  const keepAlive = (): void => {
    clearTimeout(hoverTimer.current)
    clearTimeout(showTimer.current)
    clearTimeout(hideTimer.current)
  }

  return <nav aria-label="提问索引" className={css.container} data-question-index data-source="dsh-turn-scrubber">
    {before}
    <div ref={railRef} className={css.rail} onMouseLeave={park}>
      <div ref={groupRef} className={css.group} style={{ top: groupTop }}
        onMouseMove={event => enter(hoverFromPointer(event.clientY))}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setFocusPos(null); park() } }}
        onKeyDown={event => {
          if (event.key === 'Escape') { clearTimeout(showTimer.current); setTip(null) }
          if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))
          event.preventDefault()
          buttons[next]?.focus()
        }}>
        {lines.map((line, i) => {
          const position = hoverPos ?? focusPos
          const d = position === null ? Infinity : i - position
          return <Tooltip key={line.id} open={tip === i}>
            <TooltipTrigger asChild>
              <button type="button" className={css.line} data-question-id={line.id}
                style={{ height: pitch, transform: `translateY(${offsets?.[i] ?? 0}px)` }}
                onClick={() => onNavigate(line.id)}
                onFocus={event => { if (event.currentTarget.matches(':focus-visible')) { keepAlive(); setHoverPos(null); setFocusPos(i); setTip(i) } }}
                aria-label={`提问 ${i + 1}：${line.text}`}
                aria-current={line.id === activeId ? 'location' : undefined}>
                <span aria-hidden="true" className={css.bar}
                  style={{ height: lineH, width: Math.round(width), transform: `scaleX(${waveScale(d)})`,
                    opacity: line.id === activeId ? 1 : waveGlow(d),
                    background: line.id === activeId || (d < 0.5 && d > -0.5) ? 'var(--foreground)' : 'var(--muted-foreground)',
                  }} />
              </button>
            </TooltipTrigger>
            <TooltipContent onPointerEnter={keepAlive} onPointerLeave={park}
              onEscapeKeyDown={() => { clearTimeout(showTimer.current); setTip(null) }} side="right" sideOffset={8} collisionPadding={12}
              className="max-w-[min(18rem,70vw)] break-words motion-reduce:animate-none">
              {line.text}
            </TooltipContent>
          </Tooltip>
        })}
      </div>
    </div>
  </nav>
}
