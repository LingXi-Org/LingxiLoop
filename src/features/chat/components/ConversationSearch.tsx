import { useDeferredValue, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ISearch } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { applyFindHighlights, clearFindHighlights, type FindMatch } from '@/lib/findHighlights'
import { messageText, useConversationThreadSnapshot } from '../runtime'

function useFindMatches(conversationId: string, query: string): FindMatch[] {
  const needle = query.trim().toLocaleLowerCase()
  const snapshot = useConversationThreadSnapshot(conversationId)
  return useMemo(() => {
    if (!needle) return []
    const matches: FindMatch[] = []
    for (const message of snapshot.messages) {
      const content = `${messageText(message)}\n${JSON.stringify(message.content.filter((part) => part.type === 'tool-call'))}`.toLocaleLowerCase()
      let occurrence = 0
      let offset = content.indexOf(needle)
      while (offset >= 0) {
        matches.push({ messageId: message.id, occurrence })
        occurrence += 1
        offset = content.indexOf(needle, offset + Math.max(1, needle.length))
      }
    }
    return matches
  }, [needle, snapshot.messages])
}

export function ConversationSearch({
  conversationId,
  open,
  onClose,
  rootRef,
}: {
  conversationId: string
  open: boolean
  onClose: () => void
  rootRef: RefObject<HTMLElement | null>
}) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [matchIndex, setMatchIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const matches = useFindMatches(conversationId, deferredQuery)
  const current = matches[matchIndex] ?? null

  useEffect(() => { setQuery(''); setMatchIndex(0) }, [conversationId])
  useEffect(() => { setMatchIndex(0) }, [deferredQuery, matches.length])
  useEffect(() => {
    if (!open) { clearFindHighlights(); return }
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      applyFindHighlights(rootRef.current, deferredQuery, current)
      if (current) {
        rootRef.current?.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(current.messageId)}"]`)
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [current, deferredQuery, open, rootRef])
  useEffect(() => () => clearFindHighlights(), [])
  if (!open) return null

  const move = (delta: number) => setMatchIndex((index) => (index + delta + matches.length) % Math.max(1, matches.length))
  return (
    <div className="chat-find-toolbar mx-2 mt-2 flex items-center gap-2 rounded-xl border border-border/40 bg-muted/30 px-2 py-1.5 text-foreground">
      <div className="flex flex-1 items-center gap-2 rounded-3xl bg-muted px-3 py-1 text-[13px] text-muted-foreground focus-within:ring-1 focus-within:ring-ring">
        <ISearch className="size-3.5" strokeWidth={2} />
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { onClose(); return }
            if (event.key === 'Enter') { event.preventDefault(); move(event.shiftKey ? -1 : 1) }
            if (event.key === 'ArrowUp') { event.preventDefault(); move(-1) }
            if (event.key === 'ArrowDown') { event.preventDefault(); move(1) }
          }}
          placeholder="搜索当前会话…"
          className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
        <span className="shrink-0 font-mono text-[11px] tabular-nums">
          {matches.length === 0 ? (query.trim() ? '无匹配' : '') : `${matchIndex + 1} / ${matches.length}`}
        </span>
      </div>
      <Button type="button" variant="ghost" size="icon-lg" disabled={matches.length === 0} onClick={() => move(-1)} aria-label="上一个匹配">↑</Button>
      <Button type="button" variant="ghost" size="icon-lg" disabled={matches.length === 0} onClick={() => move(1)} aria-label="下一个匹配">↓</Button>
      <Button type="button" variant="ghost" size="icon-lg" onClick={onClose} aria-label="关闭搜索">×</Button>
    </div>
  )
}
