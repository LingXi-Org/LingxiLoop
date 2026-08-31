import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Participant } from '@/types'
import {
  getBloubIdentity,
  getBloubState,
  getWorkingEpochSeed,
  pickWorkingStateSequence,
  stableParticipantHash,
} from '@/lib/agentVisualState'
import { NOTIF_BLUE, type DotRender } from '@/lib/bloub/decor'
import { BotEngine, type BotFrame } from '@/lib/bloub/engine'
import { EXPRESSION_BY_ID } from '@/lib/bloub/expressions'
import { DEMI_VIEWBOX, RAYON } from '@/lib/bloub/repere'
import { COLOR_BY_ID, SHAPE_BY_ID } from '@/lib/bloub/skins'
import { STATE_BY_ID, type StateId } from '@/lib/bloub/states'
import { getBloubClockTime, subscribeBloubClock } from '@/lib/bloub/clock'

type BloubParticipant = Pick<Participant, 'id' | 'name' | 'role' | 'status' | 'statusUpdatedAt'>

/** Each entry into `working` advances a local epoch. Server-driven working
 *  states additionally use statusUpdatedAt, so remounts during one work spell
 *  remain stable while a new server work spell is reseeded. */
function useWorkingEpoch(participant: BloubParticipant, status: string): number {
  const epoch = useRef({ previousStatus: null as string | null, localRound: 0 })
  if (epoch.current.previousStatus !== status) {
    if (status === 'working') epoch.current.localRound += 1
    epoch.current.previousStatus = status
  }
  const serverEpoch = status === 'working' && participant.status === 'working'
    ? participant.statusUpdatedAt?.trim()
    : undefined
  return useMemo(
    () => getWorkingEpochSeed(participant.id, `${serverEpoch ?? 'local'}:${epoch.current.localRound}`),
    [participant.id, serverEpoch, epoch.current.localRound],
  )
}

/** While working, play the complete upstream montage from the epoch-seeded
 *  starting frame. Each state retains its own catalogue duration. */
function useDisplayState(workingSeed: number, status: string, baseState: StateId, motionEnabled: boolean): StateId {
  const sequence = useMemo(
    () => (status === 'working' ? pickWorkingStateSequence(workingSeed) : null),
    [status, workingSeed],
  )
  const [index, setIndex] = useState(0)
  useEffect(() => { setIndex(0) }, [sequence])
  useEffect(() => {
    if (!sequence || !motionEnabled) return
    const current = sequence[index % sequence.length]!
    const durationMs = (STATE_BY_ID.get(current)?.duration ?? 2) * 1000
    const timer = window.setTimeout(() => setIndex((i) => i + 1), durationMs)
    return () => window.clearTimeout(timer)
  }, [sequence, index, motionEnabled])
  if (!sequence) return baseState
  return sequence[index % sequence.length]!
}

interface Props {
  participant: BloubParticipant
  status: string
  size: number
  paper?: string
  animated?: boolean
  /** Only message-row avatars are allowed to reflect live agent activity. */
  mode?: 'chat' | 'neutral'
  className?: string
}

const AVATAR_STATUS_LABELS: Record<string, string> = {
  avail: '可用',
  working: '工作中',
  thinking: '思考中',
  waiting: '等待确认',
  resting: '休息中',
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
const CHAT_AVATAR_SCALE = 1.24

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
export function BloubAvatar({ participant, status, size, paper = 'var(--paper)', animated = true, mode = 'neutral', className }: Props) {
  const participantIdentity = useMemo(() => getBloubIdentity(participant), [participant.id, participant.role])
  // Outside the transcript, agents deliberately present one quiet, stable
  // identity. Live states and animation belong exclusively to Chat Panel rows.
  const identity = useMemo(() => (
    mode === 'chat' ? participantIdentity : { ...participantIdentity, expression: 'neutre' as const }
  ), [mode, participantIdentity])
  const baseState = mode === 'chat' ? getBloubState(participant, status) : 'idle'
  const shape = SHAPE_BY_ID.get(identity.shape)?.radii ?? null
  const expression = EXPRESSION_BY_ID.get(identity.expression) ?? null
  const ink = COLOR_BY_ID.get(identity.color)?.hex ?? '#3b93f0'
  const participantHash = useMemo(() => stableParticipantHash(participant.id), [participant.id])
  const workingSeed = useWorkingEpoch(participant, status)
  const { ref, visible } = useViewportVisibility()
  const reducedMotion = useReducedMotion()
  const motionEnabled = mode === 'chat' && animated && size >= 24 && visible && !reducedMotion
  const state = useDisplayState(workingSeed, status, baseState, motionEnabled)
  const phase = STATIC_PHASE[state] + (participantHash % 31) / 100
  // A shared rAF clock keeps the renderer cheap, but sampling every avatar at
  // the exact same scene time made all eyes blink and drift in lockstep. Each
  // identity gets a stable local offset so a room feels alive, not cloned.
  const motionOffset = ((participantHash >>> 8) % 1200) / 100
  const engine = useMemo(
    () => new BotEngine(RAYON, state, shape, expression),
    [participant.id, identity.shape, identity.expression],
  )
  const [frame, setFrame] = useState<BotFrame>(() => engine.sample(phase))
  const lastMediumFrame = useRef(-1)
  const reactId = useId()
  const uid = useMemo(() => `bloub-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [reactId])
  const maskId = `${uid}-mask`

  useEffect(() => {
    const now = getBloubClockTime()
    const localNow = now + motionOffset
    if (motionEnabled) {
      engine.setState(state, localNow)
      setFrame(engine.sample(localNow))
    } else {
      engine.reset(state, localNow - phase)
      setFrame(engine.sample(localNow))
    }
  }, [engine, motionEnabled, motionOffset, phase, state])

  useEffect(() => {
    if (!motionEnabled) return
    return subscribeBloubClock((now) => {
      // Tiny stacks use 20fps, ordinary chat avatars 30fps, and large profile
      // avatars the display refresh rate. Visibility gating above ensures an
      // off-screen virtual list never consumes animation work.
      const minInterval = size < 32 ? 1 / 20 : size < 48 ? 1 / 30 : 0
      if (minInterval && lastMediumFrame.current >= 0 && now - lastMediumFrame.current < minInterval) return
      lastMediumFrame.current = now
      setFrame(engine.sample(now + motionOffset))
    })
  }, [engine, motionEnabled, motionOffset, size])

  const pointEyesAtPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!motionEnabled || size < 36) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const x = Math.max(-1, Math.min(1, (event.clientX - rect.left - rect.width / 2) / (rect.width / 2)))
    const y = Math.max(-1, Math.min(1, (event.clientY - rect.top - rect.height / 2) / (rect.height / 2)))
    engine.setLook({ yaw: x * 46, pitch: -y * 34, mix: 0.86, spin: 0, wander: 0.16 }, getBloubClockTime() + motionOffset, 0.12)
  }
  const releasePointerLook = () => {
    if (!motionEnabled || size < 36) return
    engine.setLook(null, getBloubClockTime() + motionOffset, 0.38)
  }

  const dots = size < 40 && frame.dots.length > 8 ? frame.dots.slice(0, 8) : frame.dots
  const renderDots = (prefix: string) => dots.map((dot, index) => <Dot key={`${prefix}-${index}`} dot={dot} ink={ink} />)
  const motionStyle = motionEnabled ? {
    '--bloub-float-delay': `${-motionOffset}s`,
    '--bloub-float-duration': `${3.1 + (participantHash % 9) * 0.13}s`,
    '--bloub-float-lift': `${status === 'thinking' || status === 'working'
      ? (size < 32 ? 1.8 : size < 48 ? 3.2 : 4.4)
      : (size < 32 ? 0.8 : size < 48 ? 1.2 : 1.7)}px`,
    overflow: 'visible',
  } as CSSProperties : { overflow: 'visible' } as CSSProperties

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox={`${-DEMI_VIEWBOX} ${-DEMI_VIEWBOX} ${DEMI_VIEWBOX * 2} ${DEMI_VIEWBOX * 2}`}
      role="img"
      aria-label={`${participant.name} · ${AVATAR_STATUS_LABELS[status] ?? '状态更新中'}`}
      className={[className, motionEnabled ? 'bloub-avatar-alive' : ''].filter(Boolean).join(' ')}
      style={motionStyle}
      focusable="false"
      onPointerMove={pointEyesAtPointer}
      onPointerLeave={releasePointerLook}
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
