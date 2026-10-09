import {
  AttachmentPrimitive,
  ComposerPrimitive,
  useAuiState,
} from '@assistant-ui/react'
import { Alert02Icon, ArrowUp02Icon, Cancel01Icon, Loading03Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AtSignIcon, BarChart3Icon, PaperclipIcon } from 'lucide-react'
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
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUiCommand } from '@/stores/uiCommands'
import { useTypingEmitter } from '../useTypingEmitter'
import { ComposerLexicalInput } from './ComposerLexicalInput'
import { ComposerTriggers } from './ComposerTriggers'
import { chatTransport } from '../runtime/transport'
import { useChatThreadStore } from '../runtime/store'
import { canCancelRun } from '../runtime/harness'
import { getLingxiMessageMetadata } from '../runtime/model'
import { userFacingError } from '@/lib/userFacingError'

const actionClassName = 'h-auto min-h-11 w-full justify-start gap-3 rounded-xl px-3 py-2.5 text-start whitespace-normal motion-reduce:transition-none'

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
  const addRef = useRef<HTMLButtonElement>(null)
  const insertMentionRef = useRef<(() => void) | null>(null)
  const afterMenuClose = useRef<(() => void) | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const text = useAuiState((state) => state.composer.text)
  const canCancel = useChatThreadStore((state) => state.conversations[conversationId]?.messages
    .some(message => canCancelRun(getLingxiMessageMetadata(message))) ?? false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const cancel = async () => {
    setCancelling(true)
    setCancelError(null)
    try { await chatTransport.cancel(conversationId) }
    catch (error) { setCancelError(userFacingError(error, '任务未能停止，请重试。')) }
    finally { setCancelling(false) }
  }
  const [pollOpen, setPollOpen] = useState(false)
  const uiCommand = useUiCommand()
  const finalizeTyping = useTypingEmitter(conversationId, text)
  const focusInput = useCallback(() => inputRef.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus(), [])
  const openPoll = useCallback(() => setPollOpen(true), [])
  const closePoll = useCallback(() => {
    setPollOpen(false)
    requestAnimationFrame(focusInput)
  }, [focusInput])
  const chooseAction = (action: () => void) => {
    afterMenuClose.current = action
    setActionsOpen(false)
  }

  useEffect(() => {
    if (uiCommand?.type === 'focus-composer') focusInput()
  }, [focusInput, uiCommand])

  return (
    <div data-composer-column className={compact ? 'mx-auto w-full min-w-0 max-w-[800px] px-3 pb-3' : 'mx-auto w-full min-w-0 max-w-[800px] px-2.5 pb-4 pt-2 sm:px-4'}>
      {cancelError && <p role="alert" className="mb-2 px-2 text-xs text-destructive">{cancelError}</p>}
      {pollOpen ? (
        <PollComposer conversationId={conversationId} onSubmitted={closePoll} onCancel={closePoll} />
      ) : (
        <ComposerTriggers conversationId={conversationId} onOpenPoll={openPoll}>
          <Popover open={actionsOpen} onOpenChange={setActionsOpen}>
          <PopoverAnchor asChild>
          <ComposerPrimitive.Root
            className="chat-composer group/composer relative flex w-full flex-col rounded-2xl border border-border bg-card px-2 py-2 text-card-foreground"
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
                <PopoverTrigger asChild>
                  <Button ref={addRef} type="button" variant="ghost" size="icon" className="size-11 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground md:size-9" aria-label="添加">
                    <HugeiconsIcon icon={PlusSignIcon} size={20} strokeWidth={2} />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="top">添加</TooltipContent>
            </Tooltip>
          </div>
          <ComposerLexicalInput
            conversationId={conversationId}
            ref={inputRef}
            insertMentionRef={insertMentionRef}
            autoFocus={!compact}
            submitMode="enter"
            placeholder={placeholder}
            className="relative max-h-52 min-h-11 flex-1 overflow-y-auto bg-transparent py-2.5 pr-2 pl-1 text-base text-foreground outline-none md:min-h-9 md:py-1.5 [&_.aui-lexical-input]:min-h-6 [&_.aui-lexical-input]:outline-none [&_.aui-lexical-placeholder]:pointer-events-none [&_.aui-lexical-placeholder]:absolute [&_.aui-lexical-placeholder]:top-2.5 [&_.aui-lexical-placeholder]:text-muted-foreground md:[&_.aui-lexical-placeholder]:top-1.5"
          />
          <div className="flex shrink-0 items-center gap-1">
            {canCancel && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" disabled={cancelling} onClick={() => void cancel()} className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground md:size-9" aria-label="停止全部智能助教" aria-busy={cancelling}>
                    <span className="size-2.5 rounded-[2px] bg-current" />
                  </Button>
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
          </PopoverAnchor>
          <PopoverContent
            side="top" align="start" sideOffset={8} collisionPadding={12} aria-label="添加"
            className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-24px)] max-h-[var(--radix-popover-content-available-height)] gap-0 overflow-y-auto rounded-2xl p-2 motion-reduce:animate-none"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              const action = afterMenuClose.current
              afterMenuClose.current = null
              if (action) action()
              else addRef.current?.focus({ preventScroll: true })
            }}
          >
            <p className="px-3 pb-1.5 pt-1 text-xs text-muted-foreground">添加</p>
            <ComposerPrimitive.AddAttachment asChild>
              <Button type="button" variant="ghost" className={actionClassName} onClick={() => chooseAction(focusInput)}>
                <PaperclipIcon className="size-5" aria-hidden />
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2"><span>上传文件</span><span className="text-xs font-normal text-muted-foreground">添加图片或文件</span></span>
              </Button>
            </ComposerPrimitive.AddAttachment>
            <Button type="button" variant="ghost" className={actionClassName} onClick={() => chooseAction(() => insertMentionRef.current?.())}>
              <AtSignIcon className="size-5" aria-hidden />
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2"><span>提及成员</span><span className="text-xs font-normal text-muted-foreground">选择要提醒的人</span></span>
            </Button>
            <Button type="button" variant="ghost" className={actionClassName} onClick={() => chooseAction(openPoll)}>
              <BarChart3Icon className="size-5" aria-hidden />
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2"><span>发起投票</span><span className="text-xs font-normal text-muted-foreground">邀请成员参与投票</span></span>
            </Button>
          </PopoverContent>
          </Popover>
        </ComposerTriggers>
      )}
    </div>
  )
}
