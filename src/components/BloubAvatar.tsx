import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Participant } from '@/types'
import { getBloubIdentity, getBloubState, stableParticipantHash } from '@/lib/agentVisualState'
import { NOTIF_BLUE, type DotRender } from '@/lib/bloub/decor'
import { BotEngine, type BotFrame } from '@/lib/bloub/engine'
import { EXPRESSION_BY_ID } from '@/lib/bloub/expressions'
import { DEMI_VIEWBOX, RAYON } from '@/lib/bloub/repere'
import { COLOR_BY_ID, SHAPE_BY_ID } from '@/lib/bloub/skins'
import type { StateId } from '@/lib/bloub/states'
import { getBloubClockTime, subscribeBloubClock } from '@/lib/bloub/clock'

interface Props {
  participant: Participant
  status: string
  size: number
  paper?: string
  animated?: boolean
  className?: string
}

const STATIC_PHASE: Record<StateId, number> = {
  idle: 0.9,
  thinking: 0.8,
  wide: 0.7,
  wink: 0.7,
  notify: 0.72,
  sleep: 1.2,
  orbit: 0.82,
  comet: 0.7,
  alert: 0.7,
  exclaim: 0.7,
  egg: 0.7,
  hexagon: 0.7,
  play: 0.7,
  burst: 0.7,
  swirl: 0.7,
}

// Bloub's original 316-unit canvas leaves generous exhibition padding. Chat
// avatars are much smaller, so scale the artwork—not its containing box—to
// make the face readable without reintroducing a circular frame.
const CHAT_AVATAR_SCALE = 1.08

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ))
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return reduced
}

function useViewportVisibility() {
  const ref = useRef<SVGSVGElement | null>(null)
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { rootMargin: '120px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return { ref, visible }
}

function Dot({ dot, ink }: { dot: DotRender; ink: string }) {
  const depthOpacity = dot.depth === undefined ? 1 : 0.35 + dot.depth * 0.65
  const common = { fill: dot.color ?? ink, opacity: dot.opacity * depthOpacity }
  if (dot.d) {
    return (
      <path
        {...common}
        d={dot.d}
        transform={`translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${RAYON})`}
      />
    )
  }
  return <circle {...common} cx={dot.x} cy={dot.y} r={dot.r} />
}

/** Native React renderer for Bloub's clock-free SVG morph engine. */
export function BloubAvatar({ participant, status, size, paper = 'var(--paper)', animated = true, className }: Props) {
  const identity = useMemo(() => getBloubIdentity(participant), [participant.id, participant.role])
  const state = getBloubState(participant, status)
  const shape = SHAPE_BY_ID.get(identity.shape)?.radii ?? null
  const expression = EXPRESSION_BY_ID.get(identity.expression) ?? null
  const ink = COLOR_BY_ID.get(identity.color)?.hex ?? '#3b93f0'
  const phase = STATIC_PHASE[state] + (stableParticipantHash(participant.id) % 31) / 100
  const engine = useMemo(
    () => new BotEngine(RAYON, state, shape, expression),
    [participant.id, identity.shape, identity.expression],
  )
  const [frame, setFrame] = useState<BotFrame>(() => engine.sample(phase))
  const { ref, visible } = useViewportVisibility()
  const reducedMotion = useReducedMotion()
  const motionEnabled = animated && size >= 24 && visible && !reducedMotion
  const lastMediumFrame = useRef(-1)
  const reactId = useId()
  const uid = useMemo(() => `bloub-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [reactId])
  const maskId = `${uid}-mask`

  useEffect(() => {
    const now = getBloubClockTime()
    if (motionEnabled) {
      engine.setState(state, now)
      setFrame(engine.sample(now))
    } else {
      engine.reset(state, now - phase)
      setFrame(engine.sample(now))
    }
  }, [engine, motionEnabled, phase, state])

  useEffect(() => {
    if (!motionEnabled) return
    return subscribeBloubClock((now) => {
      // Medium avatars retain the body/eyes animation at 30fps. Large avatars
      // use every shared tick; mini/static avatars never subscribe at all.
      if (size < 40 && lastMediumFrame.current >= 0 && now - lastMediumFrame.current < 1 / 30) return
      lastMediumFrame.current = now
      setFrame(engine.sample(now))
    })
  }, [engine, motionEnabled, size])

  const dots = size < 40 && frame.dots.length > 8 ? frame.dots.slice(0, 8) : frame.dots
  const renderDots = (prefix: string) => dots.map((dot, index) => <Dot key={`${prefix}-${index}`} dot={dot} ink={ink} />)

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox={`${-DEMI_VIEWBOX} ${-DEMI_VIEWBOX} ${DEMI_VIEWBOX * 2} ${DEMI_VIEWBOX * 2}`}
      role="img"
      aria-label={`${participant.name} · ${status}`}
      className={className}
      focusable="false"
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-DEMI_VIEWBOX} y={-DEMI_VIEWBOX} width={DEMI_VIEWBOX * 2} height={DEMI_VIEWBOX * 2}>
          <path d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((eye, index) => (
            <path key={index} d={eye.d} transform={eye.matrix} opacity={eye.alpha} fill="#000" />
          ))}
          {frame.notch && <circle cx={frame.notch.x} cy={frame.notch.y} r={frame.notch.r} fill="#000" />}
        </mask>
        {frame.arcs.map((arc) => (
          <linearGradient
            key={arc.id}
            id={`${uid}-${arc.id}`}
            gradientUnits="userSpaceOnUse"
            x1={arc.grad.x1}
            y1={arc.grad.y1}
            x2={arc.grad.x2}
            y2={arc.grad.y2}
          >
            {arc.grad.stops.map((color, index) => (
              <stop key={`${color}-${index}`} offset={index / Math.max(1, arc.grad.stops.length - 1)} stopColor={color} />
            ))}
          </linearGradient>
        ))}
      </defs>

      <g transform={`scale(${CHAT_AVATAR_SCALE})`}>
        <g fill="none" strokeLinecap="round">
          {frame.arcs.map((arc) => (
            <path key={`back-${arc.id}`} d={arc.back} stroke={`url(#${uid}-${arc.id})`} strokeWidth={arc.width} opacity={arc.opacity} />
          ))}
        </g>
        {frame.dotsBehind && <g>{renderDots('behind')}</g>}
        <g opacity={frame.bodyAlpha}>
          <path d={frame.bodyPath} fill={paper} />
          <g mask={`url(#${maskId})`}>
            <rect x={-DEMI_VIEWBOX} y={-DEMI_VIEWBOX} width={DEMI_VIEWBOX * 2} height={DEMI_VIEWBOX * 2} fill={ink} />
          </g>
        </g>
        {!frame.dotsBehind && <g>{renderDots('front')}</g>}
        {frame.notif && <circle cx={frame.notif.x} cy={frame.notif.y} r={frame.notif.r} fill={NOTIF_BLUE} />}
        <g fill="none" strokeLinecap="round">
          {frame.arcs.map((arc) => (
            <path key={`front-${arc.id}`} d={arc.front} stroke={`url(#${uid}-${arc.id})`} strokeWidth={arc.width} opacity={arc.opacity} />
          ))}
        </g>
      </g>
    </svg>
  )
}
