/**
 * Small inline renderer for single-line text previews — conversation
 * list rows, reply-quote stubs, whisper previews. Just like the
 * message renderer, it materializes `(name)` Skype shortcodes into
 * tiny inline animated emoji chips so the preview matches what the
 * full message will display. Everything else (mentions, doc/board
 * refs, bold, code) passes through as plain text — preview rows have
 * no room for richer chrome.
 *
 * Uses a quick `includes('(')` gate before running the regex, so
 * 99% of previews (no shortcode) short-circuit to a single
 * fragment with zero work.
 */
import type { ReactNode } from 'react'
import { findSkypeByShortcode, SKYPE_SHORTCODE_RE } from '@/lib/skypeEmojis'
import { SkypeEmoji } from './SkypeEmoji'

interface Props {
  body: string
  /** Pixel size for inline Skype emoji chips. Default 14 keeps them
   *  roughly in line with 12-13px preview text. */
  emojiSize?: number
}

export function PreviewText({ body, emojiSize = 14 }: Props) {
  if (!body.includes('(')) return <>{body}</>
  const re = new RegExp(SKYPE_SHORTCODE_RE.source, 'gi')
  const parts: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    const meta = findSkypeByShortcode(m[0])
    if (!meta) continue
    if (m.index > last) parts.push(<span key={`t-${last}`}>{body.slice(last, m.index)}</span>)
    parts.push(<SkypeEmoji key={`e-${m.index}`} name={meta.key} size={emojiSize} autoPlaySound={false} />)
    last = m.index + m[0].length
  }
  if (last === 0) return <>{body}</>
  if (last < body.length) parts.push(<span key={`t-${last}`}>{body.slice(last)}</span>)
  return <>{parts}</>
}
