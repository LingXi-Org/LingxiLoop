import {
  ActionBarPrimitive,
  MessagePrimitive,
  type ReasoningMessagePartProps,
  type SourceMessagePartProps,
  useAui,
  useAuiState,
} from '@assistant-ui/react'
import { Copy01Icon, ReplyIcon, SmilePlusIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { ArtifactCard } from '@/components/assistant-ui/elements/artifact-card'
import { conversationCardSize } from '@/components/assistant-ui/elements/surfaces'
import { type MarkdownConfidenceClaim, MarkdownText } from '@/components/assistant-ui/markdown-text'
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
import { CHAT_TOOL_RENDERERS, HostToolTimeline } from './ToolRenderers'

function ReasoningPart({ status }: ReasoningMessagePartProps) {
  return (
    <details className="my-2 rounded-xl border border-border bg-muted/30 px-3 py-2" open={status.type === 'running'}>
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
        {status.type === 'running' ? '正在思考…' : '思考过程'}
      </summary>
      <div className="mt-2 text-xs leading-5 text-muted-foreground"><MarkdownText /></div>
    </details>
  )
}

function SourcePart({ url, title }: SourceMessagePartProps) {
  return url
    ? <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary underline underline-offset-2">{title ?? url}</a>
    : <span className="text-xs text-muted-foreground">{title}</span>
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

function MessageActions({
  metadata,
  text,
}: {
  metadata: LingxiMessageMetadata
  text: string
}) {
  const aui = useAui()
  const messageId = useAuiState((state) => state.message.id)
  const [showReactions, setShowReactions] = useState(false)
  return (
    <ActionBarPrimitive.Root className={cn(
      'absolute top-1/2 z-30 flex -translate-y-1/2 items-center gap-0.5 bg-transparent text-foreground opacity-0 invisible transition-opacity group-hover/message:visible group-hover/message:opacity-100',
      metadata.isMine ? 'end-full me-2' : 'start-full ms-2',
    )} role="toolbar" aria-label="消息操作" onMouseLeave={() => setShowReactions(false)}>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="size-7 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        aria-label="回复"
        onClick={(event) => {
          aui.thread.composer().setQuote({ messageId, text })
          event.currentTarget.blur()
        }}
      >
        <HugeiconsIcon icon={ReplyIcon} strokeWidth={2} />
      </Button>
      <div className="relative">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-7 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          aria-label="添加表情"
          aria-expanded={showReactions}
          onClick={() => setShowReactions((open) => !open)}
        >
          <HugeiconsIcon icon={SmilePlusIcon} strokeWidth={2} />
        </Button>
        {showReactions && (
          <div className="absolute bottom-full start-1/2 z-40 mb-2 flex -translate-x-1/2 items-center gap-0.5 rounded-[10px] border border-border bg-popover p-1 shadow-md" role="listbox" aria-label="选择消息表情">
            {QUICK_REACTIONS.map((emoji) => (
              <Button
                key={emoji}
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-8 rounded-lg transition-transform hover:scale-125 hover:bg-accent"
                role="option"
                aria-label={`使用 ${emoji} 回应`}
                onClick={() => {
                  setShowReactions(false)
                  void chatTransport.toggleReaction(metadata.conversationId, messageId, emoji)
                }}
              >
                <TwEmoji emoji={emoji} size={18} />
              </Button>
            ))}
          </div>
        )}
      </div>
      <ActionBarPrimitive.Copy asChild>
        <Button type="button" variant="ghost" size="icon-xs" className="size-7 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground" aria-label="复制" onClick={(event) => event.currentTarget.blur()}>
          <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
        </Button>
      </ActionBarPrimitive.Copy>
    </ActionBarPrimitive.Root>
  )
}

function MobileMessageActions({
  metadata,
  text,
  open,
  onOpenChange,
}: {
  metadata: LingxiMessageMetadata
  text: string
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
              aui.thread.composer().setQuote({ messageId, text })
              onOpenChange(false)
            }}
          >
            <HugeiconsIcon icon={ReplyIcon} strokeWidth={2} />回复
          </Button>
          <ActionBarPrimitive.Copy asChild>
            <Button type="button" variant="ghost" className="h-12 justify-start rounded-2xl" onClick={() => onOpenChange(false)}>
              <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />复制
            </Button>
          </ActionBarPrimitive.Copy>
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
  const metadata = useAuiState((state) => state.message.metadata.custom) as LingxiMessageMetadata
  const text = useAuiState((state) => state.message.content
    .filter((part): part is Extract<(typeof state.message.content)[number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n'))
  const confidenceClaims = useAuiState((state) => {
    const part = state.message.content.find((part) => part.type === 'tool-call' && part.toolName === 'cite_claims')
    if (part?.type !== 'tool-call' || !part.result || typeof part.result !== 'object') return undefined
    const claims = (part.result as { claims?: unknown }).claims
    return Array.isArray(claims) ? claims as MarkdownConfidenceClaim[] : undefined
  })
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
  return <div className={cn('relative w-fit', isMobile ? 'max-w-[88%]' : 'max-w-[75%]', metadata.isMine && 'ms-auto')}>
    {!isMobile && <MessageActions metadata={metadata} text={text} />}
    <div
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
        metadata.isMine && ['px-3.5 py-2', bubbleRadius, 'bg-primary text-primary-foreground [&_.typeset]:!text-primary-foreground [&_.typeset_*]:!text-primary-foreground'],
        !metadata.isMine && 'text-foreground',
        metadata.delivery === 'failed' && ['ring-1 ring-destructive/50', bubbleRadius],
      )}
    >
      <MarkdownText segmented={!metadata.isMine} confidenceClaims={confidenceClaims} />
    </div>
    {isMobile && <MobileMessageActions metadata={metadata} text={text} open={mobileActionsOpen} onOpenChange={setMobileActionsOpen} />}
  </div>
}

function Reactions({ metadata, messageId }: { metadata: LingxiMessageMetadata; messageId: string }) {
  if (metadata.reactions.length === 0) return null
  return (
    <div className={cn('mt-1 flex flex-wrap gap-1', metadata.isMine ? 'justify-end' : 'justify-start')}>
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
  const showInheritedChrome = isSpecialCard && custom.groupStart && custom.clusterChromeAt !== null
  const showMessageChrome = !isSpecialCard && custom.clusterChromeAt === null
  const createdAt = useAuiState((state) => state.message.createdAt)
  const messageId = useAuiState((state) => state.message.id)
  const content = useAuiState((state) => state.message.content)
  const attachments = useMemo(() => {
    const items: Array<{
      id: string
      filename: string
      data: string
      mimeType: string
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
  const chromeAt = custom.clusterChromeAt === null ? createdAt : new Date(custom.clusterChromeAt)
  return (
    <MessagePrimitive.Root
      id={`m-${custom.clientMessageId}`}
      data-msg-id={custom.clientMessageId}
      data-msg-seq={custom.sequence ?? undefined}
      data-find-message-id={custom.clientMessageId}
      data-message-presentation={custom.presentation}
      data-message-continued-from={custom.continuedFromPrevious}
      className={cn(
        'group/message flex w-full shrink-0',
        isMobile ? 'gap-2 px-2.5' : 'gap-2.5 px-3 sm:px-4',
        '[&[data-message-presentation=special-card]+[data-message-presentation=conversation][data-message-continued-from=true]]:mt-1',
        custom.continuedFromPrevious ? isSpecialCard ? 'pt-1' : 'pt-px' : 'pt-1.5',
        custom.continuedToNext ? isSpecialCard ? 'pb-0' : 'pb-px' : 'pb-1.5',
        custom.isMine && 'flex-row-reverse',
      )}
    >
      <div className={cn(
        'flex shrink-0',
        isMobile ? 'w-8' : 'w-10',
        showInheritedChrome ? 'items-start' : isMobile ? 'items-end pb-4' : 'items-end pb-5',
        showMessageChrome && participant?.kind === 'agent' && 'chat-message-avatar',
        showMessageChrome && participant?.kind === 'agent' && participant.status === 'thinking' && 'bloub-activity-thinking',
        showMessageChrome && participant?.kind === 'agent' && participant.status === 'working' && 'bloub-activity-working',
      )}>
        {(showInheritedChrome || (showMessageChrome && custom.groupEnd)) && participant && (
          <Avatar p={participant} size={isMobile ? 32 : 38} ringColor="var(--background)" mode="chat" className="transition-[width,height] duration-200" />
        )}
      </div>
      <div className={cn('flex min-w-0 flex-1 flex-col', custom.isMine && 'items-end')}>
        {(showInheritedChrome || (showMessageChrome && custom.groupStart && !custom.isMine)) && (
          <div className={cn('mb-1 flex items-center gap-2 px-1 text-muted-foreground', isMobile ? 'text-xs' : 'text-[11px]')}>
            <span className="font-medium">{custom.senderName}</span>
            <time>{chromeAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>
          </div>
        )}
        <div className="grid w-full min-w-0 gap-0.5">
          {awaitingContent && <TypingIndicator variant="bare" className="min-h-5 items-center px-0.5" />}
          {attachments.length > 0 && <div data-slot="message-attachments" className="flex w-full max-w-full flex-row gap-2 overflow-x-auto">
            {attachments.map((attachment) => <ArtifactCard
              key={attachment.id}
              role="button"
              tabIndex={0}
              aria-label={`打开附件：${attachment.filename}`}
              title={attachment.filename}
              meta={attachment.mimeType.startsWith('image/') ? '图片附件' : '文件附件'}
              className={conversationCardSize.tile}
              onClick={() => window.open(attachment.data, '_blank', 'noopener,noreferrer')}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') window.open(attachment.data, '_blank', 'noopener,noreferrer')
              }}
            />)}
          </div>}
          <HostToolTimeline />
          <MessagePrimitive.Parts
            components={{
              Text: MessageTextPart,
              Reasoning: ReasoningPart,
              Image: () => null,
              File: () => null,
              Source: SourcePart,
              Quote: QuotePart,
              tools: CHAT_TOOL_RENDERERS,
            }}
          />
          <MessagePrimitive.Error>
            <div className="mt-2 text-xs text-destructive">消息生成失败</div>
          </MessagePrimitive.Error>
        </div>
        <Reactions metadata={custom} messageId={messageId} />
        {custom.isMine && (custom.delivery !== 'sent' || (showMessageChrome && custom.groupEnd)) && (
          <div className={cn('mt-0.5 flex items-center justify-end gap-2 px-1 text-muted-foreground', isMobile ? 'text-[11px]' : 'text-[10px]')}>
            {showMessageChrome && custom.groupEnd && <time>{createdAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>}
            {custom.delivery !== 'sent' && <span>{custom.delivery === 'sending' ? '发送中…' : '发送失败'}</span>}
          </div>
        )}
      </div>
    </MessagePrimitive.Root>
  )
}
