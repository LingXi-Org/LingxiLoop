/**
 * Suggestion popup for the document editor's @mention extension.
 *
 * Renders a floating panel of matching participants (humans + agents)
 * directly above/below the caret. Selecting an entry — by click or
 * Enter — commits the TipTap mention command, which inserts a
 * `mention` node carrying `{ id, label }`. The node serializes into
 * the Yjs XmlFragment so it travels through CRDT just like any other
 * inline content.
 *
 * Keyboard: ↑ ↓ to move, Enter / Tab to commit, Esc to dismiss.
 */
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { Participant } from '@/types'
import { Avatar } from './Avatar'
import { cn } from '@/lib/utils'

export interface MentionListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

export interface MentionListProps {
  items: Participant[]
  command: (payload: { id: string; label: string }) => void
}

export const MentionList = forwardRef<MentionListHandle, MentionListProps>(function MentionList(
  { items, command }, ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Clamp when the candidate list changes so an arrow-key-driven index
  // doesn't dangle past the end.
  useEffect(() => { setSelectedIndex(0) }, [items])

  const selectItem = (index: number) => {
    const p = items[index]
    if (!p) return
    command({ id: p.id, label: p.name })
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowDown') {
        setSelectedIndex((i) => (i + 1) % Math.max(items.length, 1))
        return true
      }
      if (event.key === 'ArrowUp') {
        setSelectedIndex((i) => (i + items.length - 1) % Math.max(items.length, 1))
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        selectItem(selectedIndex)
        return true
      }
      return false
    },
  }))

  if (items.length === 0) {
    return (
      <div className="rounded-lg bg-white border border-stone-200 shadow-lg px-3 py-2 text-xs text-stone-400">
        no match
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-white border border-stone-200 shadow-lg overflow-hidden min-w-[220px] max-h-[280px] overflow-y-auto py-1">
      {items.map((p, i) => (
        <button
          type="button"
          key={p.id}
          // Capture click before TipTap clears the suggestion popup on
          // blur (mouseDown fires before blur; click fires after, by
          // which time the suggestion state is already torn down).
          onMouseDown={(e) => {
            e.preventDefault()
            selectItem(i)
          }}
          onMouseEnter={() => setSelectedIndex(i)}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors',
            i === selectedIndex
              ? 'bg-skype/10 text-skype-deep'
              : 'text-stone-700 hover:bg-stone-50',
          )}
        >
          <Avatar p={p} size={24} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium leading-tight">{p.name}</div>
            <div className="truncate text-[11px] text-stone-400 leading-tight">
              {p.kind === 'agent' ? 'agent' : 'human'}{p.role ? ` · ${p.role}` : ''}
            </div>
          </div>
        </button>
      ))}
    </div>
  )
})

/** Score participants against the current `@<query>` so the popup
 *  surfaces relevant ones first. Prefix matches beat substring matches.
 *  Stable for empty queries (returns the input order). */
export function filterMentionCandidates(all: Participant[], query: string): Participant[] {
  const q = query.toLowerCase().trim()
  if (!q) return all.slice(0, 8)
  const scored: Array<{ p: Participant; score: number }> = []
  for (const p of all) {
    const name = p.name.toLowerCase()
    const id = p.id.toLowerCase()
    let score = 0
    if (id.startsWith(q)) score = 5
    else if (name.startsWith(q)) score = 4
    else if (id.includes(q)) score = 2
    else if (name.includes(q)) score = 1
    if (score > 0) scored.push({ p, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 8).map((s) => s.p)
}

/** Used by both the editor (to dedupe newly-inserted ids) and the
 *  notify-WS frame builder. We keep the helper here next to the popup
 *  so both consumers share the same shape definition. */
export const MENTION_NODE_TYPE = 'mention'
