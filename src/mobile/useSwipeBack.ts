/**
 * iOS-style swipe-back gesture for mobile screens.
 *
 * Custom touch-driven drag — NOT framer-motion's `drag` prop. Reason:
 * framer-motion's drag goes through Pointer Events, has its own
 * direction-lock / activation-threshold machinery, and routes updates
 * through its internal animation pipeline. On iOS WKWebView, all of
 * that adds a few frames of latency between finger and layer, and a
 * tracking offset that we couldn't shake.
 *
 * What this hook does instead:
 *
 *   - Attaches raw `touchstart` / `touchmove` / `touchend` listeners
 *     to the target element via a ref. No pointer events, no
 *     synthetic React events — just native touch with the touchmove
 *     listener registered `{ passive: false }` so we can claim the
 *     gesture for horizontal pans.
 *   - On the first significant move (>8px), commits to a direction.
 *     Vertical → release, let the browser scroll natively. Horizontal
 *     → claim, preventDefault, and write the finger's x-offset
 *     straight to a MotionValue with `x.set(dx)`. That MV is bound
 *     to the layer's transform via `style.x` and updated subscribers
 *     run on the next animation frame — same path framer-motion uses,
 *     just without its drag layer in the middle.
 *   - Tracks per-event velocity in px/s so the release decision and
 *     the cancel-spring both have a real velocity to work with.
 *   - On release: commit (call onBack — AnimatePresence handles the
 *     remaining exit slide) or cancel (spring x back to 0, seeded
 *     with the release velocity for continuity).
 *
 * Coexistence with AnimatePresence: the same motion.div still has
 * `initial / animate / exit` from AnimatePresence for entry/exit
 * animations. Those animations write to the SAME MotionValue we drag
 * (because `style.x` is the MV). When the user starts a fresh touch
 * mid-animation, we call `x.stop()` first to kill the in-flight
 * animation; our drag then has clean ownership of the value.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { animate, useMotionValue, type MotionValue } from 'framer-motion'

const COMMIT_FRACTION = 1 / 3
const COMMIT_VELOCITY = 500 // px/s
const DIRECTION_THRESHOLD = 8 // px before direction commits

export interface SwipeBackBundle {
  /** Bind to the SAME motion.div this hook controls. Tracks the
   *  layer's x offset during drag AND while AnimatePresence runs its
   *  enter / exit transitions. Pass to `useTransform` to derive a
   *  parallax offset for the layer underneath. */
  x: MotionValue<number>
  /** Spread on the SAME `<motion.div>` AnimatePresence is animating
   *  in/out. Includes the ref the hook needs and the style hookups. */
  props: {
    ref: (el: HTMLDivElement | null) => void
    style: {
      x: MotionValue<number>
      willChange: 'transform'
      touchAction: 'pan-y'
    }
  }
}

export function useSwipeBackProps(onBack: () => void): SwipeBackBundle {
  const x = useMotionValue(0)
  // State-backed ref so unmount + remount of the wrapped element (e.g.
  // AnimatePresence un/remounts the chat overlay each time the user
  // enters/exits a conversation) re-runs the listener-binding effect.
  // A plain useRef wouldn't trigger an effect re-run.
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const refCb = useCallback((node: HTMLDivElement | null) => setEl(node), [])
  // Keep `onBack` reachable from inside the listener without forcing
  // a listener re-bind every time the parent re-renders.
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack

  useEffect(() => {
    if (!el) return

    let startX = 0
    let startY = 0
    let direction: 'none' | 'horizontal' | 'vertical' = 'none'
    let prevX = 0
    let prevTime = 0
    let velocity = 0
    let active = false

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      // Kill any in-flight animation on the MV so the drag has clean
      // ownership of the value from frame one.
      x.stop()
      startX = t.clientX
      startY = t.clientY
      prevX = startX
      prevTime = e.timeStamp
      direction = 'none'
      velocity = 0
      active = true
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!active) return
      const t = e.touches[0]
      if (!t) return
      const dx = t.clientX - startX
      const dy = t.clientY - startY

      // Direction commit — wait until either axis crosses the
      // threshold, then lock to whichever dominates. This is what
      // distinguishes a "scroll the chat" gesture from a "swipe-back"
      // gesture without delaying the actual drag once committed.
      if (direction === 'none') {
        const adx = Math.abs(dx)
        const ady = Math.abs(dy)
        if (adx < DIRECTION_THRESHOLD && ady < DIRECTION_THRESHOLD) return
        direction = adx > ady ? 'horizontal' : 'vertical'
        // Vertical-dominant → release; the browser's native scroll
        // takes over from here (we never called preventDefault).
        if (direction === 'vertical') {
          active = false
          return
        }
      }

      // Horizontal — only allow rightward motion (this is a
      // swipe-BACK; leftward would have no meaning).
      const offset = dx < 0 ? 0 : dx
      x.set(offset)
      // Claim the gesture so the browser doesn't try to scroll
      // horizontally or fire click on release.
      e.preventDefault()

      const now = e.timeStamp
      const dt = now - prevTime
      if (dt > 0) {
        velocity = ((t.clientX - prevX) / dt) * 1000
      }
      prevX = t.clientX
      prevTime = now
    }

    const onTouchEnd = () => {
      if (!active) {
        // We released ownership early (vertical commit). Nothing to do.
        return
      }
      active = false
      if (direction !== 'horizontal') return
      const w = window.innerWidth || 390
      const cur = x.get()
      if (cur > w * COMMIT_FRACTION || velocity > COMMIT_VELOCITY) {
        // AnimatePresence will animate the exit (x: current → 100%)
        // because the conditional that mounts this layer is about to
        // become false. The exit transition spring continues from our
        // current x value, so the motion stays continuous.
        onBackRef.current()
        return
      }
      // Cancel — spring back to rest, seeded with the user's release
      // velocity so a flick that didn't quite commit pings back
      // snappily, while a slow drag oozes back. Tuning kept in sync
      // with MobileApp's slideTransition (critically damped — no
      // overshoot past x:0 on the return).
      animate(x, 0, {
        type: 'spring',
        stiffness: 320,
        damping: 38,
        mass: 1,
        velocity,
      })
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [el, x])

  return {
    x,
    props: {
      ref: refCb,
      style: {
        x,
        willChange: 'transform',
        // Let the browser handle native vertical pans (so the
        // Virtuoso list inside the chat still scrolls). We claim
        // horizontal pans in JS with preventDefault.
        touchAction: 'pan-y',
      },
    },
  }
}
