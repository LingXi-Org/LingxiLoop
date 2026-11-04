import { lazy, Suspense, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { RightPanelHeader } from '@/components/shell/RightPanel'
import { Sidebar, SidebarProvider } from '@/components/ui/sidebar'
import { SidebarResizeHandle } from '@/components/ui/sidebar-resize-handle'
import { PENDING_DESIGN_ID } from './pending'

export const loadArtifactView = () => import('@/features/artifacts/components/ArtifactView')
const ArtifactView = lazy(() => loadArtifactView().then(module => ({ default: module.ArtifactView })))
type Design = { artifactId: string; title: string }

/** The caller keys this workspace by account, workspace and conversation.
 * Keep the editor alive when folded, including its unsaved edits and live updates. */
export function DesignWorkspace({ children, design, onClose, visible = true }: { children: ReactNode; design: Design | null; onClose(): void; visible?: boolean }) {
  const [retained, setRetained] = useState(design)
  const pending = design?.artifactId === PENDING_DESIGN_ID
  if (design && !pending && design !== retained) setRetained(design)
  // Reopening this conversation's one canvas must retain its live draft while
  // the ensure request checks the existing board again.
  const current = pending && retained?.artifactId ? retained : design ?? retained
  const open = Boolean(design) && visible
  const panel = useRef<HTMLElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const [width, setWidth] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    if (!panel.current?.contains(document.activeElement)) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
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

  const placeholder = <div className="flex h-full min-h-0 flex-col"><RightPanelHeader eyebrow="设计" title={current?.title ?? '设计'} onClose={close} closeLabel="关闭设计" /><ResourceSkeleton variant="media" label="正在打开设计" /></div>

  return <div data-design-workspace data-design-open={open} className="relative h-full min-h-0 min-w-0 overflow-hidden">
    <SidebarProvider open={open} openMobile={open} onOpenChange={value => { if (!value) close() }} onOpenMobileChange={value => { if (!value) close() }} keyboardShortcut={open}
      className="relative h-full min-h-0 overflow-hidden" style={{ '--sidebar-width': width === null ? 'min(620px, 50cqw)' : `clamp(35cqw, ${width}px, 65cqw)` } as React.CSSProperties}>
      <div className="h-full min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
      <Sidebar side="right" data-design-pane aria-hidden={!open} inert={!open} keepMobileMounted
        mobileTitle="设计画板" mobileDescription="编辑当前会话的设计画板。" className="max-md:w-screen max-md:max-w-none md:absolute md:h-full">
        <aside id="conversation-design-panel" ref={panel} tabIndex={-1} aria-label={`设计画板：${current?.title ?? '设计'}`}
          className="h-full min-h-0 min-w-0 bg-background focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          onKeyDown={event => {
            if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); close() }
          }}>
          {current && (current.artifactId === PENDING_DESIGN_ID ? placeholder : <Suspense fallback={placeholder}>
            <ArtifactView key={current.artifactId} artifactId={current.artifactId} kind="design" title={current.title} onClose={close} visible={visible && open} />
          </Suspense>)}
        </aside>
        <SidebarResizeHandle data-design-resize-handle side="right" label="调整对话与画板宽度" min="35%" max="65%" onResize={setWidth} />
      </Sidebar>
    </SidebarProvider>
  </div>
}
