import { createContext, type ReactNode, useContext } from 'react'
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
import { CalendarLink } from '@/features/calendar/components/CalendarLink'
import { CardLink } from '@/features/boards/components/CardLink'
import { DocumentLink } from '@/features/documents/components/DocumentLink'
import { SkypeEmoji } from '../SkypeEmoji'
import { TwEmoji } from '../TwEmoji'
import { CodeBlock as ToolUiCodeBlock } from '../tool-ui/code-block'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

function MentionChip({ id }: { id: string }) {
  const byId = useParticipants((s) => s.byId)
  const openAgentInfo = useSurface((s) => s.openAgentInfo)
  const meId = useMe()

  // `@all` is a broadcast token — no participant to resolve. Renders as a
  // secondary chip with the shared broadcast Bloub inline, so it visually
  // matches participant mention chips (avatar + label) while still reading
  // as "addressed to the whole room".
  if (id === 'all') {
    return (
      <span
        className="inline-flex items-center justify-center gap-1 rounded-full bg-secondary px-1.5 py-0.5 font-semibold text-secondary-foreground"
        style={{ verticalAlign: '-0.15em' }}
      >
        <Avatar
          p={EVERYONE_BLOUB_PARTICIPANT}
          size={18}
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
  if (!p) return <span className="text-muted-foreground">@{id}</span>

  const isMe = p.id === meId
  const isAgent = p.kind === 'agent'
  const label = isMe ? 'you' : p.name

  // Open InfoPane for any participant — humans now have profile cards too
  // (their auth email is the most useful new piece). Self-mentions still
  // skip — clicking your own @you mention shouldn't open your own profile.
  const click = () => { if (!isMe) openAgentInfo(p.id) }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
      <span
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
          isAgent ? 'bg-primary/10 text-primary hover:bg-primary/15'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        )}
        style={{ verticalAlign: '-0.15em' }}
      >
        <Avatar p={p} size={16} ringColor="var(--background)" />
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
      </TooltipTrigger>
      <TooltipContent className="max-w-xs bg-popover text-popover-foreground ring-1 ring-border"><MentionCard p={p} /></TooltipContent>
    </Tooltip>
  )
}

/** Elegant floating preview card shown on @mention hover. Renders via
 *  portal so it escapes scroll-container clipping. */
function MentionCard({ p }: { p: Participant }) {
  return (
      <div className="flex min-w-60 max-w-72 items-start gap-3 rounded-2xl bg-popover p-3 text-popover-foreground">
        <Avatar p={p} size={44} ringColor="var(--popover)" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{p.name}</div>
          {p.bio && (
            <div className="line-clamp-3 text-[11.5px] leading-[1.45] text-muted-foreground">{p.bio}</div>
          )}
        </div>
      </div>
  )
}

/** Restrained code block using the shared message typography and theme. */
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
  if (!target) return <span className="text-muted-foreground">#{n}</span>

  const author = byId[target.authorId] ?? null
  const onClick = () => jumpToMessage(target.id)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
      <span
        onClick={onClick}
        className="inline-flex cursor-pointer items-center rounded-full bg-primary/10 px-1.5 py-0.5 font-semibold text-primary transition hover:bg-primary/15"
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
      </TooltipTrigger>
      <TooltipContent className="max-w-80 bg-popover text-popover-foreground ring-1 ring-border"><MessagePeekCard msg={target} author={author} /></TooltipContent>
    </Tooltip>
  )
}

/** Preview shown by the canonical Tooltip when a user hovers a `#N` chip. */
function MessagePeekCard({ msg, author }: { msg: Message; author: Participant | null }) {
  const bodyPreview = (msg.body ?? '').replace(/\n/g, ' ').slice(0, 220)
  return (
      <div className="w-72 rounded-2xl bg-popover px-3.5 py-2.5 text-popover-foreground">
        <div className="flex items-center gap-2 mb-1.5">
          {author ? <Avatar p={author} size={20} ringColor="var(--popover)" /> : null}
          <div className="min-w-0 flex-1 flex items-baseline gap-2">
            <span className="truncate text-[12.5px] font-semibold text-foreground">{author?.name ?? msg.authorId}</span>
          </div>
        </div>
        <div className="line-clamp-5 break-words text-[12.5px] leading-[1.55] text-foreground">
          {bodyPreview || <span className="italic text-muted-foreground">（无文字）</span>}
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
