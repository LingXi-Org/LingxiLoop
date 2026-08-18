/**
 * Pressable — the mobile-app `<button>` primitive.
 *
 * Every interactive surface in the mobile shell should be a Pressable
 * instead of a raw `<button>` so we get three things for free:
 *
 *   1. **Haptic feedback** on every tap (light by default; opt up to
 *      medium for menu-opening / commit-style taps).
 *   2. **Press-in scale**. Native iOS UIControl ramps to ~97% on
 *      press; we mimic that with `whileTap` so the user sees their
 *      tap register the instant the finger lands, before any
 *      onClick handler runs. Subtle but the single highest-leverage
 *      "feels native" cue.
 *   3. **iOS chrome hygiene** — no tap highlight, no text selection,
 *      no callout magnifier, `touch-action: manipulation` so the
 *      300ms double-tap delay doesn't reappear on individual buttons.
 *
 * Use this anywhere you'd reach for `<button>` inside `src/mobile/`.
 * Pass `as="div"` if you need to nest one Pressable inside another
 * (HTML disallows nested `<button>`); we keep the same semantics.
 */
import { motion } from 'framer-motion'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react'
import { mediumHaptic, tapHaptic } from '@/lib/native'
import { cn } from '@/lib/utils'

type Haptic = 'light' | 'medium' | 'none'

// framer-motion's `motion.button` redeclares drag-related callbacks
// (`onDrag`, `onDragStart`, etc.) with its own signatures that clash
// with the native React DOM ones. We never use HTML5 drag-and-drop on
// a Pressable, so strip those before extending.
type ButtonBase = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onDrag' | 'onDragStart' | 'onDragEnd' | 'onDragEnter' | 'onDragLeave' | 'onDragOver' | 'onDragExit' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration' | 'children'
>

export interface PressableProps extends ButtonBase {
  children?: ReactNode
  /** Haptic intensity fired on press. Default `light`. */
  haptic?: Haptic
  /** Disable the press-in scale animation (e.g. for tab bar items
   *  that have their own selection animation). */
  noScale?: boolean
  /** Scale to ramp to on press. Default 0.97 — UIKit's UIControl
   *  default. Use 0.94 for tighter / larger surfaces. */
  scale?: number
}

function fireHaptic(h: Haptic): void {
  if (h === 'none') return
  if (h === 'medium') void mediumHaptic()
  else void tapHaptic()
}

export const Pressable = forwardRef(function Pressable(
  { children, haptic = 'light', noScale = false, scale = 0.97, onPointerDown, className, type, ...rest }: PressableProps,
  ref: Ref<HTMLButtonElement>,
) {
  return (
    <motion.button
      ref={ref}
      type={type ?? 'button'}
      // Whichever handler the caller passed, we want haptics to fire
      // *first* — on pointerdown, not onClick — so the bzzt syncs
      // with the finger landing, not with the click event fired on
      // release. This is exactly how iOS UIControl behaves.
      onPointerDown={(e) => {
        fireHaptic(haptic)
        onPointerDown?.(e)
      }}
      // iOS UIControl press feel: a TIGHT opacity dim + (optional)
      // tiny scale. Critically the transition is a tween, not a
      // spring — UIControl uses an essentially-linear ramp without
      // the rebound that framer-motion's default spring gives you.
      // The spring "bounce" was reading as Material, not iOS.
      whileTap={noScale ? { opacity: 0.6 } : { scale, opacity: 0.6 }}
      transition={{ type: 'tween', duration: 0.08, ease: [0.4, 0, 0.2, 1] }}
      className={cn('select-none touch-manipulation', className)}
      style={{ WebkitTapHighlightColor: 'transparent', WebkitTouchCallout: 'none', ...rest.style }}
      {...rest}
    >
      {children}
    </motion.button>
  )
})
