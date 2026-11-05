import {
  MessagePrimitive,
  useAui,
  useAuiState,
} from '@assistant-ui/react'
import { Copy01Icon, ReplyIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckCheck } from 'lucide-react'
import { type PointerEvent as ReactPointerEvent, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { RunActivityPillSlot } from '@/components/assistant-ui/elements/run-activity'
import { StatusNotice } from '@/components/assistant-ui/elements/status-notice'
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
  return <div role="group" aria-label="未确认消息操作" className="flex justify-end">
    <StatusNotice tone="undelivered" title="消息未送达" detail={error ?? metadata.sendError ?? '发送状态待确认，消息和附件已保留。'}
      action={{ label: '重新发送', busy, onClick: async () => {
        setBusy(true); setError(null)
        try { await chatTransport.retry(metadata.conversationId, metadata.clientMessageId) }
        catch { setError('暂时无法确认发送，请检查连接和权限后重试。') }
        finally { setBusy(false) }
      } }}
      secondary={{ label: '移除', disabled: busy, onClick: () => chatTransport.discard(metadata.conversationId, metadata.clientMessageId) }} />
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
  return <div className={cn('relative min-w-0', isAgent || !metadata.isMine ? 'w-full max-w-full' : 'w-fit max-w-[76%]', metadata.isMine && 'ms-auto')}>
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
        'min-w-0 conversation-message-body',
        !metadata.isMine && 'text-foreground',
        isHuman && metadata.delivery === 'failed' && 'ring-1 ring-destructive/50',
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
    <div className={cn('row-start-3 mt-2 flex flex-wrap gap-1.5', metadata.isMine ? 'justify-end' : 'justify-start', metadata.senderKind === 'human' && !metadata.isMine && 'col-start-2')}>
      {metadata.reactions.map((reaction) => (
        <Button
          key={reaction.emoji}
          type="button"
          variant="ghost"
          size="xs"
          data-reaction-mine={reaction.mine}
          aria-pressed={reaction.mine}
          className={cn(
            'h-6 gap-1 rounded-full border px-2 text-[12.5px] tabular-nums transition-colors',
            reaction.mine
              ? 'border-brand bg-brand-surface text-brand hover:bg-brand-surface'
              : 'border-border bg-background text-fg2 hover:bg-accent',
          )}
          aria-label={`${reaction.emoji} ${reaction.count} 个反应`}
          onClick={() => void chatTransport.toggleReaction(metadata.conversationId, messageId, reaction.emoji)}
        >
          <TwEmoji emoji={reaction.emoji} size={13} />
          <span>{reaction.count}</span>
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
  const createdAt = useAuiState((state) => state.message.createdAt)
  const timeLabel = createdAt && !custom.timestampMissing ? createdAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : null
  const awaitingContent = useAuiState((state) => (
    state.message.status?.type === 'running' && state.message.content.length === 0
  ))
  const rosterParticipant = useParticipants((state) => state.byId[custom.senderId])
  const quotedAuthor = useParticipants((state) => custom.quote ? state.byId[custom.quote.authorId] : undefined)
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
    <div data-message-footer data-align="end" data-delivery={custom.delivery}
      className={cn('flex items-center justify-end gap-1 whitespace-nowrap text-[11.5px] leading-4 tabular-nums',
        custom.delivery === 'sent' ? 'text-brand' : custom.delivery === 'sending' ? 'text-muted-foreground' : 'text-[#B7791F] dark:text-warning')}>
      <span role="status" aria-label={deliveryLabel} className="inline-flex items-center gap-1">
        {custom.delivery === 'sending' ? <span aria-hidden="true" className="size-2.5 rounded-full border-[1.5px] border-input border-t-muted-foreground motion-safe:animate-spin" />
          : custom.delivery === 'sent' ? <CheckCheck aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
          : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-[13px]"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>}
        <span className={custom.delivery === 'sent' ? 'sr-only group-hover/message:not-sr-only' : undefined}>{deliveryLabel}</span>
      </span>
    </div>
  ) : null
  const isAgent = custom.senderKind === 'agent'
  const name = participant ? participantDisplayName(participant) : custom.senderName
  const quotedName = custom.quote ? quotedAuthor ? participantDisplayName(quotedAuthor) : '引用消息' : null
  return (
    <MessagePrimitive.Root
      id={`m-${custom.clientMessageId}`}
      data-msg-id={custom.clientMessageId}
      data-msg-seq={custom.sequence ?? undefined}
      data-find-message-id={custom.clientMessageId}
      data-message-presentation={custom.presentation}
      data-message-continued-from={custom.continuedFromPrevious}
      data-sender-kind={custom.senderKind}
      className={cn(
        'group/message grid w-full shrink-0',
        custom.replyBranches && 'fade-in slide-in-from-bottom-1 animate-in duration-300 motion-reduce:animate-none',
        '[&[data-message-presentation=special-card]+[data-message-presentation=conversation][data-message-continued-from=true]]:mt-1',
        custom.continuedFromPrevious ? 'pt-1' : 'pt-3.5',
        custom.continuedToNext ? 'pb-0' : 'pb-3.5',
        isAgent || custom.isMine ? 'grid-cols-1' : 'grid-cols-[28px_minmax(0,1fr)] gap-x-2.5',
      )}
    >
      {!isAgent && !custom.isMine && <ConversationMessageAvatar participant={participant} isMobile={isMobile} isMine={false}
        groupStart={custom.groupStart} groupEnd={custom.groupEnd} />}
      <AgentRunPillScope enabled={isAgent && custom.groupStart} header={(slot) => (
        <div data-agent-header className="row-start-1 flex h-[26px] min-w-0 items-center gap-2">
          <ConversationMessageAvatar participant={participant} isMobile={isMobile} isMine={false} groupStart groupEnd={custom.groupEnd} inline />
          <span className="truncate text-[13px] font-semibold text-foreground">{name}</span>
          {custom.quote && <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-[13px] shrink-0"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 6 6v5" /></svg>
            <span className="truncate">回复 {quotedName}</span>
          </span>}
          <span ref={slot} data-run-pill-slot className="ms-1 flex min-w-0 empty:hidden" />
        </div>
      )}>
        {custom.groupStart && !custom.isMine && !isAgent && (
          <div className="col-start-2 row-start-1 mb-1.5 flex items-center gap-1 text-[12.5px] text-muted-foreground">
            <b className="font-semibold text-foreground">{name}</b>
            {timeLabel && <><span aria-hidden="true">·</span><time className="tabular-nums">{timeLabel}</time></>}
          </div>
        )}
        <div data-chat-message-content data-sender-kind={custom.senderKind} className={cn('row-start-2 grid w-full min-w-0 gap-1',
          isAgent ? custom.groupStart ? 'mt-3' : '' : custom.isMine ? 'max-w-full justify-self-end' : 'col-start-2 max-w-full justify-self-start', running && 'min-h-5')}>
          {awaitingContent && <TypingIndicator variant="bare" className="min-h-5 items-center px-0.5" />}
          {custom.quote && !(isAgent && custom.groupStart) && (custom.senderKind !== 'human' || !quoteInsideText) && (
            <div className={cn('min-w-0 max-w-md', custom.isMine && 'w-full justify-self-end')}>
              <MessageQuotePreview quote={custom.quote} />
            </div>
          )}
          <NativeMessageContent Text={MessageTextPart} footer={footer} mediaFooter={footer}
            attention={isAgent && custom.harness && custom.runId ? <HarnessDetails metadata={custom} /> : null} />
          {custom.isMine && custom.delivery === 'failed' && <FailedSendActions metadata={custom} />}
          {isAgent && <AssistantMessageActions />}
        </div>
        <Reactions metadata={custom} messageId={messageId} />
      </AgentRunPillScope>
    </MessagePrimitive.Root>
  )
}

/** Gives the agent's run disclosure a slot in the name row, as the design places it. */
function AgentRunPillScope({ enabled, header, children }: {
  enabled: boolean
  header: (slot: (node: HTMLElement | null) => void) => React.ReactNode
  children: React.ReactNode
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  if (!enabled) return <>{children}</>
  return <RunActivityPillSlot.Provider value={slot}>{header(setSlot)}{children}</RunActivityPillSlot.Provider>
}
