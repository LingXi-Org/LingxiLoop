import { ActionBarMorePrimitive, ActionBarPrimitive, MessagePrimitive, useAui, useAuiState } from '@assistant-ui/react'
import { CheckIcon, CopyIcon, DownloadIcon, EllipsisIcon, RefreshCwIcon, ReplyIcon, ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ghostButton, iconSwap, iconSwapIn, iconSwapOut } from '@/components/assistant-ui/elements/surfaces'
import { ErrorState } from '@/components/assistant-ui/elements/error-state'
import { MessageBranches } from '@/components/assistant-ui/elements/message-branches'
import { useConversationUi } from '@/stores/conversationUi'
import { useConversations } from '@/features/conversations/store'
import { createNativeMessage } from '@/lib/nativeMessage'
import { userFacingError } from '@/lib/userFacingError'
import { cn } from '@/lib/utils'
import type { LingxiMessageMetadata } from '../runtime/model'
import { harnessFailure } from '../runtime/harness'
import { chatTransport } from '../runtime/transport'
import { copyMessageText, useMessageCopyText } from './MessageActions'

// assistant-ui Elements' complete action row, connected to durable IM operations.
export function AssistantMessageActions() {
  const aui = useAui()
  const root = useRef<HTMLDivElement>(null)
  const { rawText, getText } = useMessageCopyText(root)
  const message = useAuiState(state => state.message)
  const metadata = message.metadata.custom as LingxiMessageMetadata
  const selectBranch = useConversationUi(state => state.selectReplyBranch)
  const threadRunning = useAuiState(state => state.thread.isRunning)
  const readOnly = useConversations(state => {
    const room = state.list.find(room => room.id === metadata.conversationId)
    return !room || Boolean(room.readOnly)
  })
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<number | null>(null)
  const [pending, setPending] = useState<'rating' | 'regenerate' | null>(null)
  const inFlight = useRef(false)
  useEffect(() => () => { if (copyTimer.current !== null) window.clearTimeout(copyTimer.current) }, [])
  async function copy() {
    const success = await copyMessageText(getText())
    setCopied(success)
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
    if (success) copyTimer.current = window.setTimeout(() => setCopied(false), 3_000)
  }
  const disabled = readOnly || metadata.sequence === null || pending !== null
  const regenerateOf = metadata.sequence !== null ? metadata.clientMessageId : metadata.replyBranches?.rootId
  const replyTo = regenerateOf ?? (typeof metadata.sourceRef === 'string' ? metadata.sourceRef : null)
  const retryDisabled = readOnly || !replyTo || pending !== null || threadRunning
  const regenerating = pending === 'regenerate' || message.status?.type === 'running'
  const view = metadata.harness
  const outcome = view?.goalOutcome
  const incompleteOutcome = message.status?.type === 'incomplete' && message.status.reason === 'other'
    && view?.runId === metadata.runId && outcome?.requestVersion === view?.requestVersion
    && (outcome?.status === 'partial' || outcome?.status === 'blocked')
    && (view?.lifecycle === outcome.status || view?.lifecycle === 'succeeded') ? outcome.status : null
  const buttonClassName = cn(ghostButton, 'size-7 disabled:pointer-events-none disabled:opacity-40 max-md:size-11')
  const ratingClassName = (emoji: string) => cn(buttonClassName,
    metadata.reactions.some(reaction => reaction.emoji === emoji && reaction.mine)
      && 'bg-foreground/[0.06] text-foreground/90 dark:bg-foreground/[0.09]')
  async function rate(emoji: '👍' | '👎') {
    if (disabled || inFlight.current) return
    inFlight.current = true
    setPending('rating')
    try {
      const current = aui.message.getState().metadata.custom as LingxiMessageMetadata
      const opposite = emoji === '👍' ? '👎' : '👍'
      if (current.reactions.some(reaction => reaction.emoji === opposite && reaction.mine)) {
        await chatTransport.toggleReaction(metadata.conversationId, message.id, opposite)
      }
      await chatTransport.toggleReaction(metadata.conversationId, message.id, emoji)
    } catch (error) { toast.error(userFacingError(error, '评价提交失败，请重试。')) }
    finally { inFlight.current = false; setPending(null) }
  }
  async function regenerate() {
    if (retryDisabled || inFlight.current) return
    inFlight.current = true
    setPending('regenerate')
    try {
      const id = `temp-${crypto.randomUUID()}`, text = `@${metadata.senderId} ${regenerateOf ? '请重新生成这条回复。' : '请重试这条消息。'}`
      const payload = createNativeMessage({ id, role: 'user', content: [{ type: 'text', text }],
        custom: { replyToClientMsgNo: replyTo, mentionedIds: [metadata.senderId],
          ...(regenerateOf ? { regenerateOfClientMsgNo: regenerateOf } : {}) } })
      if (!await chatTransport.send(metadata.conversationId, text, null, replyTo, id, payload)) {
        throw new Error('regenerate send failed')
      }
    } catch (error) { toast.error(userFacingError(error, '重新生成请求发送失败，请重试。')) }
    finally { inFlight.current = false; setPending(null) }
  }
  return <>
    <MessagePrimitive.Error>
      <ErrorState title="回复生成失败" detail={metadata.terminalNotice?.text ?? (metadata.harnessError ? harnessFailure(metadata.harnessError) : '消息生成失败，请重试。')}
        retrying={pending === 'regenerate'} onRetry={() => void regenerate()} disabled={retryDisabled} className="mt-2" />
    </MessagePrimitive.Error>
    {incompleteOutcome && <div data-run-outcome={incompleteOutcome} role="status" className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
      <span>{pending === 'regenerate' ? '正在重试' : '答复尚未完成'}</span>
      <button type="button" disabled={retryDisabled} onClick={() => void regenerate()}
        className={cn(ghostButton, 'rounded-md px-2 py-1 text-xs disabled:opacity-40 max-md:min-h-11')}>重试</button>
    </div>}
    {(message.content.length > 0 || metadata.replyBranches) && <ActionBarPrimitive.Root ref={root} data-slot="message-actions" role="toolbar" aria-label="智能助教回复操作" className="mt-1 flex flex-wrap items-center gap-1">
    {metadata.replyBranches && <MessageBranches variants={metadata.replyBranches.ids} index={metadata.replyBranches.index}
      onIndexChange={index => {
        const branch = metadata.replyBranches!
        selectBranch(branch.key, branch.ids[index], branch.ids.at(-1)!)
      }} className="[&>p]:hidden" />}
    <button type="button" aria-label={copied ? '已复制回复' : '复制回复'} disabled={!rawText} onClick={() => void copy()}
      className={cn(buttonClassName, 'grid place-items-center', copied && 'text-emerald-500')}>
      <CopyIcon aria-hidden="true" className={cn(iconSwap, 'size-3.5', copied ? iconSwapOut : iconSwapIn)} />
      <CheckIcon aria-hidden="true" className={cn(iconSwap, 'size-3.5', copied ? iconSwapIn : iconSwapOut)} />
    </button>
    <button type="button" aria-label="评价为有帮助" aria-pressed={metadata.reactions.some(reaction => reaction.emoji === '👍' && reaction.mine)}
      disabled={disabled} onClick={() => void rate('👍')} className={ratingClassName('👍')}><ThumbsUpIcon aria-hidden="true" className="size-3.5" /></button>
    <button type="button" aria-label="评价为无帮助" aria-pressed={metadata.reactions.some(reaction => reaction.emoji === '👎' && reaction.mine)}
      disabled={disabled} onClick={() => void rate('👎')} className={ratingClassName('👎')}><ThumbsDownIcon aria-hidden="true" className="size-3.5" /></button>
    <button type="button" aria-label="重新生成回复" disabled={retryDisabled || regenerating} onClick={() => void regenerate()} className={buttonClassName}>
      <RefreshCwIcon aria-hidden="true" className={cn('size-3.5', regenerating && 'motion-safe:animate-spin')} />
    </button>
    <ActionBarMorePrimitive.Root>
      <ActionBarMorePrimitive.Trigger aria-label="更多回复操作" className={buttonClassName}><EllipsisIcon aria-hidden="true" className="size-3.5" /></ActionBarMorePrimitive.Trigger>
      <ActionBarMorePrimitive.Content side="bottom" align="start" className="z-50 min-w-40 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-md">
        <ActionBarMorePrimitive.Item disabled={readOnly || metadata.sequence === null} onSelect={() => {
          aui.thread.composer().setQuote({ messageId: metadata.clientMessageId, text: getText() })
        }} className="flex cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:bg-accent data-[disabled]:opacity-40">
          <ReplyIcon aria-hidden="true" className="size-4" />回复
        </ActionBarMorePrimitive.Item>
        <ActionBarPrimitive.ExportMarkdown asChild>
          <ActionBarMorePrimitive.Item className="flex cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:bg-accent data-[disabled]:opacity-40">
            <DownloadIcon aria-hidden="true" className="size-4" />导出为 Markdown
          </ActionBarMorePrimitive.Item>
        </ActionBarPrimitive.ExportMarkdown>
      </ActionBarMorePrimitive.Content>
    </ActionBarMorePrimitive.Root>
    </ActionBarPrimitive.Root>}
  </>
}
