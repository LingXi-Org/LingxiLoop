import { useMemo, useRef, useState } from 'react'
import { AvatarMini } from '@/components/Avatar'
import { BoardLink } from '@/features/boards/components/BoardLink'
import { CalendarLink } from '@/components/CalendarLink'
import { CardLink } from '@/features/boards/components/CardLink'
import { DocumentLink } from '@/components/DocumentLink'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useParticipants } from '@/features/agents/state'
import type { Participant } from '@/types'

/* ============== Mention helpers ============== */

const DOC_REF_RE = /^doc_[a-z0-9]+/i
const BOARD_REF_RE = /^board-[a-z0-9]+(?:-[a-z0-9]+)*/i
const CARD_REF_RE = /^card-[a-z0-9]+(?:-[a-z0-9]+)*/i
const CALENDAR_REF_RE = /^ce-[a-z0-9-]+/i

function hasMentionStartBoundary(text: string, index: number): boolean {
  if (index <= 0) return true
  return !/[\w@]/.test(text[index - 1])
}

function hasMentionEndBoundary(text: string, index: number): boolean {
  const next = text[index]
  return !next || !/[a-z0-9_-]/i.test(next)
}

function hasDocumentBoundary(text: string, index: number): boolean {
  const ch = text[index]
  return !ch || !/[a-z0-9_]/i.test(ch)
}

function hasBoardBoundary(text: string, index: number): boolean {
  const ch = text[index]
  return !ch || !/[a-z0-9_-]/i.test(ch)
}

function hasCardBoundary(text: string, index: number): boolean {
  const ch = text[index]
  return !ch || !/[a-z0-9_-]/i.test(ch)
}

function hasCalendarBoundary(text: string, index: number): boolean {
  const ch = text[index]
  return !ch || !/[a-z0-9-]/i.test(ch)
}

export function hasLinkedReference(text: string): boolean {
  return /(^|[^a-z0-9_])doc_[a-z0-9]+($|[^a-z0-9_])/i.test(text) ||
    /(^|[^a-z0-9_-])board-[a-z0-9]+(?:-[a-z0-9]+)*($|[^a-z0-9_-])/i.test(text) ||
    /(^|[^a-z0-9_-])card-[a-z0-9]+(?:-[a-z0-9]+)*($|[^a-z0-9_-])/i.test(text) ||
    /(^|[^a-z0-9-])ce-[a-z0-9-]+($|[^a-z0-9-])/i.test(text)
}

function knownMentionCandidates(byId: Record<string, Participant>): Array<{ id: string; label: string; token: string }> {
  const candidates: Array<{ id: string; label: string; token: string }> = []
  for (const p of Object.values(byId)) {
    if (p.departedAt) continue
    candidates.push({ id: p.id, label: p.name, token: p.id })
    const name = p.name.trim()
    if (name) candidates.push({ id: p.id, label: p.name, token: name })
  }
  return candidates.sort((a, b) => b.token.length - a.token.length)
}

/** Render prose and canonical participant mentions as chips. */
export function MentionedText({ text, byId }: { text: string; byId: Record<string, Participant> }) {
  const parts: Array<
    | { kind: 'text'; value: string }
    | { kind: 'document'; id: string }
    | { kind: 'board'; id: string }
    | { kind: 'card'; id: string }
    | { kind: 'calendar'; id: string }
    | { kind: 'mention'; id: string; label: string }
  > = []
  const candidates = knownMentionCandidates(byId)
  const lower = text.toLowerCase()
  let last = 0
  for (let i = 0; i < text.length; i++) {
    if (hasDocumentBoundary(text, i - 1)) {
      const doc = DOC_REF_RE.exec(text.slice(i))
      if (doc && hasDocumentBoundary(text, i + doc[0].length)) {
        if (i > last) parts.push({ kind: 'text', value: text.slice(last, i) })
        parts.push({ kind: 'document', id: doc[0] })
        last = i + doc[0].length
        i = last - 1
        continue
      }
    }

    if (hasBoardBoundary(text, i - 1)) {
      const board = BOARD_REF_RE.exec(text.slice(i))
      if (board && hasBoardBoundary(text, i + board[0].length)) {
        if (i > last) parts.push({ kind: 'text', value: text.slice(last, i) })
        parts.push({ kind: 'board', id: board[0] })
        last = i + board[0].length
        i = last - 1
        continue
      }
    }

    if (hasCardBoundary(text, i - 1)) {
      const card = CARD_REF_RE.exec(text.slice(i))
      if (card && hasCardBoundary(text, i + card[0].length)) {
        if (i > last) parts.push({ kind: 'text', value: text.slice(last, i) })
        parts.push({ kind: 'card', id: card[0] })
        last = i + card[0].length
        i = last - 1
        continue
      }
    }

    if (hasCalendarBoundary(text, i - 1)) {
      const event = CALENDAR_REF_RE.exec(text.slice(i))
      if (event && hasCalendarBoundary(text, i + event[0].length)) {
        if (i > last) parts.push({ kind: 'text', value: text.slice(last, i) })
        parts.push({ kind: 'calendar', id: event[0] })
        last = i + event[0].length
        i = last - 1
        continue
      }
    }

    if (text[i] !== '@' || !hasMentionStartBoundary(text, i)) continue
    const rest = lower.slice(i + 1)
    const known = candidates.find((candidate) =>
      rest.startsWith(candidate.token.toLowerCase()) &&
      hasMentionEndBoundary(text, i + 1 + candidate.token.length)
    )
    if (!known) continue
    if (i > last) parts.push({ kind: 'text', value: text.slice(last, i) })
    parts.push({ kind: 'mention', id: known.id, label: known.label })
    last = i + 1 + known.token.length
    i = last - 1
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) })
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === 'text') return <span key={i}>{p.value}</span>
        if (p.kind === 'document') return <DocumentLink key={i} id={p.id} />
        if (p.kind === 'board') return <BoardLink key={i} id={p.id} />
        if (p.kind === 'card') return <CardLink key={i} id={p.id} />
        if (p.kind === 'calendar') return <CalendarLink key={i} id={p.id} />
        return (
          <span
            key={i}
            className="inline-flex items-baseline rounded bg-skype/10 px-1.5 text-[12px] font-medium text-skype-deep"
            title={p.id}
          >@{p.label}</span>
        )
      })}
    </>
  )
}

/** Single-line text input with an `@`-triggered participant picker. The
 *  picker substring-matches against id+name; ↑/↓ navigate, Enter inserts. */
export function MentionInput(props: {
  value: string
  onChange: (v: string) => void
  onSubmit?: () => void
  placeholder?: string
  multiline?: boolean
  rows?: number
  className?: string
  autoFocus?: boolean
  submitOnEnter?: boolean
  onBlur?: () => void
  onEscape?: () => void
}) {
  const byId = useParticipants((s) => s.byId)
  const everyone = useMemo(() => Object.values(byId), [byId])
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [anchor, setAnchor] = useState(0) // index of the leading '@'

  const matches = useMemo(() => {
    const q = query.toLowerCase()
    return everyone
      .filter((p) => !p.departedAt)
      .filter((p) => p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .slice(0, 6)
  }, [everyone, query])

  function update(next: string, caretPos: number) {
    props.onChange(next)
    // Look back from the caret to find a still-open `@token` — break on
    // whitespace, the start-of-string, or any character not allowed in
    // an id. We must also reject the case where the char immediately
    // before `@` is an ident-ish char (matches the regex's lookbehind).
    let i = caretPos - 1
    while (i >= 0) {
      const ch = next[i]
      if (ch === '@') {
        const prev = i > 0 ? next[i - 1] : ''
        if (!prev || /[\s([]/.test(prev)) {
          const token = next.slice(i + 1, caretPos)
          if (/^[a-z0-9_-]*$/i.test(token)) {
            setOpen(true)
            setAnchor(i)
            setQuery(token)
            setHighlight(0)
            return
          }
        }
        break
      }
      if (!/[a-z0-9_-]/i.test(ch)) break
      i--
    }
    setOpen(false)
  }

  function insertMention(p: Participant) {
    const el = ref.current
    if (!el) { setOpen(false); return }
    const before = props.value.slice(0, anchor)
    const caret = el.selectionStart ?? props.value.length
    const after = props.value.slice(caret)
    const inserted = `@${p.name.trim() || p.id} `
    const next = before + inserted + after
    props.onChange(next)
    setOpen(false)
    queueMicrotask(() => {
      const pos = (before + inserted).length
      el.setSelectionRange(pos, pos)
      el.focus()
    })
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.nativeEvent.isComposing) return
    if (open && matches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => (h + 1) % matches.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => (h - 1 + matches.length) % matches.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(matches[highlight]); return }
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return }
    }
    if (!open && e.key === 'Enter' && !e.shiftKey && props.onSubmit && !props.multiline) {
      e.preventDefault()
      props.onSubmit()
      return
    }
    if (!open && props.multiline && e.key === 'Enter' && (e.metaKey || e.ctrlKey) && props.onSubmit) {
      e.preventDefault()
      props.onSubmit()
      return
    }
    if (!open && props.multiline && props.submitOnEnter && e.key === 'Enter' && !e.shiftKey && props.onSubmit) {
      e.preventDefault()
      props.onSubmit()
      return
    }
    if (!open && e.key === 'Escape' && props.onEscape) {
      e.preventDefault()
      props.onEscape()
    }
  }

  return (
    <div className="relative">
      {props.multiline ? (
        <Textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          autoFocus={props.autoFocus}
          value={props.value}
          rows={props.rows ?? 3}
          placeholder={props.placeholder}
          onChange={(e) => update(e.target.value, e.target.selectionStart ?? 0)}
          onKeyDown={onKeyDown}
          onBlur={props.onBlur}
          className={cn(
            'w-full px-3 py-2 text-sm rounded-md border border-ink-200 bg-white focus:outline-none focus:border-skype resize-y',
            props.className,
          )}
        />
      ) : (
        <Input
          ref={ref as React.RefObject<HTMLInputElement>}
          autoFocus={props.autoFocus}
          value={props.value}
          placeholder={props.placeholder}
          onChange={(e) => update(e.target.value, e.target.selectionStart ?? 0)}
          onKeyDown={onKeyDown}
          onBlur={props.onBlur}
          className={cn(
            'w-full px-3 py-2 text-sm rounded-md border border-ink-200 bg-white focus:outline-none focus:border-skype',
            props.className,
          )}
        />
      )}
      {open && matches.length > 0 && (
        <div className="app-menu-surface absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto p-1">
          {matches.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertMention(p) }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                'app-menu-item',
                i === highlight && 'is-active',
              )}
            >
              <AvatarMini p={p} size={20} />
              <span className="font-medium text-ink-800">{p.name}</span>
              <span className="text-xs text-ink-400">@{p.id}</span>
              <span className="ml-auto text-[10px] uppercase tracking-wide text-ink-300">{p.kind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
