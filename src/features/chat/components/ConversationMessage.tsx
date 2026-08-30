import {
  ActionBarPrimitive,
  MessagePrimitive,
  useAui,
  useAuiState,
  type FileMessagePartProps,
  type ImageMessagePartProps,
  type ReasoningMessagePartProps,
  type SourceMessagePartProps,
} from '@assistant-ui/react'
import { Copy01Icon, Share08Icon, SmilePlusIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { MarkdownText } from '@/components/assistant-ui/markdown-text'
import { TwEmoji } from '@/components/TwEmoji'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useParticipants } from '@/features/agents/state'
import { useConversationUi } from '@/stores/conversationUi'
import { chatTransport, type LingxiMessageMetadata } from '../runtime'
import { CHAT_TOOL_RENDERERS } from './ToolRenderers'

function ReasoningPart({ text, status }: ReasoningMessagePartProps) {
  return (
    <details className="my-2 rounded-xl border border-border bg-muted/30 px-3 py-2" open={status.type === 'running'}>
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
        {status.type === 'running' ? '正在思考…' : '思考过程'}
      </summary>
      <div className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{text}</div>
    </details>
  )
}

function ImagePart({ image, filename }: ImageMessagePartProps) {
  return <img src={image} alt={filename ?? ''} className="my-2 max-h-[420px] max-w-full rounded-2xl object-contain" />
}

function FilePart({ data, filename, mimeType }: FileMessagePartProps) {
  if (mimeType.startsWith('audio/')) return <audio src={data} controls className="my-2 max-w-full" />
  if (mimeType.startsWith('video/')) return <video src={data} controls className="my-2 max-h-[420px] max-w-full rounded-2xl" />
  return (
    <a href={data} target="_blank" rel="noreferrer" className="my-2 flex max-w-md items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-primary">
      {filename ?? '下载附件'}
    </a>
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
      'absolute -top-3 end-0 z-30 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-0.5 text-popover-foreground opacity-0 invisible shadow-md transition-opacity group-hover/message:visible group-hover/message:opacity-100 focus-within:visible focus-within:opacity-100',
    )} role="toolbar" aria-label="消息操作">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="size-7 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        aria-label="回复"
        onClick={() => aui.composer.setQuote({ messageId, text })}
      >
        <HugeiconsIcon icon={Share08Icon} strokeWidth={2} />
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
                  void chatTransport.toggleReaction(metadata.conversationId, metadata.clientMessageId, emoji)
                }}
              >
                <TwEmoji emoji={emoji} size={18} />
              </Button>
            ))}
          </div>
        )}
      </div>
      <ActionBarPrimitive.Copy asChild>
        <Button type="button" variant="ghost" size="icon-xs" className="size-7 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground" aria-label="复制">
          <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
        </Button>
      </ActionBarPrimitive.Copy>
    </ActionBarPrimitive.Root>
  )
}

function Reactions({ metadata }: { metadata: LingxiMessageMetadata }) {
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
          onClick={() => void chatTransport.toggleReaction(metadata.conversationId, metadata.clientMessageId, reaction.emoji)}
        >
          <TwEmoji emoji={reaction.emoji} size={16} />
          <span className="text-xs font-medium">{reaction.count}</span>
        </Button>
      ))}
    </div>
  )
}

export function ConversationMessage() {
  const custom = useAuiState((state) => state.message.metadata.custom) as LingxiMessageMetadata
  const text = useAuiState((state) => state.message.content
    .filter((part): part is Extract<(typeof state.message.content)[number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n'))
  const createdAt = useAuiState((state) => state.message.createdAt)
  const participant = useParticipants((state) => state.byId[custom.senderId])
  const groupPosition = custom.groupStart
    ? custom.groupEnd ? 'single' : 'start'
    : custom.groupEnd ? 'end' : 'middle'
  const bubbleRadius = custom.isMine
    ? groupPosition === 'middle'
      ? 'rounded-[18px_4px_4px_18px]'
      : groupPosition === 'end'
        ? 'rounded-[18px_4px_18px_18px]'
        : 'rounded-[18px_18px_4px_18px]'
    : groupPosition === 'middle'
      ? 'rounded-[4px_18px_18px_4px]'
      : groupPosition === 'end'
        ? 'rounded-[4px_18px_18px_18px]'
        : 'rounded-[18px_18px_18px_4px]'
  return (
    <MessagePrimitive.Root
      id={`m-${custom.clientMessageId}`}
      data-msg-id={custom.clientMessageId}
      data-find-message-id={custom.clientMessageId}
      className={cn(
        'group/message flex w-full gap-2.5 px-3 sm:px-4',
        custom.continuedFromPrevious ? 'pt-0.5' : 'pt-2.5',
        custom.continuedToNext ? 'pb-0.5' : 'pb-2.5',
        custom.isMine && 'flex-row-reverse',
      )}
    >
      <div className="w-8 shrink-0 pt-0.5">
        {custom.groupStart && participant && <Avatar p={participant} size={30} ringColor="var(--background)" mode="chat" />}
      </div>
      <div className={cn('flex min-w-0 flex-1 flex-col', custom.isMine && 'items-end')}>
        {custom.groupStart && !custom.isMine && (
          <div className="mb-1 px-1 text-[11px] font-medium text-muted-foreground">{custom.senderName}</div>
        )}
        <div className={cn('relative w-fit max-w-[75%]', custom.messageKind !== 'text' && 'max-w-full')}>
          <MessageActions metadata={custom} text={text} />
          <div
            data-message-bubble={custom.isMine ? 'user' : 'assistant'}
            data-message-group-position={groupPosition}
            className={cn(
              'relative min-w-0 px-3.5 py-2 text-[15px] leading-[1.35] tracking-[-0.01em]',
              bubbleRadius,
              custom.isMine
                ? 'bg-primary text-white [&_.typeset]:!text-white [&_.typeset_*]:!text-white'
                : 'bg-muted text-foreground',
              custom.messageKind !== 'text' && [
                'w-full overflow-hidden p-0',
                '[&_[data-tool-ui-id]]:m-0 [&_[data-tool-ui-id]]:min-w-0 [&_[data-tool-ui-id]]:max-w-none',
                '[&_[data-tool-ui-id]]:rounded-none [&_[data-tool-ui-id]]:border-0 [&_[data-tool-ui-id]]:shadow-none',
                '[&_[data-tool-ui-id]>div]:rounded-none [&_[data-tool-ui-id]>div]:border-0 [&_[data-tool-ui-id]>div]:shadow-none',
              ],
              custom.delivery === 'failed' && 'ring-1 ring-destructive/50',
            )}
          >
            <MessagePrimitive.Parts
              components={{
                Text: MarkdownText,
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
        <Reactions metadata={custom} />
        <div className={cn('mt-0.5 flex items-center gap-2 px-1 text-[10px] text-muted-foreground', custom.isMine && 'justify-end')}>
          {custom.groupEnd && <time>{createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>}
          {custom.isMine && custom.delivery !== 'sent' && <span>{custom.delivery === 'sending' ? '发送中…' : '发送失败'}</span>}
          {custom.isMine && custom.receipts.length > 0 && <span>已读 {custom.receipts.length}</span>}
        </div>
      </div>
    </MessagePrimitive.Root>
  )
}
