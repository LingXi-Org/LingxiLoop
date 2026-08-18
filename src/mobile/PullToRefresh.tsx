/**
 * iOS-style pull-to-refresh wrapper.
 *
 * Visual model copied feature-by-feature from UIRefreshControl so
 * the gesture FEELS like the system one, not a generic web pull:
 *
 *   - Indicator scales + fades in together as the user pulls, from
 *     0 → 1 over the [0, ARM_PX] range. Above ARM_PX the user is in
 *     the rubber-band overshoot zone; scale stays pinned at 1.0 +
 *     a tiny tick (1.06) to make the armed threshold READ visually,
 *     not just via the haptic tick alone. The "越往下拉越清楚" cue.
 *
 *   - On release past armed: indicator springs to its parked
 *     position with deliberately UNDER-damped tuning (ζ ≈ 0.6) so
 *     it visibly lands + settles — the "elegant bouncy refresh
 *     starting" feedback the previous version was missing.
 *
 *   - While refreshing: indicator stays parked, spinner spins.
 *
 *   - On done: collapses with a critically-damped spring so it
 *     slides up out of view without overshoot (overshooting back
 *     into the list would just be visual noise).
 *
 *   - Touch routing: only takes over when the inner scroll
 *     container is already at scrollTop=0 AND the user drags
 *     downward. Below the top, normal scroll wins.
 */
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { selectionHaptic } from '@/lib/native'

const ARM_PX = 72       // distance the user has to pull to trigger
const MAX_PULL = 132    // soft cap past ARM_PX (rubber-band damped)
const PARKED_PX = ARM_PX  // where the indicator parks while refreshing

export interface PullToRefreshProps {
  /** Called when the user releases past the arm threshold. Return a
   *  promise that resolves when the refresh is done. */
  onRefresh: () => Promise<unknown>
  children: ReactNode
  className?: string
  /** Optional callback invoked with the inner scroll element once it is
   *  mounted (and again with null on unmount). Used by virtualizers like
   *  react-virtuoso, which need to attach to the actual scroll parent via
   *  `customScrollParent`. */
  onScrollerReady?: (el: HTMLDivElement | null) => void
}

export function PullToRefresh({ onRefresh, children, className, onScrollerReady }: PullToRefreshProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // Surface the scroll element to opt-in callers. Effect (not ref callback)
  // so we can fire it once per mount/unmount rather than on every render.
  useEffect(() => {
    if (!onScrollerReady) return
    onScrollerReady(scrollRef.current)
    return () => onScrollerReady(null)
  }, [onScrollerReady])
  const startY = useRef<number | null>(null)
  const armed = useRef(false)
  const pulling = useRef(false)
  const [refreshing, setRefreshing] = useState(false)
  const pull = useMotionValue(0)
  // Scale + opacity ramp together over [0, ARM_PX] so the indicator
  // grows out of the top edge as the user pulls. Past ARM_PX it
  // clamps at 1.06 — a touch larger than rest, so crossing the
  // threshold is visible AS WELL AS hapt-tactile.
  const indicatorScale = useTransform(pull, [0, ARM_PX * 0.4, ARM_PX, MAX_PULL], [0, 0.5, 1, 1.06])
  const indicatorOpacity = useTransform(pull, [0, ARM_PX * 0.25, ARM_PX], [0, 0.5, 1])
  const arrowRotation = useTransform(pull, [0, ARM_PX], [0, 180], { clamp: true })
  // Indicator slides down with the pull; start off-screen so it
  // enters from above the chrome border.
  const indicatorY = useTransform(pull, (v) => v - 36)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return
      const t = e.touches[0]
      if (!t) return
      if (el.scrollTop > 0) {
        startY.current = null
        return
      }
      startY.current = t.clientY
      pulling.current = false
      armed.current = false
    }

    const onTouchMove = (e: TouchEvent) => {
      if (refreshing || startY.current == null) return
      const t = e.touches[0]
      if (!t) return
      const dy = t.clientY - startY.current
      if (dy <= 0) return
      if (!pulling.current && dy > 4) pulling.current = true
      if (pulling.current) {
        e.preventDefault()
        // Rubber-band past ARM_PX so the user can pull further without
        // the indicator flying off-screen — UIScrollView's overscroll
        // curve.
        const capped = dy < ARM_PX ? dy : ARM_PX + Math.sqrt(dy - ARM_PX) * 10
        const clamped = Math.min(capped, MAX_PULL)
        pull.set(clamped)
        const nowArmed = clamped >= ARM_PX
        if (nowArmed !== armed.current) {
          armed.current = nowArmed
          void selectionHaptic()
        }
      }
    }

    const onTouchEnd = async () => {
      if (refreshing) return
      const wasPulling = pulling.current
      const wasArmed = armed.current
      startY.current = null
      pulling.current = false
      if (!wasPulling) return
      if (wasArmed) {
        setRefreshing(true)
        // Park the indicator at PARKED_PX with a deliberately under-
        // damped spring: stiffness 280, damping 18 → ζ ≈ 0.54, a
        // visible bounce as it lands. This is the "elegant
        // refresh-starting feedback" the prior tuning was missing.
        // mass=0.8 to keep the period short — the bounce should
        // resolve in ~250ms, not linger.
        animate(pull, PARKED_PX, {
          type: 'spring',
          stiffness: 280,
          damping: 18,
          mass: 0.8,
        })
        try {
          await onRefresh()
        } catch (err) {
          console.warn('[pull-to-refresh] onRefresh failed', err)
        }
        setRefreshing(false)
        armed.current = false
        // Collapse back to 0 critically-damped so we don't bounce
        // back DOWN into the list (would just be visual noise).
        animate(pull, 0, { type: 'spring', stiffness: 380, damping: 38, mass: 0.8 })
      } else {
        // Released without arming — snap back tidy.
        animate(pull, 0, { type: 'spring', stiffness: 380, damping: 38, mass: 0.8 })
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [onRefresh, pull, refreshing])

  return (
    <div className={`relative h-full ${className ?? ''}`}>
      {/* Indicator — `y` follows the pull so it rides the gesture,
          `scale` + `opacity` make it grow into existence as the
          user pulls deeper. */}
      <motion.div
        className="absolute left-0 right-0 top-0 z-10 flex justify-center pointer-events-none"
        style={{ y: indicatorY, opacity: indicatorOpacity }}
      >
        <motion.div
          className="grid place-items-center rounded-full bg-paper"
          style={{
            width: 36, height: 36,
            border: '1px solid var(--ink-100)',
            boxShadow: '0 6px 16px -6px rgba(10, 30, 60, 0.22), 0 2px 4px -1px rgba(10, 30, 60, 0.10)',
            scale: indicatorScale,
          }}
        >
          {refreshing ? (
            <motion.span
              key="spinner"
              className="w-4 h-4 rounded-full border-[2.5px] border-skype border-r-transparent"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }}
            />
          ) : (
            <motion.svg
              key="arrow"
              width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="var(--ink-700)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
              style={{ rotate: arrowRotation }}
            >
              <path d="M12 5v14M5 12l7 7 7-7" />
            </motion.svg>
          )}
        </motion.div>
      </motion.div>
      <motion.div
        ref={scrollRef}
        className="h-full overflow-y-auto"
        style={{ y: pull }}
      >
        {children}
      </motion.div>
    </div>
  )
}
