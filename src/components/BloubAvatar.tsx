import {
  useEffect,
  useId,
  useLayoutEffect,
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
import { sampleStaticPointerFrame } from '@/lib/bloub/interaction'

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
  seed?: string
  participant: BloubParticipant
  status: string
  size: number
  paper?: string
  animated?: boolean
  /** Conversation-facing chat surfaces may reflect live agent activity. */
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

const attribute = (value: string) => value.replace(/[&"<>]/g, character => `&#${character.charCodeAt(0)};`)

function dotMarkup(dot: DotRender, ink: string) {
  const depthOpacity = dot.depth === undefined ? 1 : 0.35 + dot.depth * 0.65
  const common = `fill="${attribute(dot.color ?? ink)}" opacity="${dot.opacity * depthOpacity}"`
  return dot.d
    ? `<path ${common} d="${dot.d}" transform="translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${RAYON})"/>`
    : `<circle ${common} cx="${dot.x}" cy="${dot.y}" r="${dot.r}"/>`
}

/** One frame as SVG markup. Animation paints it straight into the avatar's own
 * layer: a frame is pure geometry, so it never needs React reconciliation, and
 * 20-60 fps avatars never schedule work that would delay the rest of the app. */
export function frameMarkup(frame: BotFrame, { uid, ink, paper, size }: { uid: string; ink: string; paper: string; size: number }) {
  const maskId = `${uid}-mask`
  const dots = (size < 40 && frame.dots.length > 8 ? frame.dots.slice(0, 8) : frame.dots).map(dot => dotMarkup(dot, ink)).join('')
  const box = `x="${-DEMI_VIEWBOX}" y="${-DEMI_VIEWBOX}" width="${DEMI_VIEWBOX * 2}" height="${DEMI_VIEWBOX * 2}"`
  const arcs = (side: 'front' | 'back') => frame.arcs.map(arc => `<path d="${arc[side]}" stroke="url(#${uid}-${arc.id})" stroke-width="${arc.width}" opacity="${arc.opacity}"/>`).join('')
  return `<defs><mask id="${maskId}" maskUnits="userSpaceOnUse" ${box}><path d="${frame.bodyPath}" fill="#fff"/>`
    + frame.eyes.map(eye => `<path d="${eye.d}" transform="${eye.matrix}" opacity="${eye.alpha}" fill="#000"/>`).join('')
    + (frame.notch ? `<circle cx="${frame.notch.x}" cy="${frame.notch.y}" r="${frame.notch.r}" fill="#000"/>` : '')
    + '</mask>'
    + frame.arcs.map(arc => `<linearGradient id="${uid}-${arc.id}" gradientUnits="userSpaceOnUse" x1="${arc.grad.x1}" y1="${arc.grad.y1}" x2="${arc.grad.x2}" y2="${arc.grad.y2}">`
      + arc.grad.stops.map((color, index) => `<stop offset="${index / Math.max(1, arc.grad.stops.length - 1)}" stop-color="${attribute(color)}"/>`).join('') + '</linearGradient>').join('')
    + `</defs><g transform="scale(${CHAT_AVATAR_SCALE})"><g fill="none" stroke-linecap="round">${arcs('back')}</g>`
    + (frame.dotsBehind ? `<g>${dots}</g>` : '')
    + `<g opacity="${frame.bodyAlpha}"><path d="${frame.bodyPath}" fill="${attribute(paper)}"/><g mask="url(#${maskId})"><rect ${box} fill="${attribute(ink)}"/></g></g>`
    + (frame.dotsBehind ? '' : `<g>${dots}</g>`)
    + (frame.notif ? `<circle cx="${frame.notif.x}" cy="${frame.notif.y}" r="${frame.notif.r}" fill="${NOTIF_BLUE}"/>` : '')
    + `<g fill="none" stroke-linecap="round">${arcs('front')}</g></g>`
}

/** Native React renderer for Bloub's clock-free SVG morph engine. */
export function BloubAvatar({ participant, status, size, paper = 'var(--paper)', animated = true, mode = 'neutral', className, seed }: Props) {
  const participantIdentity = useMemo(() => getBloubIdentity(participant, seed), [participant.id, participant.role, seed])
  // Outside opted-in chat surfaces, agents deliberately present one quiet,
  // stable identity. Conversation avatars and transcript rows opt in explicitly.
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
  const lastMediumFrame = useRef(-1)
  const reactId = useId()
  const uid = useMemo(() => `bloub-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [reactId])
  const layer = useRef<SVGGElement | null>(null)
  const paint = useRef((_frame: BotFrame) => {})
  paint.current = (frame: BotFrame) => {
    if (layer.current) layer.current.innerHTML = frameMarkup(frame, { uid, ink, paper, size })
  }
  const setFrame = (frame: BotFrame) => paint.current(frame)

  useLayoutEffect(() => {
    const now = getBloubClockTime()
    const localNow = now + motionOffset
    if (motionEnabled) {
      engine.setState(state, localNow)
      setFrame(engine.sample(localNow))
    } else {
      setFrame(sampleStaticPointerFrame(engine, state, phase, null))
    }
  // Appearance inputs repaint the current pose; the painter reads them by ref.
  }, [engine, motionEnabled, motionOffset, phase, state, reducedMotion, visible, uid, ink, paper, size])

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
    if (mode !== 'chat' || !visible || reducedMotion || size < 36) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const x = Math.max(-1, Math.min(1, (event.clientX - rect.left - rect.width / 2) / (rect.width / 2)))
    const y = Math.max(-1, Math.min(1, (event.clientY - rect.top - rect.height / 2) / (rect.height / 2)))
    const look = { yaw: x * 46, pitch: -y * 34, mix: 0.86, spin: 0, wander: 0.16 }
    const now = getBloubClockTime() + motionOffset
    if (motionEnabled) engine.setLook(look, now, 0.12)
    else setFrame(sampleStaticPointerFrame(engine, state, phase, look))
  }
  const releasePointerLook = () => {
    if (mode !== 'chat' || !visible || reducedMotion || size < 36) return
    const now = getBloubClockTime() + motionOffset
    if (motionEnabled) engine.setLook(null, now, 0.38)
    else setFrame(sampleStaticPointerFrame(engine, state, phase, null))
  }

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
      <g ref={layer} />
    </svg>
  )
}
