import { lazy, Suspense, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'

const ArtifactView = lazy(() => import('@/features/artifacts/components/ArtifactView').then(module => ({ default: module.ArtifactView })))
type Design = { artifactId: string; title: string }

/** The caller keys this workspace by account, workspace and conversation.
 * Keep the editor alive when folded, including its unsaved edits and live updates. */
export function DesignWorkspace({ children, design, onClose }: { children: ReactNode; design: Design | null; onClose(): void }) {
  const [retained, setRetained] = useState(design)
  if (design && design !== retained) setRetained(design)
  const current = design ?? retained
  const open = Boolean(design)
  const panel = useRef<HTMLElement>(null)
  const opener = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus({ preventScroll: true })
  }, [open, design?.artifactId])

  const close = () => {
    onClose()
    requestAnimationFrame(() => {
      const target = opener.current
      if (target?.isConnected && target !== document.body) target.focus({ preventScroll: true })
      else document.querySelector<HTMLElement>('[data-design-open-trigger]')?.focus({ preventScroll: true })
    })
  }

  return <div data-design-workspace data-design-open={open} className="relative h-full min-h-0 min-w-0 overflow-hidden">
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel id="canvas-conversation" defaultSize="50%" minSize="35%" className="min-h-0 min-w-0 overflow-hidden">
        {children}
      </ResizablePanel>
      <ResizableHandle data-design-resize-handle withHandle hidden={!open} aria-label="调整对话与画板宽度" />
      <ResizablePanel id="canvas-editor" data-design-pane aria-hidden={!open} inert={!open} disabled={!open}
        defaultSize="50%" minSize="35%" maxSize="65%" className="min-h-0 min-w-0 overflow-hidden">
        <aside id="conversation-design-panel" ref={panel} tabIndex={-1} aria-label={`设计画板：${current?.title ?? '设计'}`}
          className="h-full min-h-0 min-w-0 bg-background focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          onKeyDown={event => {
            if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); close() }
          }}>
          {current && <Suspense fallback={<div className="flex h-full min-h-0 flex-col"><Button type="button" variant="ghost" className="m-2 shrink-0 self-end" onClick={close}>关闭设计</Button><ResourceSkeleton variant="media" label="正在打开设计" /></div>}>
            <ArtifactView key={current.artifactId} artifactId={current.artifactId} kind="design" title={current.title} onClose={close} />
          </Suspense>}
        </aside>
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
}
