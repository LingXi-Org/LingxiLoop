import { ActionBarPrimitive, useAui, useAuiState } from '@assistant-ui/react'
import { Copy01Icon, ReplyIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export async function copyMessageText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    toast.error('复制失败，请重试')
    return false
  }
}

export function MessageActions({ isMine, getText }: { isMine: boolean; getText: () => string }) {
  const aui = useAui()
  const messageId = useAuiState((state) => state.message.id)
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
