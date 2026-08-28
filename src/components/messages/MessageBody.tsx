import { createContext, type ReactNode, useContext, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Components } from 'react-markdown'
import { TypesetMarkdown } from '@/components/Typeset'
import { EVERYONE_BLOUB_PARTICIPANT } from '@/lib/agentVisualState'
import { remarkLingxiLoop } from '@/lib/remarkLingxiLoop'
import { cn } from '@/lib/utils'
import { useConversationUi } from '@/stores/conversationUi'
import { useSurface } from '@/stores/surface'
import { useMe } from '@/stores/auth'
import { useMessages } from '@/features/chat/state/messages'
import { useParticipants } from '@/features/agents/state'
import type { Message, Participant } from '@/types'
import { Avatar } from '../Avatar'
import { BoardLink } from '@/features/boards/components/BoardLink'
import { CalendarLink } from '../CalendarLink'
import { CardLink } from '@/features/boards/components/CardLink'
import { DocumentLink } from '../DocumentLink'
import { SkypeEmoji } from '../SkypeEmoji'
import { TwEmoji } from '../TwEmoji'
import { CodeBlock as ToolUiCodeBlock } from '../tool-ui/code-block'

function MentionChip({ id }: { id: string }) {
  const byId = useParticipants((s) => s.byId)
  const openAgentInfo = useSurface((s) => s.openAgentInfo)
  const meId = useMe()
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null)
  const ref = useRef<HTMLSpanElement | null>(null)

  // `@all` is a broadcast token — no participant to resolve. Renders as a
  // coral chip with the shared broadcast Bloub inline, so it visually
  // matches participant mention chips (avatar + label) while still reading
  // as "addressed to the whole room".
  if (id === 'all') {
    return (
      <span
        className="inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded-full font-semibold text-coral-deep bg-coral-soft"
        style={{ verticalAlign: '-0.15em' }}
      >
        <Avatar
          p={EVERYONE_BLOUB_PARTICIPANT}
          size={18}
          showStatus={false}
          animated={false}
          ringColor="transparent"
        />
        <span style={{ lineHeight: '16px' }}>@全部</span>
      </span>
    )
  }

  const p = byId[id]
  // Unknown reference — render as plain `@id` without chip styling, so
  // typos don't get fake-validated. Never resolves the id to a guessed name.
  if (!p) return <span className="text-ink-500">@{id}</span>

  const isMe = p.id === meId
  const isAgent = p.kind === 'agent'
  const label = isMe ? 'you' : p.name

  const enter = () => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setHoverPos({ x: r.left + r.width / 2, y: r.bottom + 6 })
  }
  const leave = () => setHoverPos(null)
  // Open InfoPane for any participant — humans now have profile cards too
  // (their auth email is the most useful new piece). Self-mentions still
  // skip — clicking your own @you mention shouldn't open your own profile.
  const click = () => { if (!isMe) openAgentInfo(p.id) }

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onClick={click}
        className={cn(
          // Symmetric horizontal padding (avatar + text feel balanced in the
          // chip instead of the avatar grazing the left edge), 4px gap so
          // the @ sign reads as paired with the avatar. The chip is taller
          // than the 14px text line, so we pin its vertical-align with an em
          // offset to center it on the surrounding CJK glyphs. -0.15em was
          // measured against 14px/leading-1.55 CJK text (see RichInput, which
          // uses the same value): `baseline`/`middle` ride high, -0.25em (the
          // old value) sat visibly low. Keep this in sync with RichInput.
          'inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded-full font-semibold cursor-pointer transition',
          isAgent ? 'text-skype-deep bg-sky-50 hover:bg-sky-100'
                  : 'text-coral-deep bg-coral-soft hover:brightness-95',
        )}
        style={{ verticalAlign: '-0.15em' }}
      >
        <Avatar p={p} size={16} ringColor="var(--cloud)" showStatus={false} />
        {/* Wrap the label in its own inline-flex box so the parent chip's
         *  \`items-center\` aligns the avatar's geometric center with the
         *  label's geometric center — not with the label's default line
         *  box, which positions glyphs LOWER than its midpoint because of
         *  the font's ascender/descender split. The inner flex re-centers
         *  the glyphs vertically within a 16-px tall slot that matches
         *  the avatar height. */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 16,
            lineHeight: 1,
          }}
        >@{label}</span>
      </span>
      {hoverPos && createPortal(
        <MentionCard p={p} x={hoverPos.x} y={hoverPos.y} />,
        document.body,
      )}
    </>
  )
}

/** Elegant floating preview card shown on @mention hover. Renders via
 *  portal so it escapes scroll-container clipping. */
function MentionCard({ p, x, y }: { p: Participant; x: number; y: number }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [adjusted, setAdjusted] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    // Center horizontally on the anchor; flip up if it would clip the bottom
    let left = x - r.width / 2
    let top = y
    const margin = 8
    if (left < margin) left = margin
    if (left + r.width > window.innerWidth - margin) left = window.innerWidth - r.width - margin
    if (top + r.height > window.innerHeight - margin) top = y - r.height - 18  // flip above the anchor
    setAdjusted({ left, top })
  }, [x, y])
  return (
    <div
      ref={ref}
      className="fixed z-[60] animate-rise"
      style={{
        left: adjusted?.left ?? x,
        top: adjusted?.top ?? y,
        visibility: adjusted ? 'visible' : 'hidden',
        pointerEvents: 'none',
      }}
    >
      <div
        className="bg-cloud rounded-[14px] py-3 px-3.5 flex items-start gap-3 min-w-[240px] max-w-[300px]"
        style={{
          border: '1px solid var(--ink-100)',
          boxShadow: '0 12px 32px -10px rgba(10, 30, 60, 0.22), 0 6px 14px -6px rgba(10, 30, 60, 0.14)',
        }}
      >
        <Avatar p={p} size={44} ringColor="var(--cloud)" showStatus={false} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[14px] text-ink-900 truncate">{p.name}</div>
          {p.bio && (
            <div className="text-[11.5px] text-ink-500 leading-[1.45] line-clamp-3">{p.bio}</div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Restrained, paper-toned code block matching LingxiLoop's overall light
 *  palette. Token colors map onto the brand: keywords use --skype-deep,
 *  strings use --coral-deep, numbers --gold-deep, types --whisper-deep,
 *  comments italic --ink-300. Deliberately NOT a heavy dark card — sits
 *  inside the bubble as a calm inset instead. */
export function CodeBlock({ lang, code }: { lang: string; code: string }) {
  let hash = 0
  for (let index = 0; index < code.length; index += 1) hash = ((hash << 5) - hash + code.charCodeAt(index)) | 0
  return (
    <ToolUiCodeBlock
      id={`code-${Math.abs(hash).toString(36)}`}
      role="information"
      code={code}
      language={lang || 'text'}
      lineNumbers="visible"
      maxCollapsedLines={24}
      className="my-1.5 max-w-full"
    />
  )
}

// Read a string property off a custom mdast→hast node (set via remarkLingxiLoop's
// hProperties). Reading from node.properties is the reliable path across
// react-markdown's prop transforms.
function nodeProp(node: unknown, key: string): string {
  const v = (node as { properties?: Record<string, unknown> } | undefined)?.properties?.[key]
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.join(' ')
  return v == null ? '' : String(v)
}

// Raw text of a code node — prefer the mdast/hast children values; fall back to
// the rendered children. Used to decide inline vs block and to feed CodeBlock.
function codeText(node: unknown, children: ReactNode): string {
  const kids = (node as { children?: Array<{ value?: string }> } | undefined)?.children
  if (kids && kids.length) {
    const joined = kids.map((c) => c.value ?? '').join('')
    if (joined) return joined
  }
  return Array.isArray(children) ? children.join('') : String(children ?? '')
}


/** A backtick-wrapped value that is exactly an artifact id renders as the
 *  matching artifact link (which resolves git-style short ids) instead of a
 *  plain code chip — preserving the pre-react-markdown behavior where
 *  `` `doc_…` `` / `` `ce-…` `` were clickable. */
function artifactLinkForCode(value: string): ReactNode | null {
  const v = value.trim()
  if (/^doc_[A-Za-z0-9]+$/.test(v)) return <DocumentLink id={v} />
  if (/^board-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(v)) return <BoardLink id={v} />
  if (/^card-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(v)) return <CardLink id={v} />
  if (/^ce-[A-Za-z0-9-]+$/.test(v)) return <CalendarLink id={v} />
  return null
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The LingxiLoop look for every Markdown element — standard grammar styled to
 *  match the app's paper-toned palette + chat-tight spacing, plus the custom
 *  elements remarkLingxiLoop emits (mentions, artifact cards, Twemoji, Skype). */
// The current conversation, provided by RichBody so an inline `#N` chip knows
// which conversation's `sequence` numbers to resolve against.
const ConversationIdContext = createContext<string | null>(null)

/** `#N` — a per-conversation message-sequence reference. Clickable: scrolls to
 *  the referenced message via useApp.jumpToMessage. Hover: shows a small peek
 *  card (author + body preview). If the conversation context is missing OR the
 *  message hasn't been loaded yet, falls back to plain `#N` text so the
 *  reference is never silently dropped. */
function MessageRefChip({ n }: { n: number }) {
  const convoId = useContext(ConversationIdContext)
  const target = useMessages((s) => {
    if (!convoId) return null
    const list = s.byConvo[convoId]
    if (!list) return null
    for (const m of list) {
      if (m.sequence === n) return m
    }
    return null
  })
  const jumpToMessage = useConversationUi((s) => s.jumpToMessage)
  const byId = useParticipants((s) => s.byId)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null)
  const ref = useRef<HTMLSpanElement | null>(null)

  if (!target) return <span className="text-ink-400">#{n}</span>

  const author = byId[target.authorId] ?? null
  const onClick = () => jumpToMessage(target.id)
  const enter = () => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setHoverPos({ x: r.left + r.width / 2, y: r.bottom + 6 })
  }
  const leave = () => setHoverPos(null)

  return (
    <>
      <span
        ref={ref}
        onClick={onClick}
        onMouseEnter={enter}
        onMouseLeave={leave}
        className="inline-flex items-center px-1.5 py-0.5 rounded-full font-semibold cursor-pointer transition text-skype-deep bg-sky-50 hover:bg-sky-100"
        // Measured against 14px / line-height 1.55 CJK text — -0.05em centers
        // the chip on the CJK glyph center; -0.15em (the MentionChip value)
        // visibly sits low here because there's no avatar to anchor it.
        style={{ verticalAlign: '-0.05em' }}
        title={`Jump to message #${n}`}
        role="link"
      >
        {/* Cap the inner height + line-height so the chip is a stable 20px
            tall — without this, it inherits the bubble's 1.55 leading and
            grows taller than expected, which is what made the older offset
            misalign. */}
        <span style={{ display: 'inline-flex', alignItems: 'center', height: 16, lineHeight: 1 }}>#{n}</span>
      </span>
      {hoverPos && createPortal(
        <MessagePeekCard msg={target} author={author} x={hoverPos.x} y={hoverPos.y} />,
        document.body,
      )}
    </>
  )
}

/** Floating preview card shown when the user hovers a `#N` chip — mirrors the
 *  MentionCard pattern (portalled, ink-tone palette). Shows author + a short
 *  body excerpt so users can read the referenced message without jumping. */
function MessagePeekCard(
  { msg, author, x, y }: { msg: Message; author: Participant | null; x: number; y: number },
) {
  const ARROW = 8
  const W = 320
  const left = Math.max(8, Math.min(window.innerWidth - W - 8, x - W / 2))
  const top = y + ARROW
  const bodyPreview = (msg.body ?? '').replace(/\n/g, ' ').slice(0, 220)
  return (
    <div
      role="tooltip"
      className="fixed z-[80] animate-rise"
      style={{ left, top, width: W, pointerEvents: 'none' }}
    >
      <div className="rounded-[12px] bg-cloud border border-ink-100 shadow-[0_22px_44px_-22px_rgba(0,80,140,0.35)] px-3.5 py-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          {author ? <Avatar p={author} size={20} ringColor="var(--cloud)" showStatus={false} /> : null}
          <div className="min-w-0 flex-1 flex items-baseline gap-2">
            <span className="font-display font-semibold text-[12.5px] text-ink-900 truncate">{author?.name ?? msg.authorId}</span>
          </div>
        </div>
        <div className="text-[12.5px] text-ink-700 leading-[1.55] line-clamp-5 break-words">
          {bodyPreview || <span className="italic text-ink-400">（无文字）</span>}
        </div>
      </div>
    </div>
  )
}

const lingxiloopMarkdownComponents = {
  cmention: ({ node }: any) => <MentionChip id={nodeProp(node, 'cid')} />,
  cmsgref: ({ node }: any) => <MessageRefChip n={Number(nodeProp(node, 'cn')) || 0} />,
  cartifact: ({ node }: any) => {
    const id = nodeProp(node, 'cid')
    switch (nodeProp(node, 'ckind')) {
      case 'document': return <DocumentLink id={id} />
      case 'board': return <BoardLink id={id} />
      case 'card': return <CardLink id={id} />
      case 'calendar': return <CalendarLink id={id} />
      default: return <>{id}</>
    }
  },
  cemoji: ({ node }: any) => <TwEmoji emoji={nodeProp(node, 'cchar')} size={18} />,
  cskype: ({ node }: any) => <SkypeEmoji name={nodeProp(node, 'cname')} size={20} />,
  code: ({ className, children, node }: any) => {
    const raw = codeText(node, children)
    const artifact = !className && !raw.includes('\n') ? artifactLinkForCode(raw) : null
    return artifact ?? <code className={className}>{children}</code>
  },
} as Components
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Renders CommonMark + GFM through the shared Typeset surface, with safe LingxiLoop tokens. */
export function RichBody({ body, conversationId }: { body: string; conversationId?: string | null }) {
  return (
    <ConversationIdContext.Provider value={conversationId ?? null}>
      <TypesetMarkdown content={body} preset="chat" remarkPlugins={[remarkLingxiLoop]} components={lingxiloopMarkdownComponents} />
    </ConversationIdContext.Provider>
  )
}
