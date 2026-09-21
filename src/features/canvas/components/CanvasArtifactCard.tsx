import { PanelsTopLeftIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ArtifactCard } from '@/components/assistant-ui/elements/artifact-card'
import { useSurface } from '@/stores/surface'
import { useCanvas } from '../state'
import { CanvasPreview } from './CanvasPreview'

export function CanvasArtifactCard({ canvasId, title, description }: { canvasId: string; title: string; description?: string }) {
  const snapshot = useCanvas(state => state.snapshot?.id === canvasId ? state.snapshot : state.previews[canvasId])
  const loadPreview = useCanvas(state => state.loadPreview)
  const openCanvas = useSurface(state => state.openCanvasPeek)
  const [loadedId, setLoadedId] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void loadPreview(canvasId).then(() => { if (active) setLoadedId(canvasId) })
    return () => { active = false }
  }, [canvasId, loadPreview])
  const frameCount = snapshot?.frames.filter(frame => frame.type !== 'artifact').length ?? 0
  return <ArtifactCard
    title={snapshot?.title || title}
    meta={snapshot ? `${frameCount} 个内容区${description ? ` · ${description}` : ''}` : description || '协作画布'}
    icon={<PanelsTopLeftIcon />}
    preview={snapshot && !frameCount
      ? <p className="grid h-full place-items-center text-xs text-muted-foreground">画布暂无可预览内容</p>
      : snapshot || loadedId !== canvasId
      ? <div className="pointer-events-none h-full" inert><CanvasPreview snapshot={snapshot ?? null} title={title} frameCount={frameCount} fill /></div>
      : <p className="grid h-full place-items-center px-4 text-center text-xs text-muted-foreground">预览暂不可用，可打开画布查看</p>}
    onOpen={() => openCanvas(canvasId)}
    openLabel="打开画布"
  />
}
