import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { useMe } from '@/stores/auth'
import { toggleReaction } from '@/features/chat/state/messages'
import { useParticipants } from '@/stores/participants'
import type { ReactionEntry } from '@/types'
import { TwEmoji } from '../TwEmoji'

export const QUICK_REACTIONS = ['👀', '👍', '✅', '❤️', '😂', '🎉', '👏', '🔥', '💡', '🤔', '🎯', '🙌']

export function ReactionPill({ msgId, reaction }: { msgId: string; reaction: ReactionEntry }) {
  const byId = useParticipants((state) => state.byId)
  const meId = useMe()
  const [burst, setBurst] = useState(0)
  const names = (reaction.users ?? []).reduce<string[]>((result, userId) => {
    if (userId === meId) result.push('You')
    else if (byId[userId]?.name) result.push(byId[userId].name)
    return result
  }, [])
  const orderedNames = [
    ...names.filter((name) => name === 'You'),
    ...names.filter((name) => name !== 'You').sort((a, b) => a.localeCompare(b)),
  ]
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const showTooltip = () => {
    const element = buttonRef.current
    if (!element || orderedNames.length === 0) return
    const rect = element.getBoundingClientRect()
    setAnchor({ x: rect.left + rect.width / 2, y: rect.top })
  }
  return <>
    <button
      ref={buttonRef}
      onMouseEnter={showTooltip}
      onMouseLeave={() => setAnchor(null)}
      onFocus={showTooltip}
      onBlur={() => setAnchor(null)}
      onClick={() => {
        if (!reaction.mine) setBurst((value) => value + 1)
        void toggleReaction(msgId, reaction.emoji)
      }}
      data-mine={reaction.mine ? 'true' : 'false'}
      className={cn(
        'reaction-control reaction-pill rounded-full text-[11px] py-0.5 px-2 inline-flex items-center gap-1 border transition',
        reaction.mine
          ? 'bg-sky2-100 border-sky2-200 text-skype-deep font-semibold'
          : 'bg-cloud border-ink-100 text-ink-500 hover:border-sky2-200',
      )}
    >
      <span className="reaction-emoji inline-flex"><TwEmoji emoji={reaction.emoji} size={14} /></span>
      <span className="reaction-count">{reaction.count}</span>
      {burst > 0 && <ReactionBurst key={burst} />}
    </button>
    {anchor && orderedNames.length > 0 && createPortal(
      <ReactionTooltip emoji={reaction.emoji} names={orderedNames} anchorX={anchor.x} anchorY={anchor.y} />,
      document.body,
    )}
  </>
}

function ReactionBurst() {
  return <span className="reaction-burst" aria-hidden="true"><span /><span /><span /><span /></span>
}

function ReactionTooltip({ emoji, names, anchorX, anchorY }: { emoji: string; names: string[]; anchorX: number; anchorY: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number; arrowX: number } | null>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const margin = 8
    let left = anchorX - rect.width / 2
    left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin))
    setPosition({ left, top: anchorY - rect.height - 8, arrowX: anchorX - left })
  }, [anchorX, anchorY, names])
  return <div
    ref={ref}
    role="tooltip"
    data-message-surface="overlay"
    className="pointer-events-none fixed z-[70]"
    style={{ left: position?.left ?? -9999, top: position?.top ?? -9999, opacity: position ? 1 : 0, transition: 'opacity 120ms ease-out', maxWidth: 320 }}
  >
    <div className="text-[11.5px] py-1.5 px-2.5 rounded-lg shadow-lg text-white inline-flex items-center" style={{ background: 'rgba(15, 30, 50, 0.92)', backdropFilter: 'blur(6px)' }}>
      <TwEmoji emoji={emoji} size={14} className="mr-1.5" />
      <span className="font-medium whitespace-nowrap">{names.join(', ')}</span>
    </div>
    <div className="w-2 h-2 rotate-45 -mt-1 absolute" style={{ left: (position?.arrowX ?? 0) - 4, background: 'rgba(15, 30, 50, 0.92)' }} />
  </div>
}
