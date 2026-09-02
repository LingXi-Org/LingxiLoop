import {
  ActionBarPrimitive,
  type FileMessagePartProps,
  type ImageMessagePartProps,
  MessagePrimitive,
  type ReasoningMessagePartProps,
  type SourceMessagePartProps,
  useAui,
  useAuiState,
} from '@assistant-ui/react'
import { Alert02Icon, Copy01Icon, File01Icon, Loading03Icon, ReplyIcon, SmilePlusIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { MarkdownText } from '@/components/assistant-ui/markdown-text'
import { TwEmoji } from '@/components/TwEmoji'
import { TypingIndicator } from '@/components/typing-indicator'
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from '@/components/ui/attachment'
import { Button } from '@/components/ui/button'
import { useParticipants } from '@/features/agents/state'
import { cn } from '@/lib/utils'
import { useConversationUi } from '@/stores/conversationUi'
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

function AgentMarkdownText() { return <MarkdownText segmented /> }

function ImagePart({ image, filename }: ImageMessagePartProps) {
  const [state, setState] = useState<'processing' | 'error' | 'done'>('processing')
  return <Attachment
    state={state}
    orientation="vertical"
    className="my-2 w-56 max-w-full overflow-hidden has-data-[slot=attachment-content]:w-56"
    aria-busy={state === 'processing'}
  >
    <AttachmentMedia variant="image" className="aspect-auto w-full rounded-b-none p-0">
      {state === 'processing' && <HugeiconsIcon icon={Loading03Icon} className="absolute animate-spin" strokeWidth={2} />}
      <img
        src={image}
        alt={filename ?? ''}
        className="max-h-[420px] min-h-24 w-full object-contain"
        onLoad={() => setState('done')}
        onError={() => setState('error')}
      />
    </AttachmentMedia>
    <AttachmentContent>
      <AttachmentTitle>{filename ?? '图片附件'}</AttachmentTitle>
      <AttachmentDescription>{state === 'error' ? '图片加载失败' : state === 'processing' ? '正在加载图片…' : '图片'}</AttachmentDescription>
    </AttachmentContent>
    <AttachmentTrigger asChild>
      <a href={image} target="_blank" rel="noreferrer" aria-label={`打开 ${filename ?? '图片附件'}`} />
    </AttachmentTrigger>
  </Attachment>
}

function FilePart({ data, filename, mimeType }: FileMessagePartProps) {
  const media = mimeType.startsWith('audio/') || mimeType.startsWith('video/')
  const [state, setState] = useState<'processing' | 'error' | 'done'>(media ? 'processing' : 'done')
  if (mimeType.startsWith('video/')) return <Attachment
    state={state}
    orientation="vertical"
    className="my-2 w-72 max-w-full overflow-hidden has-data-[slot=attachment-content]:w-72"
    aria-busy={state === 'processing'}
  >
    <AttachmentMedia variant="image" className="aspect-video w-full rounded-b-none p-0">
      {state === 'processing' && <HugeiconsIcon icon={Loading03Icon} className="absolute animate-spin" strokeWidth={2} />}
      <video src={data} controls preload="metadata" className="size-full object-contain" onLoadedMetadata={() => setState('done')} onError={() => setState('error')} />
    </AttachmentMedia>
    <AttachmentContent>
      <AttachmentTitle>{filename ?? '视频附件'}</AttachmentTitle>
      <AttachmentDescription>{state === 'error' ? '视频加载失败' : state === 'processing' ? '正在加载视频…' : mimeType}</AttachmentDescription>
    </AttachmentContent>
  </Attachment>
  return <Attachment state={state} className="my-2 w-full max-w-md" aria-busy={state === 'processing'}>
    <AttachmentMedia>
      {state === 'processing'
        ? <HugeiconsIcon icon={Loading03Icon} className="animate-spin" strokeWidth={2} />
        : state === 'error'
          ? <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
          : <HugeiconsIcon icon={File01Icon} strokeWidth={2} />}
    </AttachmentMedia>
    <AttachmentContent>
      <AttachmentTitle>{filename ?? '附件'}</AttachmentTitle>
      <AttachmentDescription>{state === 'error' ? '附件加载失败' : state === 'processing' ? '正在加载附件…' : mimeType}</AttachmentDescription>
    </AttachmentContent>
    {mimeType.startsWith('audio/')
      ? <audio src={data} controls preload="metadata" className="w-full basis-full px-2 pb-2" onLoadedMetadata={() => setState('done')} onError={() => setState('error')} />
      : <AttachmentTrigger asChild><a href={data} target="_blank" rel="noreferrer" aria-label={`打开 ${filename ?? '附件'}`} /></AttachmentTrigger>}
  </Attachment>
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
      'absolute -top-3 end-0 z-30 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-0.5 text-popover-foreground opacity-0 invisible shadow-md transition-opacity group-hover/message:visible group-hover/message:opacity-100',
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
  const disableHoverActions = document.documentElement.dataset.disableChatHoverActions === 'true'
  const custom = useAuiState((state) => state.message.metadata.custom) as LingxiMessageMetadata
  const text = useAuiState((state) => state.message.content
    .filter((part): part is Extract<(typeof state.message.content)[number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n'))
  const createdAt = useAuiState((state) => state.message.createdAt)
  const messageId = useAuiState((state) => state.message.id)
  const awaitingContent = useAuiState((state) => (
    state.message.status?.type === 'running' && state.message.content.every((part) => (
      part.type === 'tool-call' && part.toolName === 'cite_claims'
    ))
  ))
  const participant = useParticipants((state) => state.byId[custom.senderId])
  const groupPosition = custom.groupStart
    ? custom.groupEnd ? 'single' : 'start'
    : custom.groupEnd ? 'end' : 'middle'
  const bubbleRadius = groupPosition === 'single'
    ? 'rounded-[18px]'
    : custom.isMine
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
  return (
    <MessagePrimitive.Root
      id={`m-${custom.clientMessageId}`}
      data-msg-id={custom.clientMessageId}
      data-find-message-id={custom.clientMessageId}
      className={cn(
        'group/message flex w-full shrink-0 gap-2.5 px-3 sm:px-4',
        custom.continuedFromPrevious ? 'pt-px' : 'pt-1.5',
        custom.continuedToNext ? 'pb-px' : 'pb-1.5',
        custom.isMine && 'flex-row-reverse',
      )}
    >
      <div className={cn(
        'flex w-10 shrink-0 items-end pb-5',
        participant?.kind === 'agent' && 'chat-message-avatar',
        participant?.kind === 'agent' && participant.status === 'thinking' && 'bloub-activity-thinking',
        participant?.kind === 'agent' && participant.status === 'working' && 'bloub-activity-working',
      )}>
        {custom.groupEnd && participant && <Avatar p={participant} size={38} ringColor="var(--background)" mode="chat" />}
      </div>
      <div className={cn('flex min-w-0 flex-1 flex-col', custom.isMine && 'items-end')}>
        {custom.groupStart && !custom.isMine && (
          <div className="mb-1 flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
            <span className="font-medium">{custom.senderName}</span>
            <time>{createdAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>
          </div>
        )}
        <div className={cn('relative w-fit max-w-[75%]', custom.messageKind !== 'text' && 'max-w-full')}>
          {!disableHoverActions && <MessageActions metadata={custom} text={text} />}
          <div
            data-message-bubble={custom.isMine ? 'user' : 'assistant'}
            data-message-group-position={groupPosition}
            className={cn(
              'relative min-w-0 text-[15px] leading-[1.35] tracking-[-0.01em]',
              custom.isMine && ['px-3.5 py-2', bubbleRadius, 'bg-primary text-white [&_.typeset]:!text-white [&_.typeset_*]:!text-white'],
              !custom.isMine && custom.messageKind === 'text' && 'text-foreground',
              !custom.isMine && custom.messageKind !== 'text' && ['px-3.5 py-2', bubbleRadius, 'bg-[var(--bubble-agent)] text-foreground'],
              custom.messageKind !== 'text' && [
                'w-full overflow-hidden p-0',
                '[&_[data-tool-ui-id]]:m-0 [&_[data-tool-ui-id]]:min-w-0 [&_[data-tool-ui-id]]:max-w-none',
                '[&_[data-tool-ui-id]]:rounded-none [&_[data-tool-ui-id]]:border-0 [&_[data-tool-ui-id]]:shadow-none',
                '[&_[data-tool-ui-id]>div]:rounded-none [&_[data-tool-ui-id]>div]:border-0 [&_[data-tool-ui-id]>div]:shadow-none',
              ],
              custom.delivery === 'failed' && 'ring-1 ring-destructive/50',
            )}
          >
            {awaitingContent && <TypingIndicator variant="bare" className="min-h-5 items-center px-0.5" />}
            <HostToolTimeline />
            <MessagePrimitive.Parts
              components={{
                Text: custom.isMine ? MarkdownText : AgentMarkdownText,
                Reasoning: ReasoningPart,
                Image: ImagePart,
                File: FilePart,
                Source: SourcePart,
                Quote: QuotePart,
                tools: CHAT_TOOL_RENDERERS,
              }}
            />
            <MessagePrimitive.Error>
              <div className="mt-2 text-xs text-destructive">消息生成失败</div>
            </MessagePrimitive.Error>
          </div>
        </div>
        <Reactions metadata={custom} messageId={messageId} />
        <div className={cn('mt-0.5 flex items-center gap-2 px-1 text-[10px] text-muted-foreground', custom.isMine && 'justify-end')}>
          {custom.isMine && custom.groupEnd && <time>{createdAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>}
          {custom.isMine && custom.delivery !== 'sent' && <span>{custom.delivery === 'sending' ? '发送中…' : '发送失败'}</span>}
        </div>
      </div>
    </MessagePrimitive.Root>
  )
}
