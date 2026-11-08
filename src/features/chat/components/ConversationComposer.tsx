import {
  AttachmentPrimitive,
  ComposerPrimitive,
  useAui,
  useAuiState,
} from '@assistant-ui/react'
import { Alert02Icon, Cancel01Icon, Loading03Icon } from '@hugeicons/core-free-icons'
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

const actionClassName = 'flex w-full items-center gap-2.5 rounded-lg px-2 py-[7px] text-start hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-40 max-md:min-h-11'

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
            className="flex w-[300px] max-w-[calc(100vw-24px)] max-h-[var(--radix-popover-content-available-height)] flex-col gap-px overflow-y-auto rounded-xl border-0 p-1.5 shadow-[var(--popover-shadow)] motion-reduce:animate-none"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              const action = afterMenuClose.current
              afterMenuClose.current = null
              if (action) action()
              else addRef.current?.focus({ preventScroll: true })
            }}
          >
            <button type="button" disabled={attachmentDisabled} onClick={() => { fileInputRef.current?.click(); chooseAction(focusInput) }} className={actionClassName}>
              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-lg" style={{ background: 'color-mix(in srgb, #3B6FD8 12%, transparent)', color: '#3B6FD8' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" /></svg></span>
              <span className="flex min-w-0 flex-1 flex-col"><span className="text-[13.5px] text-foreground">上传文件</span><span className="text-xs text-muted-foreground">PDF、文档、图片、音视频</span></span>
            </button>
            <button type="button" onClick={() => chooseAction(() => insertMentionRef.current?.())} className={actionClassName}>
              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-lg" style={{ background: 'color-mix(in srgb, #1F8A5B 12%, transparent)', color: '#1F8A5B' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4"><circle cx="12" cy="12" r="4" /><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1" /></svg></span>
              <span className="flex min-w-0 flex-1 flex-col"><span className="text-[13.5px] text-foreground">提及成员</span><span className="text-xs text-muted-foreground">老师、同学或 agent</span></span>
            </button>
            <button type="button" onClick={() => chooseAction(openPoll)} className={actionClassName}>
              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-lg" style={{ background: 'color-mix(in srgb, #7B5CC9 12%, transparent)', color: '#7B5CC9' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M4 20h16M6 16V8M12 16V4M18 16v-6" /></svg></span>
              <span className="flex min-w-0 flex-1 flex-col"><span className="text-[13.5px] text-foreground">发起投票</span><span className="text-xs text-muted-foreground">单选或多选，可设截止时间</span></span>
            </button>
          </PopoverContent>
          </Popover>
        </ComposerTriggers>
      )}
    </div>
  )
}
