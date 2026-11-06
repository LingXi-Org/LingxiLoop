import { ActionBarPrimitive, useAui, useAuiState } from '@assistant-ui/react'
import { type RefObject, useEffect, useMemo, useState } from 'react'
import { confidenceCopyText, type MarkdownConfidenceClaim } from '@/components/assistant-ui/markdown-text'
import { toast } from 'sonner'
import { chatTransport } from '../runtime/transport'
import { EmojiPicker } from './EmojiPicker'
import { cn } from '@/lib/utils'
import { nativeText } from '@/lib/nativeMessage'
import { displayMentionText, type MentionTarget } from '@/lib/mentions'

export async function copyMessageText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    toast.error('复制失败，请重试')
    return false
  }
}

export function MessageActions({ isMine, getText, className }: { isMine: boolean; getText: () => string; className?: string }) {
  const aui = useAui()
  const messageId = useAuiState((state) => typeof state.message.metadata.custom.clientMessageId === 'string' ? state.message.metadata.custom.clientMessageId : state.message.id)
  const [success, setSuccess] = useState<'reply' | 'copy' | null>(null)
  useEffect(() => {
    if (!success) return
    const timer = window.setTimeout(() => setSuccess(null), 1_500)
    return () => window.clearTimeout(timer)
  }, [success])

  const conversationId = useAuiState((state) => state.message.metadata.custom.conversationId as string | undefined)
  const reactTarget = useAuiState((state) => state.message.id)
  return (
    <ActionBarPrimitive.Root hideWhenRunning className={cn(
      'absolute z-30 flex items-center gap-px rounded-xl bg-card p-[3px] shadow-[var(--popover-shadow)] transition-opacity motion-reduce:transition-none group-hover/message:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100',
      success ? 'opacity-100' : 'opacity-0',
      isMine ? 'end-full top-1/2 me-2 -translate-y-1/2' : 'end-2.5 -top-4',
      className,
    )} role="toolbar" aria-label="消息操作">
      {!isMine && conversationId && <EmojiPicker align="end" onPick={(emoji) => void chatTransport.toggleReaction(conversationId, reactTarget, emoji)}>
        <button type="button" aria-label="表情回应" title="表情" className="grid size-7 place-items-center rounded-[7px] text-fg2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-accent">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-[15px]"><circle cx="12" cy="12" r="9" /><path d="M8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01" /></svg>
        </button>
      </EmojiPicker>}
      <button type="button" aria-label={success === 'reply' ? '已回复' : '回复'} title="回复" className={cn("grid size-7 place-items-center rounded-[7px] text-fg2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring", success === 'reply' && 'text-brand')}
        onClick={() => { aui.thread.composer().setQuote({ messageId, text: getText() }); setSuccess('reply') }}>
        {success === 'reply' ? <CheckIcon /> : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-[15px]"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 6 6v5" /></svg>}
      </button>
      <button type="button" aria-label={success === 'copy' ? '已复制' : '复制'} title="复制" className={cn("grid size-7 place-items-center rounded-[7px] text-fg2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring", success === 'copy' && 'text-brand')}
        onClick={async () => { if (await copyMessageText(getText())) setSuccess('copy') }}>
        {success === 'copy' ? <CheckIcon /> : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-[15px]"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>}
      </button>
    </ActionBarPrimitive.Root>
  )
}

function CheckIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="size-[15px]"><path d="m5 12 5 5 9-10" /></svg>
}

export function useMessageCopyText(bodyRef: RefObject<HTMLElement | null>, mentionTargets: readonly MentionTarget[] = []) {
  const inlineCitations = useAuiState(state => Boolean(state.message.metadata.custom.runId))
  const content = useAuiState(state => state.message.content)
  const rawText = useMemo(() => nativeText({ content }), [content])
  const confidenceClaims = useMemo(() => {
    const part = content.find((part) => part.type === 'data' && part.name === 'citation-claims')
    if (part?.type !== 'data' || !part.data || typeof part.data !== 'object') return undefined
    const claims = (part.data as { claims?: unknown }).claims
    return Array.isArray(claims) ? claims as MarkdownConfidenceClaim[] : undefined
  }, [content])
  const getText = () => {
    const messageContent = bodyRef.current?.closest('.native-message-content')
      ?? bodyRef.current?.closest('[data-msg-id]')?.querySelector('.native-message-content')
    const body = messageContent?.querySelector('[data-message-region="body"]') ?? messageContent
    if (inlineCitations) {
      const ranges = Array.from(body?.querySelectorAll<HTMLElement>('[data-citation-start]') ?? []).filter(node => node.closest('.native-message-content') === messageContent).flatMap(node => {
        const start = Number(node.dataset.citationStart), end = Number(node.dataset.citationEnd)
        const link = /^\[([\s\S]+)\]\(#cite-[^)]*\)$/.exec(rawText.slice(start, end))
        return link && Number.isSafeInteger(start) && Number.isSafeInteger(end) && end <= rawText.length
          ? [{ start, end, text: node.dataset.citationHidden ? '' : link[1] }] : []
      })
      return displayMentionText(confidenceCopyText(rawText, ranges),mentionTargets)
    }
    const renderedIds = new Set(Array.from(body?.querySelectorAll<HTMLElement>('[data-confidence-id]') ?? [])
      .filter(node => node.closest('.native-message-content') === messageContent).map(node => node.dataset.confidenceId))
    return displayMentionText(confidenceCopyText(rawText, confidenceClaims?.filter(claim => renderedIds.has(claim.id))),mentionTargets)
  }
  return { rawText, confidenceClaims, getText }
}
