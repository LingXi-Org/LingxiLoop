import { CanvasIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { userFacingError } from '@/lib/userFacingError'
import { useSurface } from '@/stores/surface'
import { openConversationDesign } from './open-design'

/** The conversation header's Design entry: the conversation's one canvas, created on first open. */
export function DesignButton({ conversationId }: { conversationId: string }) {
  const [pending, setPending] = useState(false)
  const expanded = useSurface(state => state.surface?.kind === 'design')
  const open = async (opener: HTMLButtonElement) => {
    if (pending) return
    setPending(true)
    try {
      await openConversationDesign(conversationId, opener)
    } catch (reason) {
      toast.error(userFacingError(reason, '设计暂时无法打开，请重试。'))
    } finally {
      setPending(false)
    }
  }
  return <Button type="button" variant="ghost" size="icon-lg" className="size-11 text-muted-foreground" aria-label="打开设计" title="设计"
    aria-controls="conversation-design-panel" aria-expanded={expanded} aria-busy={pending || undefined} aria-disabled={pending || undefined} onClick={event => void open(event.currentTarget)} data-design-open-trigger>
    <HugeiconsIcon icon={CanvasIcon} strokeWidth={1.8} className="size-5" />
  </Button>
}
