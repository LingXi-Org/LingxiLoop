import { memo, useLayoutEffect, useRef, useState } from 'react'
import { MessagePrimitive, useAuiState } from '@assistant-ui/react'
import { createPortal } from 'react-dom'
import type { LingxiImMessageCustom } from '@/im/assistantMessage'
import { cn } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useMe } from '@/stores/auth'
import { discardFailedMessage, retryFailedMessage, toggleReaction } from '@/stores/messages'
import { useParticipants } from '@/stores/participants'
import type { Message, Participant } from '@/types'
import { Avatar } from '../Avatar'
import { CalendarLink } from '../CalendarLink'
import { ContextMenu, type ContextMenuItem } from '../ContextMenu'
import { HumanBadge } from '../HumanBadge'
import { TwEmoji } from '../TwEmoji'
import { LingxiMessageParts } from './LingxiMessageParts'
import { ReadReceiptStatus } from './ReadReceiptStatus'

interface LingxiImMessageProps {
  delay?: number
  animate?: boolean
  /** Desktop-only OpenMaus presentation. Shared/mobile callers keep the
   *  established message layout when this flag is omitted. */
  openMaus?: boolean
}

/** Context-rich reactions for human and agent conversations. Keep the eyes
 * first: it is the clearest lightweight "seen / investigating" signal. */
const QUICK_REACTIONS = ['👀', '👍', '✅', '❤️', '😂', '🎉', '👏', '🔥', '💡', '🤔', '🎯', '🙌']

function ReactionPill({ msgId, r }: { msgId: string; r: import('@/types').ReactionEntry }) {
  const byId = useParticipants((s) => s.byId)
  const meId = useMe()
  const [burst, setBurst] = useState(0)
  const userIds = r.users ?? []
  const orderedNames = (() => {
    const me: string[] = []
    const others: string[] = []
    for (const uid of userIds) {
      if (uid === meId) { me.push('You'); continue }
      const name = byId[uid]?.name
      if (!name) continue  // participant not loaded → omit, never leak raw id
      others.push(name)
    }
    others.sort((a, b) => a.localeCompare(b))
    return [...me, ...others]
  })()

  // Portal-rendered tooltip with fixed coords so it escapes any ancestor's
  // overflow / clip / transform / stacking context. Coords are computed from
  // the button's bounding rect on hover, then clamped to the viewport.
  const btnRef = useRef<HTMLButtonElement>(null)
  const [coord, setCoord] = useState<{ x: number; y: number } | null>(null)

  const onEnter = () => {
    const el = btnRef.current
    if (!el || orderedNames.length === 0) return
    const r = el.getBoundingClientRect()
    setCoord({ x: r.left + r.width / 2, y: r.top })
  }
  const onLeave = () => setCoord(null)
  const onClick = () => {
    if (!r.mine) setBurst((n) => n + 1)
    void toggleReaction(msgId, r.emoji)
  }

  return (
    <>
      <button
        ref={btnRef}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        onClick={onClick}
        data-mine={r.mine ? 'true' : 'false'}
        className={cn(
          'reaction-control reaction-pill rounded-full text-[11px] py-0.5 px-2 inline-flex items-center gap-1 border transition',
          r.mine
            ? 'bg-sky2-100 border-sky2-200 text-skype-deep font-semibold'
            : 'bg-cloud border-ink-100 text-ink-500 hover:border-sky2-200',
        )}
      >
        <span className="reaction-emoji inline-flex"><TwEmoji emoji={r.emoji} size={14} /></span>
        {/* No key={r.count} — that used to force unmount + replay the
            entrance animation on every count change, which under rapid
            clicks left visible stutter (multiple count spans coexisting
            for a frame). Update the text in place; the pill itself
            already does the per-click feedback via ReactionBurst. */}
        <span className="reaction-count">{r.count}</span>
        {burst > 0 && <ReactionBurst key={burst} />}
      </button>
      {coord && orderedNames.length > 0 && createPortal(
        <ReactionTooltip emoji={r.emoji} names={orderedNames} anchorX={coord.x} anchorY={coord.y} />,
        document.body,
      )}
    </>
  )
}

function ReactionBurst() {
  return (
    <span className="reaction-burst" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}

function QuickReactionButton({ msgId, emoji }: { msgId: string; emoji: string }) {
  const [burst, setBurst] = useState(0)
  return (
    <button
      onClick={() => {
        setBurst((n) => n + 1)
        void toggleReaction(msgId, emoji)
      }}
      className="reaction-control reaction-quick-button w-6 h-6 rounded-full hover:bg-sky2-50 grid place-items-center"
      title={`React ${emoji}`}
      aria-label={`React ${emoji}`}
    >
      <TwEmoji emoji={emoji} size={16} />
      {burst > 0 && <ReactionBurst key={burst} />}
    </button>
  )
}

function ReactionTooltip({ emoji, names, anchorX, anchorY }: {
  emoji: string
  names: string[]
  /** anchor center-x in viewport coords */
  anchorX: number
  /** anchor top-y in viewport coords (we render above) */
  anchorY: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; arrowX: number } | null>(null)

  // Measure the tooltip after it's mounted, then reposition it relative to
  // the anchor and clamp inside the viewport. useLayoutEffect runs before the
  // browser paints, so the user never sees the initial offscreen state.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const margin = 8
    const vw = window.innerWidth
    let left = anchorX - r.width / 2
    if (left < margin) left = margin
    if (left + r.width > vw - margin) left = vw - r.width - margin
    const top = anchorY - r.height - 8        // 8px gap above the pill
    const arrowX = anchorX - left              // arrow stays under the pill center
    setPos({ left, top, arrowX })
  }, [anchorX, anchorY, names.join(',')])

  return (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none fixed z-[70]"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        opacity: pos ? 1 : 0,
        transition: 'opacity 120ms ease-out',
        maxWidth: 320,
      }}
    >
      <div
        className="text-[11.5px] py-1.5 px-2.5 rounded-lg shadow-lg text-white inline-flex items-center"
        style={{ background: 'rgba(15, 30, 50, 0.92)', backdropFilter: 'blur(6px)' }}
      >
        <TwEmoji emoji={emoji} size={14} className="mr-1.5" />
        <span className="font-medium whitespace-nowrap">{names.join(', ')}</span>
      </div>
      <div
        className="w-2 h-2 rotate-45 -mt-1 absolute"
        style={{
          left: (pos?.arrowX ?? 0) - 4,
          background: 'rgba(15, 30, 50, 0.92)',
        }}
      />
    </div>
  )
}

/**
 * Centered "X joined" row for kind='system' messages. Body is a JSON payload
 * like {"kind":"joined","participantId":"atlas-9af2"}. The participant
 * name resolves from the live participants store, and clicking the chip
 * opens that person's info pane (for agents) or no-ops (for humans).
 *
 * Only `body` is read so synthetic system notices can share this renderer.
 */
export function SystemRow({ msg, delay = 0, animate = true, openMaus = false }: { msg: { body: string }; delay?: number; animate?: boolean; openMaus?: boolean }) {
  const byId = useParticipants((s) => s.byId)
  const openAgentInfo = useApp((s) => s.openAgentInfo)
  // Same animate-once contract as every native IM entry: don't replay the rise-in fade on
  // a Virtuoso remount (scroll / quote-jump).
  const riseCls = animate ? 'animate-rise' : ''
  const riseStyle = animate ? { animationDelay: `${delay}ms` } : undefined
  let payload: {
    kind?: string
    participantId?: string
    actorId?: string
    noticeKind?: string
    text?: string
    title?: string
    eventId?: string
  } = {}
  try { payload = JSON.parse(msg.body) }
  catch { /* malformed — skip rendering */ return null }

  // Provider-state notices (e.g. AI quota exhausted, model degraded) ship
  // with `kind: 'notice'` + a free-text `text` body. No participant chip;
  // rendered as a centered italic banner with a ⚠ glyph so it reads as
  // "something stopped working" rather than "someone did something". The
  // server inserts these via runtime.postSystemNotice with per-conversation
  // Redis dedup so the same warning doesn't spam the room when multiple
  // agents hit the condition.
  if (payload.kind === 'notice' && typeof payload.text === 'string') {
    return (
      <MessagePrimitive.Root className={cn('flex justify-center my-3', riseCls)} style={riseStyle} data-message-shell="system">
        <div className="max-w-[min(100%,540px)] flex items-start gap-2 px-3 py-1.5 rounded-md bg-coral-soft/60 border border-coral-soft text-coral-deep text-[11.5px] font-display">
          <span className="leading-[1.4] shrink-0">⚠</span>
          <span className="leading-[1.4]">{payload.text}</span>
        </div>
      </MessagePrimitive.Root>
    )
  }

  if (payload.kind === 'calendar_event') {
    const title = typeof payload.title === 'string' && payload.title.trim()
      ? payload.title.trim()
      : (openMaus ? '日历事件' : 'Calendar event')
    return (
      <MessagePrimitive.Root className={cn('flex justify-center my-3', riseCls)} style={riseStyle} data-message-shell="system">
        <div className="max-w-[min(100%,540px)] flex items-center gap-2 px-3 py-1.5 rounded-md bg-skype/10 border border-skype/20 text-skype text-[11.5px] font-display">
          <span className="leading-[1.4] shrink-0">📅</span>
          <span className="leading-[1.4]">{openMaus ? '日历提醒：' : "日历已触发："}{title}</span>
          {!openMaus && typeof payload.eventId === 'string' && <CalendarLink id={payload.eventId} />}
        </div>
      </MessagePrimitive.Root>
    )
  }

  const subjectId = payload.participantId
  if (!subjectId) return null
  const subject = byId[subjectId]
  // If the participant record hasn't loaded yet, omit the system row
  // entirely rather than leaking the raw id. The row will re-render once
  // the participants store catches up.
  if (!subject) return null
  // Open InfoPane for whoever was clicked — works for humans too now.
  const onClick = () => { if (!openMaus) openAgentInfo(subject.id) }

  // 'kicked' rows additionally name the actor (who did the kicking).
  // Other kinds are subject-only.
  const actor = payload.kind === 'kicked' && payload.actorId ? byId[payload.actorId] : null

  return (
    <MessagePrimitive.Root className={cn('flex justify-center my-3', riseCls)} style={riseStyle} data-message-shell="system">
      <div className="text-[11.5px] text-ink-300 italic font-display flex items-center gap-1.5 flex-wrap justify-center">
        {payload.kind === 'kicked' && actor ? (
          <>
            <SystemActor p={actor} onClick={() => { if (!openMaus) openAgentInfo(actor.id) }} disabled={openMaus} />
            <span>— {openMaus ? '将' : "已删除"}</span>
            <SystemActor p={subject} onClick={onClick} disabled={openMaus} />
            <span>{openMaus ? '移出群聊' : "来自小组"}</span>
          </>
        ) : (
          <>
            <SystemActor p={subject} onClick={onClick} disabled={openMaus} />
            <span>— {payload.kind === 'joined' ? (openMaus ? '加入了群聊' : "已加入群组")
              : payload.kind === 'left' ? (openMaus ? '退出了群聊' : "退群")
              : openMaus ? '更新了群聊' : payload.kind ?? 'updated the group'}</span>
          </>
        )}
      </div>
    </MessagePrimitive.Root>
  )
}

/** Small subject pill — avatar + name, clickable when it's an agent (opens
 *  the info pane). Centralized so SystemRow's variants stay readable. */
function SystemActor({ p, onClick, disabled = false }: { p: Participant; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || p.kind !== 'agent'}
      className="inline-flex items-center gap-1.5 not-italic font-semibold text-ink-500 hover:text-skype-deep transition disabled:cursor-default disabled:hover:text-ink-500"
    >
      <Avatar p={p} size={16} ringColor="var(--paper)" showStatus={false} />
      {p.name}
    </button>
  )
}

/** Inline citation card rendered above a reply's body. Click jumps to the
 *  quoted-original via the global hash trick (`#m-${id}`) — Message rows
 *  carry that id on the wrapper div so it works as a CSS scroll target. */
function QuoteCard({ msg }: { msg: Message }) {
  const byId = useParticipants((s) => s.byId)
  const jumpToMessage = useApp((s) => s.jumpToMessage)
  if (!msg.quotedMessageId) return null
  const summary = msg.quoted
  // Always go through useApp.jumpToMessage — ChatPane resolves via
  // virtuoso.scrollToIndex, which mounts a row that's been recycled OR was
  // never mounted. The old getElementById path silently no-op'd in those
  // cases — the bug the user hit.
  const targetId = msg.quotedMessageId
  const jump = () => { jumpToMessage(targetId) }
  if (!summary) {
    return (
      <button
        onClick={jump}
        className="mb-1.5 block max-w-full truncate text-left"
        style={{ width: 'min(580px, 62vw)' }}
      >
        <span className="text-[11.5px] italic text-ink-400">[消息已删除]</span>
      </button>
    )
  }
  const authorName = summary.authorName ?? byId[summary.authorId]?.name ?? summary.authorId
  const bodyPreview = summary.kind === 'tool'
    ? '[tool call]'
    : summary.body.slice(0, 140).replace(/\n/g, ' ')
  return (
    <button
      onClick={jump}
      className="mb-1.5 flex max-w-full items-baseline gap-1.5 text-left"
      style={{ width: 'min(580px, 62vw)' }}
      title="跳转至原文"
    >
      <span className="shrink-0 truncate text-[11.5px] font-semibold text-skype-deep">{authorName}</span>
      <span className="shrink-0 text-[10px] text-ink-300" aria-hidden>·</span>
      <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-500">{bodyPreview}</span>
    </button>
  )
}

/** Tiny reply icon — appears on hover, sets app.replyingTo so the composer
 *  picks up the quote draft. Composers are responsible for wiring this into
 *  the actual sendUserMessage call. */
function ReplyIconButton({ msg, zh = false }: { msg: Message; zh?: boolean }) {
  const setReplyingTo = useApp((s) => s.setReplyingTo)
  return (
    <button
      onClick={() => setReplyingTo(msg.conversationId, msg.id)}
      className="w-6 h-6 rounded-full hover:bg-sky2-50 grid place-items-center text-ink-400 hover:text-skype-deep"
      title={zh ? '回复' : "回复"}
      aria-label={zh ? '回复这条消息' : "回复此消息"}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 17 4 12 9 7" />
        <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
      </svg>
    </button>
  )
}

function LingxiImMessageImpl({ delay = 0, animate = true, openMaus = false }: LingxiImMessageProps) {
  const custom = useAuiState((state) => state.message.metadata.custom) as unknown as LingxiImMessageCustom
  const { message: msg, sender: author } = custom
  const adjacency = {
    isGroupStart: custom.groupStart,
    isGroupEnd: custom.groupEnd,
    isContinuedFromPrevious: custom.continuedFromPrevious,
    isContinuedToNext: custom.continuedToNext,
  }
  const openAgentInfo = useApp((s) => s.openAgentInfo)
  const openThreadView = useApp((s) => s.openThreadView)
  const [actionMenu, setActionMenu] = useState<{ x: number; y: number } | null>(null)
  if (custom.presentation.variant === 'system') return <SystemRow msg={msg} delay={delay} animate={animate} openMaus={openMaus} />
  const isHuman = author.kind === 'human'
  const isMine = custom.isMine
  const groupStart = adjacency?.isGroupStart ?? true
  const groupEnd = adjacency?.isGroupEnd ?? true

  const shell = custom.presentation
  const isStreaming = Boolean(msg.streaming)
  const avatarActivity = msg.streaming === 'placeholder'
    ? 'thinking'
    : msg.streaming === 'markdown'
      ? 'working'
      : undefined
  const onAvatarClick = () => {
    if (!isMine) openAgentInfo(author.id)
  }
  const copyBody = () => { if (msg.body) void navigator.clipboard.writeText(msg.body) }
  const actionItems: ContextMenuItem[] = [
    { label: '快速反应', submenu: QUICK_REACTIONS.slice(0, 6).map((emoji) => ({ label: emoji, onSelect: () => void toggleReaction(msg.id, emoji) })) },
    ...(shell.reply ? [{ label: '回复', onSelect: () => useApp.getState().setReplyingTo(msg.conversationId, msg.id) }] : []),
    { label: '在线程中打开', onSelect: () => openThreadView(msg.conversationId, msg.id) },
    ...(msg.body ? [{ label: '复制文字', onSelect: copyBody }] : []),
  ]
  return (
    <MessagePrimitive.Root
      id={`m-${msg.id}`}
      data-message-shell={shell.variant}
      data-message-kind={custom.originalKind}
      data-message-owner={isMine ? 'self' : 'other'}
      data-message-group-start={groupStart ? 'true' : 'false'}
      data-message-group-end={groupEnd ? 'true' : 'false'}
      className={cn(
        'group gap-3 items-start scroll-mt-20',
        openMaus
          ? 'flex'
          : isMine
            ? 'flex justify-end'
            : 'grid grid-cols-[38px_1fr]',
        openMaus && isMine && 'flex-row-reverse',
        animate && 'animate-rise',
      )}
      style={animate ? { animationDelay: `${delay}ms` } : undefined}
      onContextMenu={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('a, button, input, textarea, video, audio, [contenteditable="true"]')) return
        if (window.getSelection()?.toString()) return
        event.preventDefault(); setActionMenu({ x: event.clientX, y: event.clientY })
      }}
    >
      {openMaus ? (
        <div className={cn('shrink-0', isMine && 'hidden', !groupStart && 'invisible')}>
          <Avatar
            p={author}
            size={38}
            ringColor="var(--cloud)"
            statusOverride={avatarActivity}
            className={avatarActivity ? `agent-avatar-${avatarActivity}` : undefined}
          />
        </div>
      ) : !isMine ? (
        <button
          onClick={onAvatarClick}
          className={cn('cursor-pointer rounded-full transition hover:opacity-80 active:scale-95', !groupStart && 'invisible pointer-events-none')}
          title={`Show ${author.name}'s info`}
        >
          <Avatar
            p={author}
            size={38}
            ringColor="var(--cloud)"
            statusOverride={avatarActivity}
            className={avatarActivity ? `agent-avatar-${avatarActivity}` : undefined}
          />
        </button>
      ) : null}
      <div className={cn(
        'min-w-0',
        shell.selection && 'select-text',
        shell.attachmentHost && 'message-attachment-host',
        openMaus && 'max-w-[70%]',
        openMaus && isMine && 'flex flex-col items-end',
        !openMaus && isMine && 'ml-auto flex max-w-[84%] flex-col items-end',
      )}>
        {(groupStart || groupEnd) && <div className={cn(
          'mb-1 flex min-h-[17px] gap-2',
          openMaus ? 'items-baseline' : 'items-center',
          isMine && 'justify-end',
        )}>
          {groupStart && <span className="font-bold text-[13.5px] text-ink-900">{author.name}</span>}
          {groupStart && isHuman && !isMine && <HumanBadge />}
          {!isStreaming && groupEnd && <span className={cn('text-[10.5px] text-ink-300 tabular-nums', (!groupStart || isHuman) && 'ml-auto')}>{msg.at}</span>}
        </div>}

        {!isStreaming && shell.quote && <QuoteCard msg={msg} />}

        <LingxiMessageParts openMaus={openMaus} />
        {!isStreaming && <ReadReceiptStatus />}

        {msg.failed && (
          // Failed-to-send row: text + Retry + Dismiss buttons. The
          // bubble's id is still the optimistic tempId (the server
          // never persisted it), which is the key both store helpers
          // use. Retry re-runs sendUserMessage with the original body /
          // attachment / quote; Dismiss just drops the bubble locally
          // so it stops clogging the bottom of the conversation.
          <div className="mt-1 flex items-center gap-2 text-[11px] text-coral-deep">
            <span>{openMaus ? '发送失败' : "发送失败"}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void retryFailedMessage(msg.conversationId, msg.id) }}
              className="font-semibold underline underline-offset-2 hover:text-coral-700"
            >{openMaus ? '重试' : "重试"}</button>
            <span className="text-ink-300">·</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); discardFailedMessage(msg.conversationId, msg.id) }}
              className="font-semibold underline underline-offset-2 hover:text-coral-700"
            >{openMaus ? '移除' : "驳回"}</button>
          </div>
        )}

        {!isStreaming && !openMaus && (msg.replyCount ?? 0) > 0 && (
          <button
            onClick={() => openThreadView(msg.conversationId, msg.id)}
            className="mt-1 text-[11.5px] text-skype-deep hover:underline flex items-center gap-1"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 17 4 12 9 7" />
              <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
            </svg>
            {msg.replyCount} {msg.replyCount === 1 ? "回复" : "回复"}
          </button>
        )}

        {!isStreaming && shell.reactions && <div className="mt-2 flex flex-wrap gap-1 items-center">
          {/* Dedup by emoji at the render boundary — last writer wins.
              The store's mergeReactionOrder already keeps the array
              unique, but a defensive Map here guarantees the pill row
              never doubles up even if a future code path slips a
              duplicate through. */}
          {Array.from(
            new Map((msg.reactions ?? []).map((r) => [r.emoji, r])).values(),
          ).map((r) => <ReactionPill key={r.emoji} msgId={msg.id} r={r} />)}
          {/* Quick-reaction popup + reply button, visible on hover. */}
          <div className="message-action-tray reaction-quick-tray opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex gap-0.5">
            <QuickReactionButton msgId={msg.id} emoji="👀" />
            {shell.reply && <ReplyIconButton msg={msg} zh={openMaus} />}
            <button type="button" onClick={() => openThreadView(msg.conversationId, msg.id)} className="message-action-button" title="在线程中打开" aria-label="在线程中打开">↪</button>
            {msg.body && <button type="button" onClick={copyBody} className="message-action-button" title="复制文字" aria-label="复制文字">⧉</button>}
            <button type="button" onClick={(event) => { const r = event.currentTarget.getBoundingClientRect(); setActionMenu({ x: r.right, y: r.bottom + 4 }) }} className="message-action-button" title="更多" aria-label="更多消息操作">•••</button>
          </div>
        </div>}
      </div>
      {actionMenu && <ContextMenu x={actionMenu.x} y={actionMenu.y} items={actionItems} onClose={() => setActionMenu(null)} />}
    </MessagePrimitive.Root>
  )
}

/** Memoized wrapper around the native assistant-ui IM message shell. The big win for long threads is
 *  that WS streaming events (which fire many times per second during a
 *  chat-completion stream) only mutate ONE row's reference in the store —
 *  with default shallow equality, every OTHER row's memo holds and skips
 *  the re-render. Author updates still bust the memo because `author` is
 *  resolved upstream from a Map that is replaced on participant churn;
 *  that's fine — participant churn is rare. */
export const LingxiImMessage = memo(LingxiImMessageImpl)

/**
 * The typing indicator. Always reserves its own row height so the thread
 * doesn't shift up/down when typers come and go — only the inner content
 * fades in/out. Supports any number of typers ("Iris is typing…",
 * "Iris and Bram are typing…", "Iris, Bram and 2 more are typing…").
 */
