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
import { Fragment, forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { Participant } from '@/types'
import { Avatar } from './Avatar'
import { participantRoleZh } from '@/lib/participantRole'
import { cn } from '@/lib/utils'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'

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
      <div className="rounded-xl bg-popover px-3 py-2 text-xs text-muted-foreground shadow-[var(--popover-shadow)]">
        没有匹配
      </div>
    )
  }

  return (
    <ItemGroup className="w-[260px] max-h-[280px] gap-px overflow-y-auto rounded-xl bg-popover p-1.5 shadow-[var(--popover-shadow)]">
      {items.map((p, i) => (<Fragment key={p.id}>
        {(i === 0 || items[i - 1]!.kind !== p.kind) && <div role="presentation" className="px-2 pb-1 pt-1.5 text-[11.5px] text-muted-foreground">{p.kind === 'agent' ? 'Agent' : '成员'}</div>}
        <Item
          role="option"
          aria-selected={i === selectedIndex}
          // Capture click before TipTap clears the suggestion popup on
          // blur (mouseDown fires before blur; click fires after, by
          // which time the suggestion state is already torn down).
          onMouseDown={(e) => {
            e.preventDefault()
            selectItem(i)
          }}
          onMouseEnter={() => setSelectedIndex(i)}
          className={cn(
            'flex-nowrap gap-2.5 rounded-lg border-0 px-2 py-[7px] text-left',
            i === selectedIndex ? 'bg-accent text-foreground' : 'text-foreground hover:bg-accent',
          )}
        >
          <ItemMedia><Avatar p={p} size={24} animated={false} /></ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle className="block w-full truncate text-[13.5px] font-normal leading-tight">{p.name}</ItemTitle>
            <ItemDescription className="line-clamp-1 text-xs leading-tight text-muted-foreground">
              {participantRoleZh(p)}
            </ItemDescription>
          </ItemContent>
        </Item>
      </Fragment>))}
    </ItemGroup>
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
