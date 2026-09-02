import {
  AttachmentPrimitive,
  ComposerPrimitive,
  useAuiState,
} from '@assistant-ui/react'
import { Alert02Icon, ArrowUp02Icon, Cancel01Icon, Loading03Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PollComposer } from '@/components/PollComposer'
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUiCommand } from '@/stores/uiCommands'
import { useTypingEmitter } from '../useTypingEmitter'
import { ComposerLexicalInput } from './ComposerLexicalInput'
import { ComposerTriggers } from './ComposerTriggers'

export function ConversationComposer({
  conversationId,
  compact = false,
  placeholder = '发送消息…',
}: {
  conversationId: string
  compact?: boolean
  placeholder?: string
}) {
  const inputRef = useRef<HTMLDivElement>(null)
  const text = useAuiState((state) => state.composer.text)
  const isRunning = useAuiState((state) => state.thread.isRunning)
  const [pollOpen, setPollOpen] = useState(false)
  const uiCommand = useUiCommand()
  const finalizeTyping = useTypingEmitter(conversationId, text)
  const focusInput = useCallback(() => inputRef.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus(), [])
  const openPoll = useCallback(() => setPollOpen(true), [])
  const closePoll = useCallback(() => {
    setPollOpen(false)
    requestAnimationFrame(focusInput)
  }, [focusInput])

  useEffect(() => {
    if (uiCommand?.type === 'focus-composer') focusInput()
  }, [focusInput, uiCommand])

  return (
    <div className={compact ? 'px-3 pb-3' : 'w-full px-3 pb-4 pt-2 sm:px-4'}>
      {pollOpen ? (
        <PollComposer conversationId={conversationId} onSubmitted={closePoll} onCancel={closePoll} />
      ) : (
        <ComposerTriggers conversationId={conversationId} onOpenPoll={openPoll}>
          <ComposerPrimitive.Root
            className="chat-composer group/composer relative flex w-full flex-col rounded-3xl border border-border bg-card px-2 py-2 text-card-foreground"
            onSubmit={finalizeTyping}
          >
        <ComposerPrimitive.Quote className="mx-1 mb-2 flex min-w-0 items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          <div className="h-4 w-0.5 shrink-0 rounded-full bg-primary" />
          <ComposerPrimitive.QuoteText className="min-w-0 flex-1 truncate" />
          <ComposerPrimitive.QuoteDismiss asChild>
            <Button type="button" variant="ghost" size="icon-xs" aria-label="取消回复">
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
          </ComposerPrimitive.QuoteDismiss>
        </ComposerPrimitive.Quote>
        <AttachmentGroup className="px-1 pb-2 pt-1 empty:hidden" role="group" aria-label="待发送附件" tabIndex={0}>
          <ComposerPrimitive.Attachments>
            {({ attachment }) => {
              const state = attachment.status.type === 'running'
                ? 'uploading'
                : attachment.status.type === 'incomplete' ? 'error' : 'done'
              return <AttachmentPrimitive.Root asChild>
                <Attachment size="sm" state={state} aria-busy={state === 'uploading'}>
                  <AttachmentMedia>
                    {state === 'uploading'
                      ? <HugeiconsIcon icon={Loading03Icon} className="animate-spin" strokeWidth={2} />
                      : state === 'error'
                        ? <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
                        : <AttachmentPrimitive.unstable_Thumb className="font-medium uppercase" />}
                  </AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle><AttachmentPrimitive.Name /></AttachmentTitle>
                    <AttachmentDescription>
                      {state === 'uploading'
                        ? `正在上传 ${attachment.status.type === 'running' ? attachment.status.progress : 0}%`
                        : state === 'error'
                          ? ('message' in attachment.status && attachment.status.message) || '上传失败'
                          : attachment.contentType || '附件已就绪'}
                    </AttachmentDescription>
                  </AttachmentContent>
                  <AttachmentActions>
                <AttachmentPrimitive.Remove asChild>
                      <AttachmentAction type="button" aria-label={`移除 ${attachment.name}`}>
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                      </AttachmentAction>
                </AttachmentPrimitive.Remove>
                  </AttachmentActions>
                </Attachment>
              </AttachmentPrimitive.Root>
            }}
          </ComposerPrimitive.Attachments>
        </AttachmentGroup>
        <div className="flex items-end gap-1">
          <div className="flex shrink-0 items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <ComposerPrimitive.AddAttachment asChild>
                  <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground md:size-9" aria-label="添加附件">
                    <HugeiconsIcon icon={PlusSignIcon} size={20} strokeWidth={2} />
                  </Button>
                </ComposerPrimitive.AddAttachment>
              </TooltipTrigger>
              <TooltipContent side="top">添加附件</TooltipContent>
            </Tooltip>
          </div>
          <ComposerLexicalInput
            ref={inputRef}
            autoFocus={!compact}
            submitMode="enter"
            placeholder={placeholder}
            className="relative max-h-52 min-h-11 flex-1 overflow-y-auto bg-transparent py-2.5 pr-2 pl-1 text-base text-foreground outline-none md:min-h-9 md:py-1.5 [&_.aui-lexical-input]:min-h-6 [&_.aui-lexical-input]:outline-none [&_.aui-lexical-placeholder]:pointer-events-none [&_.aui-lexical-placeholder]:absolute [&_.aui-lexical-placeholder]:top-2.5 [&_.aui-lexical-placeholder]:text-muted-foreground md:[&_.aui-lexical-placeholder]:top-1.5"
          />
          <div className="flex shrink-0 items-center gap-1">
            {isRunning && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <ComposerPrimitive.Cancel className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground md:size-9" aria-label="停止全部智能助教">
                    <span className="size-2.5 rounded-[2px] bg-current" />
                  </ComposerPrimitive.Cancel>
                </TooltipTrigger>
                <TooltipContent side="top">停止当前会话中的全部智能助教</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <ComposerPrimitive.Send asChild>
                  <Button type="submit" size="icon" className="size-11 rounded-full transition-opacity disabled:opacity-30 md:size-9" aria-label="发送">
                    <HugeiconsIcon icon={ArrowUp02Icon} size={24} strokeWidth={2} />
                  </Button>
                </ComposerPrimitive.Send>
              </TooltipTrigger>
              <TooltipContent side="top">发送</TooltipContent>
            </Tooltip>
          </div>
        </div>
          </ComposerPrimitive.Root>
        </ComposerTriggers>
      )}
    </div>
  )
}
