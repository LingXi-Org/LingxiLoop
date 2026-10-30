import {
  MessagePrimitive,
  useAui,
  useAuiState,
} from '@assistant-ui/react'
import { Copy01Icon, ReplyIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckCheck, LoaderCircle } from 'lucide-react'
import { type PointerEvent as ReactPointerEvent, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ConversationMessageAvatar } from './ConversationMessageAvatar'
import { MessageFooterContents, MessageFooterContext } from '@/components/assistant-ui/message-footer'
import { MarkdownText } from '@/components/assistant-ui/markdown-text'
import { TwEmoji } from '@/components/TwEmoji'
import { TypingIndicator } from '@/components/typing-indicator'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { useParticipants } from '@/features/agents/state'
import { useConversations } from '@/features/conversations/store'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import type { Participant } from '@/types'
import { participantDisplayName } from '@/lib/participantDisplayName'
import { chatTransport } from '../runtime/transport'
import type { LingxiMessageMetadata } from '../runtime/model'
import { NativeMessageContent } from './NativeMessageContent'
import { HarnessDetails } from './HarnessDetails'
import { chatLatency } from '../runtime/latency'
import { copyMessageText, MessageActions, useMessageCopyText } from './MessageActions'
import { AssistantMessageActions } from './AssistantMessageActions'
import { MessageQuotePreview } from './QuotePreview'

function FailedSendActions({ metadata }: { metadata: LingxiMessageMetadata }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return <div className="grid gap-1 text-xs text-muted-foreground" role="group" aria-label="未确认消息操作">
    <p role="status">{error ?? metadata.sendError ?? '发送状态待确认，消息和附件已保留。'}</p>
    <div className="flex justify-end gap-2">
      <Button type="button" variant="link" size="sm" disabled={busy} onClick={async () => {
        setBusy(true); setError(null)
        try { await chatTransport.retry(metadata.conversationId, metadata.clientMessageId) }
        catch { setError('暂时无法确认发送，请检查连接和权限后重试。') }
        finally { setBusy(false) }
      }}>核对并重试发送</Button>
      <Button type="button" variant="link" size="sm" disabled={busy} onClick={() => chatTransport.discard(metadata.conversationId, metadata.clientMessageId)}>移除待发消息</Button>
    </div>
  </div>
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '🔥'] as const

function MobileMessageActions({
  metadata,
  getText,
  open,
  onOpenChange,
}: {
  metadata: LingxiMessageMetadata
  getText: () => string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const aui = useAui()
  const messageId = useAuiState((state) => state.message.id)
  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
      <DrawerContent className="pb-[max(1rem,env(safe-area-inset-bottom))]">
        <DrawerTitle className="sr-only">消息操作</DrawerTitle>
        <DrawerDescription className="sr-only">快速回应、回复或复制这条消息</DrawerDescription>
        <div className="grid grid-cols-6 gap-1 px-4 pt-4" role="listbox" aria-label="快速回应">
          {QUICK_REACTIONS.map((emoji) => (
            <Button
              key={emoji}
              type="button"
              variant="ghost"
              size="icon-lg"
              className="size-11 rounded-2xl"
              role="option"
              aria-label={`使用 ${emoji} 回应`}
              onClick={() => {
                onOpenChange(false)
                void chatTransport.toggleReaction(metadata.conversationId, messageId, emoji)
              }}
            >
              <TwEmoji emoji={emoji} size={20} />
            </Button>
          ))}
        </div>
        <div className="mt-3 grid gap-1 px-4 pb-2">
          <Button
            type="button"
            variant="ghost"
            className="h-12 justify-start rounded-2xl"
            onClick={() => {
              aui.thread.composer().setQuote({ messageId: metadata.clientMessageId, text: getText() })
              onOpenChange(false)
            }}
          >
            <HugeiconsIcon icon={ReplyIcon} strokeWidth={2} />回复
          </Button>
          <Button type="button" variant="ghost" className="h-12 justify-start rounded-2xl" onClick={() => { void copyMessageText(getText()); onOpenChange(false) }}>
            <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />复制
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function MessageTextPart() {
  const isMobile = useIsMobile()
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false)
  const longPressTimer = useRef<number | null>(null)
  const longPressOrigin = useRef({ x: 0, y: 0 })
  const bodyRef = useRef<HTMLDivElement>(null)
  const metadata = useAuiState((state) => state.message.metadata.custom) as LingxiMessageMetadata
  const members = useConversations(state => state.list.find(conversation => conversation.id === metadata.conversationId)?.members)
  const participants = useParticipants(state => state.byId)
  const mentionTargets = useMemo(() => (members ?? []).flatMap(id => participants[id] ? [participants[id]] : []), [members, participants])
  const footer = useContext(MessageFooterContext)
  const isAgent = metadata.senderKind === 'agent'
  const isHuman = metadata.senderKind === 'human'
  const ownsQuote = useAuiState(state => state.message.parts[0] === state.part)
  const inlineCitations = Boolean(metadata.runId)
  const { rawText, confidenceClaims, getText } = useMessageCopyText(bodyRef,mentionTargets)
  useEffect(() => {
    if (!metadata.runId || metadata.isMine || !rawText.trim() || document.visibilityState !== 'visible') return
    if (bodyRef.current) chatLatency.painted(metadata.runId, bodyRef.current)
  }, [metadata.runId, metadata.isMine, rawText])
  const groupPosition = metadata.groupStart
    ? metadata.groupEnd ? 'single' : 'start'
    : metadata.groupEnd ? 'end' : 'middle'
  const bubbleRadius = groupPosition === 'single'
    ? 'rounded-[18px]'
    : metadata.isMine
      ? groupPosition === 'start'
        ? 'rounded-[18px_18px_4px_18px]'
        : groupPosition === 'end'
          ? 'rounded-[18px_4px_18px_18px]'
          : 'rounded-[18px_4px_4px_18px]'
      : groupPosition === 'start'
        ? 'rounded-[18px_18px_18px_4px]'
        : groupPosition === 'end'
          ? 'rounded-[4px_18px_18px_18px]'
          : 'rounded-[4px_18px_18px_4px]'
  const cancelLongPress = () => {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current)
    longPressTimer.current = null
  }
  const startLongPress = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isMobile || event.button !== 0) return
    if (event.target instanceof Element && event.target.closest('button, a, [data-confidence-id], [data-slot="confidence-basis"]')) return
    cancelLongPress()
    longPressOrigin.current = { x: event.clientX, y: event.clientY }
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null
      setMobileActionsOpen(true)
    }, 450)
  }
  const moveLongPress = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (Math.hypot(event.clientX - longPressOrigin.current.x, event.clientY - longPressOrigin.current.y) > 8) cancelLongPress()
  }
  useEffect(() => () => {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current)
  }, [])
  const markdown = <MarkdownText agent={isAgent} confidenceClaims={confidenceClaims} inlineCitations={inlineCitations} mentionTargets={mentionTargets} />
  return <div className={cn('relative min-w-0', isAgent ? 'w-full max-w-full' : 'w-fit max-w-[85%]', metadata.isMine && 'ms-auto')}>
    {!isMobile && !isAgent && <MessageActions isMine={metadata.isMine} getText={getText} />}
    <div
      ref={bodyRef}
      data-message-bubble={isHuman ? metadata.isMine ? 'user' : 'human' : undefined}
      data-agent-body={isAgent ? '' : undefined}
      data-message-group-position={groupPosition}
      onPointerDown={startLongPress}
      onPointerMove={moveLongPress}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onContextMenu={(event) => {
        if (!isMobile) return
        event.preventDefault()
        cancelLongPress()
        setMobileActionsOpen(true)
      }}
      className={cn(
        'min-w-0 tracking-[-0.01em]',
        isAgent ? 'text-[15px] leading-[1.7]' : 'text-[14.5px] leading-relaxed',
        isHuman && ['px-4 py-3', bubbleRadius],
        !metadata.isMine && 'text-foreground',
        isHuman && metadata.delivery === 'failed' && ['ring-1 ring-destructive/50', bubbleRadius],
      )}
    >
      {isHuman && ownsQuote && metadata.quote && <MessageQuotePreview quote={metadata.quote} />}
      {isAgent ? <>{markdown}{footer}</> : <MessageFooterContents inset={false}>{markdown}</MessageFooterContents>}
    </div>
    {isMobile && <MobileMessageActions metadata={metadata} getText={getText} open={mobileActionsOpen} onOpenChange={setMobileActionsOpen} />}
  </div>
}

function Reactions({ metadata, messageId }: { metadata: LingxiMessageMetadata; messageId: string }) {
  if (metadata.reactions.length === 0) return null
  return (
    <div className={cn('row-start-3 mt-1 flex flex-wrap gap-1', metadata.isMine ? 'justify-end' : 'justify-start')}>
      {metadata.reactions.map((reaction) => (
        <Button
          key={reaction.emoji}
          type="button"
          variant="ghost"
          size="xs"
          data-reaction-mine={reaction.mine}
          aria-pressed={reaction.mine}
          className={cn(
            'h-[26px] gap-1 rounded-full px-2 text-xs tabular-nums transition-all hover:scale-105',
            reaction.mine
              ? 'border-primary/30 bg-accent text-accent-foreground hover:bg-accent/80'
              : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
          aria-label={`${reaction.emoji} ${reaction.count} 个反应`}
          onClick={() => void chatTransport.toggleReaction(metadata.conversationId, messageId, reaction.emoji)}
        >
          <TwEmoji emoji={reaction.emoji} size={16} />
          <span className="text-xs font-medium">{reaction.count}</span>
        </Button>
      ))}
    </div>
  )
}

export function ConversationMessage() {
  const isMobile = useIsMobile()
  const custom = useAuiState((state) => state.message.metadata.custom) as LingxiMessageMetadata
  const quoteInsideText = useAuiState(state => state.message.content[0]?.type === 'text')
  const running = useAuiState((state) => state.message.status?.type === 'running')
  const messageId = useAuiState((state) => state.message.id)
  const awaitingContent = useAuiState((state) => (
    state.message.status?.type === 'running' && state.message.content.length === 0
  ))
  const rosterParticipant = useParticipants((state) => state.byId[custom.senderId])
  const participant: Participant | undefined = rosterParticipant ?? (custom.senderKind === 'agent' ? {
    id: custom.senderId,
    kind: 'agent',
    name: custom.senderName,
    initial: custom.senderName.trim().slice(0, 1) || '智',
    avatarBg: 'transparent',
    avatarUrl: null,
    status: 'avail',
  } : undefined)
  // The external runtime adds an empty assistant placeholder after a mid-run user turn.
  // Real replies come from the transport and already carry their own typing state.
  if (custom.schema !== 'lingxiloop.thread-message.v2') return null
  const deliveryLabel = custom.delivery === 'sending' ? '发送中' : custom.delivery === 'sent' ? '已送达'
    : custom.sendError?.startsWith('自动发送已停止') ? '自动发送已停止' : custom.sendError ? '发送状态待确认' : '发送失败'
  const footer = custom.isMine ? (
    <div data-message-footer data-align="end" className="flex items-center justify-end gap-2 whitespace-nowrap text-xs leading-4 tabular-nums text-muted-foreground">
      <span role="status" aria-label={deliveryLabel}>
        {custom.delivery === 'sending' ? <LoaderCircle aria-hidden="true" className="size-3.5 motion-safe:animate-spin" />
          : custom.delivery === 'sent' ? <CheckCheck aria-hidden="true" className="size-3.5" /> : deliveryLabel}
      </span>
    </div>
  ) : null
  return (
    <MessagePrimitive.Root
      id={`m-${custom.clientMessageId}`}
      data-msg-id={custom.clientMessageId}
      data-msg-seq={custom.sequence ?? undefined}
      data-find-message-id={custom.clientMessageId}
      data-message-presentation={custom.presentation}
      data-message-continued-from={custom.continuedFromPrevious}
      className={cn(
        'group/message grid w-full shrink-0',
        custom.replyBranches && 'fade-in slide-in-from-bottom-1 animate-in duration-300 motion-reduce:animate-none',
        'px-[clamp(1rem,3cqw,2.5rem)]',
        isMobile ? 'gap-x-2' : 'gap-x-2.5',
        '[&[data-message-presentation=special-card]+[data-message-presentation=conversation][data-message-continued-from=true]]:mt-1',
        custom.continuedFromPrevious ? 'pt-1' : 'pt-3',
        custom.continuedToNext ? 'pb-0' : 'pb-3',
        custom.isMine ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-[auto_minmax(0,1fr)]',
      )}
    >
      <ConversationMessageAvatar participant={participant} isMobile={isMobile} isMine={custom.isMine}
        groupStart={custom.groupStart} groupEnd={custom.groupEnd} />
      <div className={cn('contents', custom.isMine ? '[&>div]:col-start-1' : '[&>div]:col-start-2')}>
        {custom.groupStart && !custom.isMine && (
          <div className="row-start-1 mb-1 flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <span className="font-medium">{participant ? participantDisplayName(participant) : custom.senderName}</span>
          </div>
        )}
        <div data-chat-message-content data-sender-kind={custom.senderKind} className={cn('row-start-2 grid w-full max-w-[800px] min-w-0 gap-0.5', custom.isMine ? 'justify-self-end' : 'justify-self-start', running && 'min-h-5')}>
          {awaitingContent && <TypingIndicator variant="bare" className="min-h-5 items-center px-0.5" />}
          {custom.quote && (custom.senderKind !== 'human' || !quoteInsideText) && (
            <div className={cn('min-w-0 max-w-md', custom.isMine && 'w-full justify-self-end')}>
              <MessageQuotePreview quote={custom.quote} />
            </div>
          )}
          <NativeMessageContent Text={MessageTextPart} footer={footer} mediaFooter={footer}
            attention={custom.senderKind === 'agent' && custom.harness && custom.runId ? <HarnessDetails metadata={custom} /> : null} />
          {custom.isMine && custom.delivery === 'failed' && <FailedSendActions metadata={custom} />}
          {custom.senderKind === 'agent' && <AssistantMessageActions />}
        </div>
        <Reactions metadata={custom} messageId={messageId} />
      </div>
    </MessagePrimitive.Root>
  )
}
