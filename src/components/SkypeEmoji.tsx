/**
 * Renders a single classic Skype emoticon as an animated CSS sprite.
 *
 * The PNG behind the scenes is a vertical strip of N transparent
 * frames; we drive a `background-position` step animation via the
 * `.skype-emoji-anim` class in globals.css and per-instance CSS vars.
 * Result: real animation + true alpha + no GIF compromise.
 *
 * Audio: when `autoPlaySound` is on (the default — used by message
 * bubbles), the first time the emoji scrolls into view we trigger a
 * one-shot play through the global sound store. Clicking the emoji
 * replays the sound. Both paths respect the global mute toggle.
 *
 * The picker uses `autoPlaySound={false}` so opening the popover
 * doesn't fire 50 sounds at once — instead the picker plays a single
 * preview at click time.
 */
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { findSkypeByKey, playSkypeSound, skypeEmojiUrl } from '@/lib/skypeEmojis'
import { useSoundStore } from '@/stores/sound'

interface Props {
  /** Catalog key (e.g. "smile", "rofl"). */
  name: string
  /** Rendered pixel size (square). Sprite frames are natively 40x40. */
  size?: number
  className?: string
  /** When true, the first viewport-entry triggers a one-shot sound
   *  play. Default true — pickers should pass false. */
  autoPlaySound?: boolean
}

const PER_FRAME_MS = 50 // ~20fps — matches the original Skype tempo

/** Per-instance inline style for the sprite animation. Exported so
 *  the contenteditable composer can build the same DOM by hand
 *  (React isn't involved when inserting via Range.insertNode). */
export function skypeAnimStyle(key: string, frames: number, size: number): CSSProperties {
  const durationMs = Math.max(400, frames * PER_FRAME_MS)
  return {
    width: size,
    height: size,
    marginBottom: 1,
    // Consumed by the `.skype-emoji-anim::before` frame strip in globals.css.
    // (URL goes through a var so the pseudo-element can pick it up; the window
    // element itself paints nothing.)
    ['--skype-url' as string]: `url(${skypeEmojiUrl(key)})`,
    ['--skype-cycle-frames' as string]: frames,
    ['--skype-cycle-y' as string]: `-${size * frames}px`,
    ['--skype-cycle-dur' as string]: `${durationMs}ms`,
  }
}

export function SkypeEmoji({ name, size = 20, className, autoPlaySound = true }: Props) {
  const [errored, setErrored] = useState(false)
  const elRef = useRef<HTMLSpanElement>(null)
  const playedRef = useRef(false)
  const meta = findSkypeByKey(name)

  // Probe the sprite asset once — if it 404s we drop to the text
  // fallback. Background images don't fire load/error events, so we
  // pre-fetch via a transient Image.
  useEffect(() => {
    if (!meta) return
    const probe = new Image()
    probe.onerror = () => setErrored(true)
    probe.src = skypeEmojiUrl(meta.key)
    return () => { probe.onerror = null }
  }, [meta])

  useEffect(() => {
    if (!autoPlaySound || playedRef.current) return
    const el = elRef.current
    if (!el) return
    const obs = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        playedRef.current = true
        if (!useSoundStore.getState().muted) playSkypeSound(name)
        obs.disconnect()
        break
      }
    }, { threshold: 0.5 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [name, autoPlaySound])

  if (!meta || errored) {
    const text = meta?.shortcodes[0] ?? `(${name})`
    return (
      <span
        className={className}
        style={{
          fontSize: Math.max(11, Math.round(size * 0.55)),
          fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
          color: 'var(--ink-500)',
          display: 'inline-block',
          verticalAlign: 'text-bottom',
        }}
        title={meta?.label ?? name}
      >{text}</span>
    )
  }

  const onClick = () => {
    if (useSoundStore.getState().muted) return
    playSkypeSound(name)
  }

  return (
    <span
      ref={elRef}
      role="img"
      aria-label={meta.label}
      title={meta.label}
      data-skype-emoji={meta.key}
      data-skype-frames={meta.frames}
      className={(className ? className + ' ' : '') + 'skype-emoji-anim'}
      style={{
        ...skypeAnimStyle(meta.key, meta.frames, size),
        cursor: autoPlaySound ? 'pointer' : 'default',
      }}
      onClick={onClick}
    />
  )
}
