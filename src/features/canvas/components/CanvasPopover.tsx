import { DashboardSquare01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useRef, useState } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { userFacingError } from '@/lib/userFacingError'
import { useSurface } from '@/stores/surface'
import { useCanvas } from '../state'
import { CanvasPreview } from './CanvasPreview'

export function CanvasPopover({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const openingFullView = useRef(false)
  const surface = useSurface((state) => state.surface)
  useEffect(() => { if (surface) setOpen(false) }, [surface])

  return <Popover open={open} onOpenChange={(next) => { openingFullView.current = false; setOpen(next) }}>
    <PopoverTrigger asChild>
      <Button ref={triggerRef} type="button" variant="ghost" size="icon-lg" className="size-11 text-muted-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground" aria-label={open ? '收起 Canvas 预览' : '打开 Canvas 预览'} title="Canvas" data-canvas-popover-trigger>
        <HugeiconsIcon icon={DashboardSquare01Icon} strokeWidth={1.8} className="size-5" />
      </Button>
    </PopoverTrigger>
    <PopoverContent side="bottom" align="end" sideOffset={12} collisionPadding={12} aria-label="当前会话 Canvas" className="w-[min(360px,calc(100vw-24px))] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto rounded-2xl p-0" onInteractOutside={(event) => event.preventDefault()} onCloseAutoFocus={(event) => { event.preventDefault(); if (!openingFullView.current) triggerRef.current?.focus({ preventScroll: true }) }}>
      {open && <CanvasPopoverPreview conversationId={conversationId} onOpenCanvas={(id) => {
        openingFullView.current = true
        setOpen(false)
        useSurface.getState().openCanvasPeek(id)
      }} />}
    </PopoverContent>
  </Popover>
}

function CanvasPopoverPreview({ conversationId, onOpenCanvas }: { conversationId: string; onOpenCanvas(id: string): void }) {
  const ensure = useCanvas((state) => state.ensureForConversation)
  const [canvasId, setCanvasId] = useState<string | null>(null)
  const preview = useCanvas((state) => canvasId ? state.previews[canvasId] : undefined)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setError('')
    void ensure(conversationId)
      .then((snapshot) => { if (active) setCanvasId(snapshot.id) })
      .catch((reason) => { if (active) setError(userFacingError(reason, '画布暂时无法加载，请重试。')) })
    return () => { active = false }
  }, [conversationId, ensure, attempt])

  return <>
    {error ? <div role="alert" className="grid aspect-video place-content-center gap-3 p-4 text-center"><p className="text-sm text-muted-foreground">{error}</p><Button variant="outline" onClick={() => setAttempt((current) => current + 1)}>重试</Button></div>
      : !preview ? <ResourceSkeleton variant="media" label="正在准备画布" className="aspect-video" />
        : <Button type="button" variant="outline" aria-label={`打开完整画布：${preview.title}`} onClick={() => onOpenCanvas(preview.id)} className="canvas-preview-shell relative aspect-video h-auto w-full overflow-hidden rounded-2xl border-border bg-card p-0 text-start font-normal whitespace-normal shadow-none hover:bg-card">
          <div className="pointer-events-none h-full w-full" inert><CanvasPreview snapshot={preview} title={preview.title} frameCount={preview.frames.length} fill /></div>
          {!preview.frames.some((frame) => frame.type !== 'artifact') && <span className="pointer-events-none absolute inset-0 grid place-content-center gap-1 text-center"><span className="text-sm font-medium">画布还是空的</span><span className="text-xs text-muted-foreground">打开完整画布开始创作</span></span>}
        </Button>}
  </>
}
