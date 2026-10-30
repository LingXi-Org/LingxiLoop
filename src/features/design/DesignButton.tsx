import { CanvasIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { artifactsApi } from '@/features/artifacts/api'
import { userFacingError } from '@/lib/userFacingError'
import { useSurface } from '@/stores/surface'

/** The conversation header's Design entry: the conversation's one canvas, created on first open. */
export function DesignButton({ conversationId }: { conversationId: string }) {
  const [pending, setPending] = useState(false)
  const open = async () => {
    setPending(true)
    try {
      const design = await artifactsApi.ensureConversationDesign(conversationId)
      useSurface.getState().openDesign(design.id, design.title)
    } catch (reason) {
      toast.error(userFacingError(reason, '设计暂时无法打开，请重试。'))
    } finally {
      setPending(false)
    }
  }
  return <Button type="button" variant="ghost" size="icon-lg" className="size-11 text-muted-foreground" aria-label="打开设计" title="设计"
    aria-busy={pending || undefined} disabled={pending} onClick={() => void open()} data-design-open-trigger>
    <HugeiconsIcon icon={CanvasIcon} strokeWidth={1.8} className="size-5" />
  </Button>
}
