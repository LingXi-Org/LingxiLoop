import {
  MessagePrimitive,
  type ReasoningMessagePartProps,
  type SourceMessagePartProps,
  useAui,
  useAuiState,
} from '@assistant-ui/react'
import { Copy01Icon, ReplyIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createContext, type PointerEvent as ReactPointerEvent, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { AttachmentCard } from '@/components/assistant-ui/elements/attachment-card'
import { ProgressCard } from '@/components/assistant-ui/elements/progress-card'
import { confidenceCopyText, type MarkdownConfidenceClaim, MarkdownText } from '@/components/assistant-ui/markdown-text'
import { MessageFooterContents, MessageFooterContext } from '@/components/assistant-ui/message-footer'
import { TwEmoji } from '@/components/TwEmoji'
import { TypingIndicator } from '@/components/typing-indicator'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { useParticipants } from '@/features/agents/state'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { useConversationUi } from '@/stores/conversationUi'
import type { Participant } from '@/types'
import { chatTransport, type LingxiMessageMetadata } from '../runtime'
import { HarnessDetails } from './HarnessDetails'
import { copyMessageText, MessageActions } from './MessageActions'
import { CHAT_TOOL_RENDERERS, isVisibleChatPart } from './ToolRenderers'

export const MessageAnimationBaseline = createContext(Infinity)

function ReasoningPart({ status }: ReasoningMessagePartProps) {
  return <ProgressCard title="处理进度" steps={[{
    id: 'reasoning', label: '思考过程',
    status: status.type === 'running' ? 'running' : status.type === 'complete' ? 'complete' : 'stopped',
    detail: <MarkdownText />,
  }]} />
}

function SourcePart({ url, title }: SourceMessagePartProps) {
  return <div className="w-fit max-w-full rounded-[18px] bg-muted px-3.5 py-2"><MessageFooterContents inset={false}>{url
    ? <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary underline underline-offset-2">{title ?? url}</a>
    : <span className="text-xs text-muted-foreground">{title}</span>}</MessageFooterContents></div>
}

function QuotePart({ text, messageId }: { text: string; messageId: string }) {
  const jumpToMessage = useConversationUi((state) => state.jumpToMessage)
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => jumpToMessage(messageId)}
      className="mb-2 h-auto w-full max-w-md justify-start rounded-none border-s-2 border-primary/60 px-0 ps-2 text-start text-xs font-normal text-muted-foreground"
    >
      <span className="line-clamp-2">{text || '原消息不可用'}</span>
    </Button>
  )
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
              aui.thread.composer().setQuote({ messageId, text: getText() })
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
  const animationBaseline = useContext(MessageAnimationBaseline)
  const interrupted = useAuiState((state) => state.message.status?.type === 'incomplete'
    && ['error', 'cancelled'].includes(state.message.status.reason))
    && (!metadata.harness?.message || metadata.harness.message.envelope.requestVersion !== metadata.harness.requestVersion)
  const inlineCitations = Boolean(metadata.harness && (!metadata.harness.message
    || ['queued', 'leased'].includes(metadata.harness.lifecycle ?? '')
    || metadata.harness.message.envelope.citationEvidence !== undefined))
  const rawText = useAuiState((state) => state.message.content
    .filter((part): part is Extract<(typeof state.message.content)[number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n'))
  const confidenceClaims = useAuiState((state) => {
    const part = state.message.content.find((part) => part.type === 'tool-call' && part.toolName === 'cite_claims')
    if (part?.type !== 'tool-call' || !part.result || typeof part.result !== 'object') return undefined
    const claims = (part.result as { claims?: unknown }).claims
    return Array.isArray(claims) ? claims as MarkdownConfidenceClaim[] : undefined
  })
  const getText = () => {
    if (inlineCitations) {
      const ranges = Array.from(bodyRef.current?.querySelectorAll<HTMLElement>('[data-citation-start]') ?? []).flatMap(node => {
        const start = Number(node.dataset.citationStart), end = Number(node.dataset.citationEnd)
        const link = /^\[([\s\S]+)\]\(#cite-[^)]*\)$/.exec(rawText.slice(start, end))
        return link && Number.isSafeInteger(start) && Number.isSafeInteger(end) && end <= rawText.length
          ? [{ start, end, text: node.dataset.citationHidden ? '' : link[1] }] : []
      })
      return confidenceCopyText(rawText, ranges)
    }
    const renderedIds = new Set(Array.from(bodyRef.current?.querySelectorAll<HTMLElement>('[data-confidence-id]') ?? [], node => node.dataset.confidenceId))
    return confidenceCopyText(rawText, confidenceClaims?.filter(claim => renderedIds.has(claim.id)))
  }
  const groupPosition = metadata.groupStart
    ? metadata.groupEnd ? 'single' : 'start'
    : metadata.groupEnd ? 'end' : 'middle'
  const bubbleRadius = groupPosition === 'single'
    ? 'rounded-[18px]'
    : metadata.isMine
      ? groupPosition === 'start'
        ? 'rounded-[18px_18px_6px_18px]'
        : groupPosition === 'end'
          ? 'rounded-[18px_6px_18px_18px]'
          : 'rounded-[18px_6px_6px_18px]'
      : groupPosition === 'start'
        ? 'rounded-[18px_18px_18px_6px]'
        : groupPosition === 'end'
          ? 'rounded-[6px_18px_18px_18px]'
          : 'rounded-[6px_18px_18px_6px]'
  const cancelLongPress = () => {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current)
    longPressTimer.current = null
  }
  const startLongPress = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isMobile || event.button !== 0) return
    if (event.target instanceof Element && event.target.closest('[data-confidence-id], [data-slot="confidence-basis"]')) return
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
  const markdown = <MarkdownText segmented={!metadata.isMine} confidenceClaims={confidenceClaims} inlineCitations={inlineCitations}
    interrupted={interrupted} animateEntry={metadata.sequence !== null && metadata.sequence > animationBaseline} />
  return <div className={cn('relative min-w-0 w-fit', isMobile ? 'max-w-full' : 'max-w-[85%]', metadata.isMine && 'ms-auto')}>
    {!isMobile && <MessageActions isMine={metadata.isMine} getText={getText} />}
    <div
      ref={bodyRef}
      data-message-bubble={metadata.isMine ? 'user' : 'assistant'}
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
        isMobile ? 'text-base leading-[1.5]' : 'text-[15px] leading-[1.35]',
        metadata.isMine && ['px-3.5 py-2', bubbleRadius, 'bg-primary text-primary-foreground [&_[data-message-footer]]:text-primary-foreground/75 [&_.typeset]:!text-primary-foreground [&_.typeset_*]:!text-primary-foreground'],
        !metadata.isMine && 'text-foreground',
        metadata.delivery === 'failed' && ['ring-1 ring-destructive/50', bubbleRadius],
      )}
    >
      {metadata.isMine ? <MessageFooterContents inset={false}>{markdown}</MessageFooterContents> : markdown}
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
  const isSpecialCard = custom.presentation === 'special-card'
  const running = useAuiState((state) => state.message.status?.type === 'running')
  const createdAt = useAuiState((state) => state.message.createdAt)
  const messageId = useAuiState((state) => state.message.id)
  const content = useAuiState((state) => state.message.content)
  const lastVisiblePart = content.reduce((last, part, index) => isVisibleChatPart(part) ? index : last, -1)
  const attachments = useMemo(() => {
    const items: Array<{
      id: string
      filename: string
      data: string
      mimeType: string
      sourceType?: 'url' | 'id'
    }> = []
    content.forEach((part, index) => {
      if (part.type === 'image' && typeof part.image === 'string') {
        items.push({
          id: `${messageId}-${index}`,
          filename: part.filename ?? '图片附件',
          data: part.image,
          mimeType: 'image/*',
        })
      } else if (part.type === 'file') {
        items.push({
          id: `${messageId}-${index}`,
          filename: part.filename ?? '附件',
          data: part.data,
          mimeType: part.mimeType,
          sourceType: part.sourceType,
        })
      }
    })
    return items
  }, [content, messageId])
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
  if (custom.schema !== 'lingxiloop.thread-message.v1') return null
  const showTime = !running && !custom.timestampMissing && Number.isFinite(createdAt.getTime()) && createdAt.getTime() > 0
  const showDelivery = custom.isMine && custom.delivery !== 'sent'
  const deliveryLabel = showDelivery ? custom.delivery === 'sending' ? '发送中…' : '发送失败' : null
  const footer = showTime || showDelivery ? (
    <div data-message-footer data-align="end" className="flex items-center justify-end gap-2 whitespace-nowrap text-[11px] leading-4 tabular-nums text-muted-foreground sm:text-[10px]">
      {showTime && <time dateTime={createdAt.toISOString()}>{createdAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>}
      {deliveryLabel && <span>{deliveryLabel}</span>}
    </div>
  ) : null
  const attachmentFooter = deliveryLabel ? <span className="whitespace-nowrap text-xs text-muted-foreground">{deliveryLabel}</span> : null
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
        isMobile ? 'gap-x-2 px-2.5' : 'gap-x-2.5 px-3 sm:px-4',
        '[&[data-message-presentation=special-card]+[data-message-presentation=conversation][data-message-continued-from=true]]:mt-1',
        custom.continuedFromPrevious ? isSpecialCard ? 'pt-1' : 'pt-px' : 'pt-1.5',
        custom.continuedToNext ? isSpecialCard ? 'pb-0' : 'pb-px' : 'pb-1.5',
        custom.isMine ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-[auto_minmax(0,1fr)]',
      )}
    >
      <div className={cn(
        'row-start-2 flex self-center',
        isMobile ? 'w-8' : 'w-10',
        custom.isMine ? 'col-start-2' : 'col-start-1',
        custom.groupStart && participant?.kind === 'agent' && 'chat-message-avatar',
        custom.groupStart && participant?.kind === 'agent' && participant.status === 'thinking' && 'bloub-activity-thinking',
        custom.groupStart && participant?.kind === 'agent' && participant.status === 'working' && 'bloub-activity-working',
      )}>
        {(custom.isMine ? custom.groupEnd : custom.groupStart) && participant && (
          <Avatar p={participant} size={isMobile ? 32 : 38} ringColor="var(--background)" mode="chat" className="transition-[width,height] duration-200" />
        )}
      </div>
      <div className={cn('contents', custom.isMine ? '[&>div]:col-start-1' : '[&>div]:col-start-2')}>
        {custom.groupStart && !custom.isMine && (
          <div className={cn('row-start-1 mb-1 flex items-center gap-2 px-1 text-muted-foreground', isMobile ? 'text-xs' : 'text-[11px]')}>
            <span className="font-medium">{custom.senderName}</span>
          </div>
        )}
        <div className={cn('row-start-2 grid w-full min-w-0 gap-0.5', running && 'min-h-5')}>
          {awaitingContent && <TypingIndicator variant="bare" className="min-h-5 items-center px-0.5" />}
          {attachments.length > 0 && <div data-slot="message-attachments" className={cn('flex w-full min-w-0 flex-col gap-1', custom.isMine && 'items-end')}>
            {attachments.map((attachment, index) => <MessageFooterContext.Provider key={attachment.id}
              value={lastVisiblePart < 0 && index === attachments.length - 1 ? attachmentFooter : null}>
              <AttachmentCard {...attachment} />
            </MessageFooterContext.Provider>)}
          </div>}
          {custom.quote && <QuotePart text={custom.quote.text} messageId={custom.quote.messageId} />}
          {content.map((part, index) => <MessageFooterContext.Provider key={part.type === 'tool-call' ? part.toolCallId : index}
            value={index === lastVisiblePart ? footer : null}>
            <MessagePrimitive.PartByIndex index={index} components={{
              Text: MessageTextPart,
              Reasoning: ReasoningPart,
              Image: () => null,
              File: () => null,
              Source: SourcePart,
              tools: CHAT_TOOL_RENDERERS,
            }} />
          </MessageFooterContext.Provider>)}
          {custom.senderKind === 'agent' && custom.messageKind === 'text' && custom.runId && <HarnessDetails metadata={custom} />}
          {!custom.harness && <MessagePrimitive.Error>
            <div className="mt-2 text-xs text-destructive">消息生成失败</div>
          </MessagePrimitive.Error>}
        </div>
        <Reactions metadata={custom} messageId={messageId} />
      </div>
    </MessagePrimitive.Root>
  )
}
