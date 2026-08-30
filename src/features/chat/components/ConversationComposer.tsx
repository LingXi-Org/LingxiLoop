import {
  AttachmentPrimitive,
  ComposerPrimitive,
  useAuiState,
} from '@assistant-ui/react'
import { ArrowUp02Icon, Cancel01Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PollComposer } from '@/components/PollComposer'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUiCommand } from '@/stores/uiCommands'
import { useTypingEmitter } from '../useTypingEmitter'
import { ComposerTriggers } from './ComposerTriggers'
import { ComposerLexicalInput } from './ComposerLexicalInput'

export function ConversationComposer({
  conversationId,
  compact = false,
  placeholder = 'Message LingXi…',
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
            className="chat-composer group/composer relative flex w-full flex-col rounded-[28px] border border-[#e5e5e5] bg-white px-2 py-2 dark:border-transparent dark:bg-[#212121]"
            onSubmit={finalizeTyping}
          >
        <ComposerPrimitive.Quote className="mx-1 mb-2 flex min-w-0 items-center gap-2 rounded-xl bg-black/[0.05] px-3 py-2 text-xs text-[#5d5d5d] dark:bg-white/10 dark:text-[#afafaf]">
          <div className="h-4 w-0.5 shrink-0 rounded-full bg-primary" />
          <ComposerPrimitive.QuoteText className="min-w-0 flex-1 truncate" />
          <ComposerPrimitive.QuoteDismiss asChild>
            <Button type="button" variant="ghost" size="icon-xs" aria-label="取消回复">
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
          </ComposerPrimitive.QuoteDismiss>
        </ComposerPrimitive.Quote>
        <div className="flex flex-row flex-wrap gap-2 px-1 pt-1 pb-2 empty:hidden">
          <ComposerPrimitive.Attachments>
            {() => (
              <AttachmentPrimitive.Root className="flex max-w-full items-center gap-2 rounded-2xl border border-[#e5e5e5] bg-white px-2 py-1.5 text-xs dark:border-white/15 dark:bg-[#2a2a2a]">
                <AttachmentPrimitive.unstable_Thumb className="size-14 shrink-0 rounded-xl bg-[#f3f3f3] dark:bg-[#303030]" />
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
        <div className="flex items-end gap-1">
          <div className="flex shrink-0 items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <ComposerPrimitive.AddAttachment asChild>
                  <button type="button" className="flex size-9 shrink-0 items-center justify-center rounded-full text-[#5d5d5d] transition-colors hover:bg-black/[0.07] dark:text-[#cdcdcd] dark:hover:bg-white/15" aria-label="添加附件">
                    <HugeiconsIcon icon={PlusSignIcon} size={20} strokeWidth={2} />
                  </button>
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
            className="relative max-h-52 min-h-9 flex-1 overflow-y-auto bg-transparent py-1.5 pr-2 pl-1 text-base text-[#0d0d0d] outline-none dark:text-[#ececec] [&_.aui-lexical-input]:min-h-6 [&_.aui-lexical-input]:outline-none [&_.aui-lexical-placeholder]:pointer-events-none [&_.aui-lexical-placeholder]:absolute [&_.aui-lexical-placeholder]:top-1.5 [&_.aui-lexical-placeholder]:text-[#8e8e8e]"
          />
          <div className="flex shrink-0 items-center gap-1">
            {isRunning && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <ComposerPrimitive.Cancel className="flex size-9 items-center justify-center rounded-full bg-[#0d0d0d] text-white dark:bg-white dark:text-black" aria-label="停止全部 Agent">
                    <span className="size-2.5 rounded-[2px] bg-current" />
                  </ComposerPrimitive.Cancel>
                </TooltipTrigger>
                <TooltipContent side="top">停止当前会话全部 Agent</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <ComposerPrimitive.Send asChild>
                  <button type="submit" className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-30" aria-label="发送">
                    <HugeiconsIcon icon={ArrowUp02Icon} size={24} strokeWidth={2} />
                  </button>
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
