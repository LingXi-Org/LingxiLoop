import { memo } from 'react'
import { MessagePrimitive, useAuiState } from '@assistant-ui/react'
import type { LingxiImMessageCustom } from '@/im/assistantMessage'
import { cn } from '@/lib/utils'
import { useConversationUi } from '@/stores/conversationUi'
import { useSurface } from '@/stores/surface'
import { discardFailedMessage, retryFailedMessage, toggleReaction } from '@/stores/messages'
import { Avatar } from '../Avatar'
import { HumanBadge } from '../HumanBadge'
import { LingxiMessageParts } from './LingxiMessageParts'
import { QuoteCard } from './MessageQuote'
import { QUICK_REACTIONS, ReactionPill } from './MessageReactions'
import { ReadReceiptStatus } from './ReadReceiptStatus'
import { SystemRow } from './SystemMessageRow'
import { Message, MessageAvatar, MessageContent, MessageFooter, MessageHeader } from '@/components/ui/message'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu'

interface MessageMenuItem {
  label: string
  onSelect?: () => void
  submenu?: MessageMenuItem[]
}

function MessageMenuItems({ items }: { items: MessageMenuItem[] }) {
  return items.map((item, index) => item.submenu?.length
    ? <ContextMenuSub key={`${item.label}:${index}`}><ContextMenuSubTrigger>{item.label}</ContextMenuSubTrigger><ContextMenuSubContent><MessageMenuItems items={item.submenu} /></ContextMenuSubContent></ContextMenuSub>
    : <ContextMenuItem key={`${item.label}:${index}`} onClick={item.onSelect}>{item.label}</ContextMenuItem>)
}

interface LingxiImMessageProps {
  delay?: number
  animate?: boolean
  /** Desktop-only OpenMaus presentation. Shared/mobile callers keep the
   *  established message layout when this flag is omitted. */
  openMaus?: boolean
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
  const openAgentInfo = useSurface((s) => s.openAgentInfo)
  const openThreadView = useSurface((s) => s.openThreadView)
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
  const actionItems: MessageMenuItem[] = [
    { label: '快速反应', submenu: QUICK_REACTIONS.slice(0, 6).map((emoji) => ({ label: emoji, onSelect: () => void toggleReaction(msg.id, emoji) })) },
    ...(shell.reply ? [{ label: '回复', onSelect: () => useConversationUi.getState().setReplyingTo(msg.conversationId, msg.id) }] : []),
    ...(msg.body ? [{ label: '复制文字', onSelect: copyBody }] : []),
  ]
  const reactionEntries = Array.from(
    new Map((msg.reactions ?? []).map((reaction) => [reaction.emoji, reaction])).values(),
  )
  const bubbleReactions = !isStreaming && shell.reactions && reactionEntries.length > 0
    ? reactionEntries.map((reaction) => <ReactionPill key={reaction.emoji} msgId={msg.id} reaction={reaction} />)
    : undefined
  const hasTextBubble = Boolean(msg.body) && shell.bubble
  return (
    <MessagePrimitive.Root
      id={`m-${msg.id}`}
      data-message-shell={shell.variant}
      data-message-kind={custom.originalKind}
      data-message-owner={isMine ? 'self' : 'other'}
      data-message-group-start={groupStart ? 'true' : 'false'}
      data-message-group-end={groupEnd ? 'true' : 'false'}
      className={cn(
        'group scroll-mt-20',
        animate && 'animate-rise',
      )}
      style={animate ? { animationDelay: `${delay}ms` } : undefined}
    >
      <ContextMenu>
      <ContextMenuTrigger render={<Message
        align={isMine ? 'end' : 'start'}
        className={cn(!isMine && 'gap-3')}
        data-message-continuation={!groupStart ? 'true' : 'false'}
      onContextMenuCapture={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('a, button, input, textarea, video, audio, [contenteditable="true"]') || window.getSelection()?.toString()) event.stopPropagation()
      }}
      />}>
      {!groupStart ? (
        <MessageAvatar className="!w-12" aria-hidden="true" />
      ) : openMaus ? (
        <MessageAvatar className={cn(!groupStart && 'invisible', shell.avatarAlignment === 'top' && '!self-start !translate-y-0')}>
          <Avatar
            p={author}
            size={48}
            ringColor="transparent"
            statusOverride={avatarActivity}
            mode="chat"
            className={cn('chat-message-avatar', avatarActivity && `agent-avatar-${avatarActivity}`)}
          />
        </MessageAvatar>
      ) : !isMine ? (
        <MessageAvatar className={cn(!groupStart && 'invisible pointer-events-none', shell.avatarAlignment === 'top' && '!self-start !translate-y-0')}>
          <button
            onClick={onAvatarClick}
            className="cursor-pointer rounded-full transition hover:opacity-80 active:scale-95"
            title={`Show ${author.name}'s info`}
          >
            <Avatar
              p={author}
              size={48}
              ringColor="transparent"
              statusOverride={avatarActivity}
              mode="chat"
              className={cn('chat-message-avatar', avatarActivity && `agent-avatar-${avatarActivity}`)}
            />
          </button>
        </MessageAvatar>
      ) : (
        <MessageAvatar className={cn(!groupStart && 'invisible pointer-events-none', shell.avatarAlignment === 'top' && '!self-start !translate-y-0')}>
          <Avatar
            p={author}
            size={48}
            ringColor="transparent"
            mode="chat"
            className="chat-message-avatar"
          />
        </MessageAvatar>
      )}
      <MessageContent className={cn(
        shell.selection && 'select-text',
        shell.attachmentHost && 'message-attachment-host',
      )}>
        {groupStart && <MessageHeader className={cn(
          openMaus ? 'items-baseline' : 'items-center',
          isMine && 'justify-end',
        )}>
          {groupStart && <span className="font-bold text-[13.5px] text-ink-900">{author.name}</span>}
          {groupStart && isHuman && !isMine && <HumanBadge />}
          {!isStreaming && <span className={cn('text-[10.5px] text-ink-300 tabular-nums', isHuman && 'ml-auto')}>{msg.at}</span>}
        </MessageHeader>}

        {!isStreaming && shell.quote && <QuoteCard message={msg} />}

        <LingxiMessageParts openMaus={openMaus} bubbleReactions={hasTextBubble ? bubbleReactions : undefined} />
        <MessageFooter>
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

        {!hasTextBubble && bubbleReactions && <div className="mt-2 flex flex-wrap items-center gap-1">{bubbleReactions}</div>}
        </MessageFooter>
      </MessageContent>
      </ContextMenuTrigger>
      <ContextMenuContent aria-label="消息操作"><MessageMenuItems items={actionItems} /></ContextMenuContent>
      </ContextMenu>
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
