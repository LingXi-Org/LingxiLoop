import {
  AttachmentPrimitive,
  ComposerPrimitive,
  useAui,
  useAuiState,
} from '@assistant-ui/react'
import { Alert02Icon, Cancel01Icon, Loading03Icon } from '@hugeicons/core-free-icons'
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
import { ComposerQuotePreview } from './QuotePreview'
import { chatTransport } from '../runtime/transport'
import { useChatThreadStore } from '../runtime/store'
import { canCancelRun } from '../runtime/harness'
import { getLingxiMessageMetadata } from '../runtime/model'
import { userFacingError } from '@/lib/userFacingError'

const actionClassName = 'h-auto min-h-11 w-full justify-start gap-3 rounded-xl px-3 py-2.5 text-start whitespace-normal motion-reduce:transition-none'

export function ConversationComposer({
  conversationId,
  compact = false,
  placeholder = '发消息，输入 @ 提及 agent',
}: {
  conversationId: string
  compact?: boolean
  placeholder?: string
}) {
  const inputRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const insertMentionRef = useRef<(() => void) | null>(null)
  const afterMenuClose = useRef<(() => void) | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const aui = useAui()
  const text = useAuiState((state) => state.composer.text)
  const attachmentAccept = useAuiState((state) => state.composer.attachmentAccept)
  const attachmentDisabled = useAuiState((state) => !state.composer.isEditing)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
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
    <div data-composer-column className="chat-composer-column min-w-0">
      {cancelError && <p role="alert" className="mb-2 px-2 text-xs text-destructive">{cancelError}</p>}
      {attachmentError && <p role="alert" className="mb-2 px-2 text-xs text-destructive">{attachmentError}</p>}
      {pollOpen ? (
        <PollComposer conversationId={conversationId} onSubmitted={closePoll} onCancel={closePoll} />
      ) : (
        <ComposerTriggers conversationId={conversationId} onOpenPoll={openPoll}>
          <Popover open={actionsOpen} onOpenChange={setActionsOpen}>
          <PopoverAnchor asChild>
          <ComposerPrimitive.Root
            className="chat-composer group/composer relative w-full"
            onSubmit={finalizeTyping}
          >
        <input ref={fileInputRef} type="file" hidden multiple aria-label="上传文件" disabled={attachmentDisabled}
          accept={attachmentAccept === '*' ? undefined : attachmentAccept} onChange={event => {
            const files = Array.from(event.currentTarget.files ?? [])
            event.currentTarget.value = ''
            setAttachmentError(null)
            void Promise.all(files.map(file => aui.composer.addAttachment(file).catch(() => setAttachmentError('附件未能添加，请重新选择文件。'))))
          }} />
        <ComposerQuotePreview onDismiss={() => requestAnimationFrame(focusInput)} />
        <AttachmentGroup className="chat-composer-attachments flex flex-wrap gap-1.5 px-0.5 empty:hidden" role="group" aria-label="待发送附件" tabIndex={0}>
          <ComposerPrimitive.Attachments>
            {({ attachment }) => {
              const state = attachment.status.type === 'running'
                ? 'uploading'
                : attachment.status.type === 'incomplete' ? 'error' : 'done'
              return <AttachmentPrimitive.Root asChild>
                <Attachment size="sm" state={state} aria-busy={state === 'uploading'} className="w-[190px] rounded-[10px] border-0 py-1.5 ps-2 pe-2 shadow-[0_0_0_1px_var(--border)]">
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
        <div className="chat-composer-row">
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button ref={addRef} type="button" variant="ghost" size="icon" className="chat-composer-control chat-composer-add shrink-0" aria-label="添加附件">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]"><path d="M12 5v14M5 12h14" /></svg>
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">添加</TooltipContent>
          </Tooltip>
          <ComposerLexicalInput
            conversationId={conversationId}
            ref={inputRef}
            insertMentionRef={insertMentionRef}
            autoFocus={!compact}
            submitMode="enter"
            placeholder={placeholder}
            className="chat-composer-input"
          />
          {canCancel || cancelling ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" disabled={cancelling} onClick={() => void cancel()} className="chat-composer-control chat-composer-send flex items-center justify-center" aria-label="停止全部智能助教" aria-busy={cancelling}>
                  <span className="size-2.5 rounded-[2px] bg-current" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">停止当前会话中的全部智能助教</TooltipContent>
            </Tooltip>
          ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <ComposerPrimitive.Send asChild>
                <Button type="submit" size="icon" className="chat-composer-control chat-composer-send transition-colors" aria-label="发送">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                </Button>
              </ComposerPrimitive.Send>
            </TooltipTrigger>
            <TooltipContent side="top">发送</TooltipContent>
          </Tooltip>
          )}
        </div>
          </ComposerPrimitive.Root>
          </PopoverAnchor>
          <PopoverContent
            side="top" align="start" sideOffset={8} collisionPadding={12} aria-label="添加"
            className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-24px)] max-h-[var(--radix-popover-content-available-height)] gap-0 overflow-y-auto rounded-xl p-1.5 motion-reduce:animate-none"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              const action = afterMenuClose.current
              afterMenuClose.current = null
              if (action) action()
              else addRef.current?.focus({ preventScroll: true })
            }}
          >
            <p className="px-3 pb-1.5 pt-1 text-xs text-muted-foreground">添加</p>
              <Button type="button" variant="ghost" className={actionClassName} disabled={attachmentDisabled} onClick={() => { fileInputRef.current?.click(); chooseAction(focusInput) }}>
                <PaperclipIcon className="size-5" aria-hidden />
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2"><span>上传文件</span><span className="text-xs font-normal text-muted-foreground">添加图片或文件</span></span>
              </Button>
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
