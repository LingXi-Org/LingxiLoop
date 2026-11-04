import { type ReactNode, useEffect, useState } from 'react'
import { Sidebar, SidebarProvider, SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { SidebarResizeHandle } from '@/components/ui/sidebar-resize-handle'
import { DeckNav } from './DeckNav'
import { ShellNavContext, ShellNavTriggerContext } from './ShellNav'

function SlidesSidebarContent({ children, width, onResize, active }: { children: ReactNode; width: number; onResize(width: number): void; active: boolean }) {
  const { setOpenMobile } = useSidebar()
  useEffect(() => { if (!active) setOpenMobile(false) }, [active, setOpenMobile])
  return <>
    <Sidebar side="left" className="md:absolute md:h-full" mobileTitle="演示文稿导航" mobileDescription="浏览当前工作区的演示文稿。">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-sm font-medium">演示文稿</span>
        <SidebarTrigger aria-label="收起演示文稿导航" className="size-11" />
      </div>
      <div className="min-h-0 flex-1"><DeckNav onNavigate={() => setOpenMobile(false)} /></div>
      <SidebarResizeHandle side="left" label="调整演示文稿导航宽度" min={260} max={360} onResize={onResize} aria-description={`当前宽度 ${width} 像素，使用左右方向键调整。`} />
    </Sidebar>
    <ShellNavContext.Provider value={null}>
      <ShellNavTriggerContext.Provider value={<SidebarTrigger aria-label="展开或收起演示文稿导航" className="size-11 shrink-0" />}>
        <div className="relative h-full min-h-0 min-w-0 flex-1">{children}</div>
      </ShellNavTriggerContext.Provider>
    </ShellNavContext.Provider>
  </>
}

/** Mounted once per Slides entry/project. Content updates never reset a manual toggle. */
export function SlidesSidebarLayout({ children, active = true }: { children: ReactNode; active?: boolean }) {
  const [width, setWidth] = useState(300)
  return <SidebarProvider defaultOpen={false} className="relative h-full min-h-0 overflow-hidden" style={{ '--sidebar-width': `${width}px` } as React.CSSProperties}>
    <SlidesSidebarContent active={active} width={width} onResize={setWidth}>{children}</SlidesSidebarContent>
  </SidebarProvider>
}
