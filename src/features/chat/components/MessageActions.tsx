import { ActionBarPrimitive, useAui, useAuiState } from '@assistant-ui/react'
import { Copy01Icon, ReplyIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type RefObject, useEffect, useState } from 'react'
import { confidenceCopyText, type MarkdownConfidenceClaim } from '@/components/assistant-ui/markdown-text'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { nativeText } from '@/lib/nativeMessage'

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

  return (
    <ActionBarPrimitive.Root hideWhenRunning className={cn(
      'absolute top-1/2 z-30 flex -translate-y-1/2 items-center gap-0.5 bg-transparent text-foreground transition-opacity motion-reduce:transition-none group-hover/message:opacity-100 focus-within:opacity-100',
      success ? 'opacity-100' : 'opacity-0',
      isMine ? 'end-full me-2' : 'start-full ms-2',
      className,
    )} role="toolbar" aria-label="消息操作">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="size-7 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        aria-label={success === 'reply' ? '已回复' : '回复'}
        onClick={() => {
          aui.thread.composer().setQuote({ messageId, text: getText() })
          setSuccess('reply')
        }}
      >
        <HugeiconsIcon icon={success === 'reply' ? Tick02Icon : ReplyIcon} strokeWidth={2} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="size-7 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        aria-label={success === 'copy' ? '已复制' : '复制'}
        onClick={async () => {
          if (await copyMessageText(getText())) setSuccess('copy')
        }}
      >
        <HugeiconsIcon icon={success === 'copy' ? Tick02Icon : Copy01Icon} strokeWidth={2} />
      </Button>
    </ActionBarPrimitive.Root>
  )
}

export function useMessageCopyText(bodyRef: RefObject<HTMLElement | null>) {
  const inlineCitations = useAuiState(state => Boolean(state.message.metadata.custom.runId))
  const rawText = useAuiState((state) => nativeText(state.message))
  const confidenceClaims = useAuiState((state) => {
    const part = state.message.content.find((part) => part.type === 'data' && part.name === 'citation-claims')
    if (part?.type !== 'data' || !part.data || typeof part.data !== 'object') return undefined
    const claims = (part.data as { claims?: unknown }).claims
    return Array.isArray(claims) ? claims as MarkdownConfidenceClaim[] : undefined
  })
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
      return confidenceCopyText(rawText, ranges)
    }
    const renderedIds = new Set(Array.from(body?.querySelectorAll<HTMLElement>('[data-confidence-id]') ?? [])
      .filter(node => node.closest('.native-message-content') === messageContent).map(node => node.dataset.confidenceId))
    return confidenceCopyText(rawText, confidenceClaims?.filter(claim => renderedIds.has(claim.id)))
  }
  return { rawText, confidenceClaims, getText }
}
