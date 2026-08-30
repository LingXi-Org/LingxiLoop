import {
  AttachmentPrimitive,
  ComposerPrimitive,
  useAuiState,
} from '@assistant-ui/react'
import { useEffect, useRef } from 'react'
import { ArrowUp02Icon, Attachment01Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { PreviewText } from '@/components/PreviewText'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ComposerSurface } from '@/im/Composer'
import { cn } from '@/lib/utils'
import { useConversationUi } from '@/stores/conversationUi'
import { useUiCommand } from '@/stores/uiCommands'
import { useMessages } from '../state/messages'
import { useParticipants } from '@/features/agents/state'
import { useTypingEmitter } from '../useTypingEmitter'

function NativeComposer({
  convoId,
  isThread,
  placeholder,
}: {
  convoId: string
  isThread: boolean
  placeholder?: string
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const text = useAuiState((state) => state.composer.text)
  const attachmentCount = useAuiState((state) => state.composer.attachments.length)
  const uiCommand = useUiCommand()
  const finalizeTyping = useTypingEmitter(convoId, isThread ? '' : text)

  useEffect(() => {
    if (uiCommand?.type !== 'focus-composer') return
    inputRef.current?.focus()
  }, [uiCommand])

  return (
    <ComposerPrimitive.Root
      className="chat-composer flex min-h-12 w-full flex-col rounded-2xl border border-border bg-input/50"
      onSubmit={finalizeTyping}
    >
      <div className="flex flex-wrap gap-2 px-3 pt-3 empty:hidden">
        <ComposerPrimitive.Attachments>
          {() => (
          <AttachmentPrimitive.Root className="flex max-w-full items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs">
            <AttachmentPrimitive.unstable_Thumb className="size-8 shrink-0 rounded-lg bg-muted" />
            <span className="min-w-0 flex-1 truncate"><AttachmentPrimitive.Name /></span>
            <AttachmentPrimitive.Remove asChild>
              <Button type="button" variant="ghost" size="icon-xs" aria-label="移除附件">
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
            </AttachmentPrimitive.Remove>
          </AttachmentPrimitive.Root>
          )}
        </ComposerPrimitive.Attachments>
      </div>
      <div className="flex items-end gap-1 p-1.5">
        {attachmentCount === 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <ComposerPrimitive.AddAttachment asChild>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="添加附件">
                  <HugeiconsIcon icon={Attachment01Icon} strokeWidth={2} />
                </Button>
              </ComposerPrimitive.AddAttachment>
            </TooltipTrigger>
            <TooltipContent side="top">添加附件</TooltipContent>
          </Tooltip>
        )}
        <ComposerPrimitive.Input
          ref={inputRef}
          autoFocus
          rows={1}
          submitMode="enter"
          unstable_insertNewlineOnTouchEnter
          placeholder={placeholder ?? 'Message LingXi…'}
          className="max-h-40 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <ComposerPrimitive.Send asChild>
              <Button type="submit" size="icon-sm" aria-label="发送">
                <HugeiconsIcon icon={ArrowUp02Icon} strokeWidth={2} />
              </Button>
            </ComposerPrimitive.Send>
          </TooltipTrigger>
          <TooltipContent side="top">发送</TooltipContent>
        </Tooltip>
      </div>
    </ComposerPrimitive.Root>
  )
}

export function Composer({
  convoId,
  threadRootId = null,
  placeholder,
}: {
  convoId: string
  threadRootId?: string | null
  placeholder?: string
}) {
  const isThread = threadRootId !== null
  const replyingToId = useConversationUi((state) => state.replyingTo[convoId])
  const setReplyingTo = useConversationUi((state) => state.setReplyingTo)
  const replyingToMessage = useMessages((state) =>
    replyingToId ? (state.byConvo[convoId] ?? []).find((message) => message.id === replyingToId) : undefined,
  )
  const author = useParticipants((state) =>
    replyingToMessage ? state.byId[replyingToMessage.authorId] : undefined,
  )

  return (
    <ComposerSurface className={isThread ? 'border-0 bg-transparent !p-0' : undefined}>
      <div className={cn('mx-auto w-full max-w-[900px] px-1 pb-1 pt-2', isThread && 'px-0')}>
        {!isThread && replyingToId && (
          <div className="mb-2 flex min-w-0 items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs">
            <div className="h-4 w-0.5 shrink-0 rounded-full bg-primary" />
            <div className="min-w-0 flex-1 truncate text-muted-foreground">
              <span className="me-2 font-medium text-foreground">回复 {author?.name ?? replyingToMessage?.authorId ?? '…'}</span>
              {replyingToMessage ? <PreviewText body={replyingToMessage.body.slice(0, 140).replace(/\n/g, ' ')} /> : '正在加载…'}
            </div>
            <Button type="button" variant="ghost" size="icon-xs" onClick={() => setReplyingTo(convoId, null)} aria-label="取消回复">
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
          </div>
        )}
        <NativeComposer convoId={convoId} isThread={isThread} placeholder={placeholder} />
      </div>
    </ComposerSurface>
  )
}
