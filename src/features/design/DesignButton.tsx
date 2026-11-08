import {readDesignLink} from '../../../shared/artifact-links'
import { PanelRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { userFacingError } from '@/lib/userFacingError'
import { useSurface } from '@/stores/surface'
import { loadArtifactView } from './DesignWorkspace'
import { openConversationDesign, prefetchConversationDesign, restoreLinkedConversationDesign } from './open-design'

/** The conversation header's Design entry: the conversation's one canvas, created on first open. */
export function DesignButton({ conversationId }: { conversationId: string }) {
  const [pending, setPending] = useState(false)
  const expanded = useSurface(state => state.surface?.kind === 'design')
  const linkedArtifact=readDesignLink(new URLSearchParams(window.location.search))?.artifactId
  useEffect(()=>{
    if(!linkedArtifact)return
    const controller=new AbortController()
    void restoreLinkedConversationDesign(conversationId,linkedArtifact,controller.signal).catch(reason=>{if(!controller.signal.aborted)toast.error(userFacingError(reason,'设计链接暂时无法打开，请重试。'))})
    return()=>controller.abort()
  },[conversationId,linkedArtifact])
  // Hover, focus and press load the panel and native editor while locating the canvas.
  const warm = () => {
    void loadArtifactView().catch(() => {})
    prefetchConversationDesign(conversationId)
  }
  const open = async (opener: HTMLButtonElement) => {
    warm()
    if (pending) return
    if (expanded) { useSurface.getState().closeDesign(); return }
    setPending(true)
    try {
      await openConversationDesign(conversationId, opener)
    } catch (reason) {
      toast.error(userFacingError(reason, '设计暂时无法打开，请重试。'))
    } finally {
      setPending(false)
    }
  }
  return <Button type="button" variant="ghost" size="sm" className={`h-8 gap-1.5 rounded-[9px] border border-input px-3.5 text-[13.5px] font-medium text-foreground max-md:min-h-11 ${expanded ? 'bg-accent hover:bg-accent' : 'bg-background hover:bg-accent/60'}`} aria-label={expanded ? '关闭画板' : '打开画板'} aria-pressed={expanded} title="画板"
    aria-controls="conversation-design-panel" aria-expanded={expanded} aria-busy={pending || undefined} aria-disabled={pending || undefined} onPointerEnter={warm} onFocus={warm} onClick={event => void open(event.currentTarget)} data-design-open-trigger>
    <PanelRight className="size-[15px]" strokeWidth={1.8} />画板
  </Button>
}
