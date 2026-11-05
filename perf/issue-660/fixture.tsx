// Actual shared Sidebar/resize components; authored chat, list and iframe load.
// This isolates layout cost. It is not an authenticated editor or network benchmark.
import { Profiler, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Sidebar, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { SidebarResizeHandle } from '@/components/ui/sidebar-resize-handle'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import '@/styles/globals.css'

declare global { interface Window { measurements: { commits: number; changes: number; writes: number }; reset(): void } }
window.measurements = { commits: 0, changes: 0, writes: 0 }
window.reset = () => { window.measurements = { commits: 0, changes: 0, writes: 0 } }
const side = new URLSearchParams(location.search).get('side') === 'left' ? 'left' : 'right'
const native = new URLSearchParams(location.search).has('native')
const stream = new URLSearchParams(location.search).has('stream')
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120"><rect fill="#8ac" width="320" height="120"/></svg>')
const doc = '<!doctype html><html><body><h1 contenteditable="true">Unsaved authored document</h1>' + Array.from({ length: 80 }, (_, i) => `<section><h2>数学与图片 ${i}</h2><p>y = x² + 2x + 1。固定重内容样稿与可访问的文字。</p><img width="320" height="120" src="${image}"></section>`).join('') + '</body></html>'

function Chat() {
  const [tokens, setTokens] = useState(0)
  useEffect(() => { if (stream) { const timer = setInterval(() => setTokens(n => n + 1), 40); return () => clearInterval(timer) } }, [])
  return <main style={{ height: '100%', overflow: 'auto', padding: 16 }}><textarea aria-label="消息" defaultValue="保留草稿" /><p>流式输出 {tokens}</p>{Array.from({ length: 300 }, (_, i) => <article key={i}><h3>会话消息 {i}</h3><p>较长的中文正文与公式 x² + y²。保留阅读位置与可编辑的输入。</p></article>)}</main>
}
function Fixture() {
  const [width, setWidth] = useState(side === 'left' ? 300 : 600)
  const [open, setOpen] = useState(true)
  const contents = <iframe title="authored document" srcDoc={doc} style={{ width: '100%', height: '100%', border: 0 }} />
  return <Profiler id="sidebar" onRender={() => { window.measurements.commits++ }}>
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: 8 }}><button id="toggle" onClick={() => setOpen(v => !v)} type="button">开关</button></header>
      <div style={{ flex: 1, minHeight: 0 }}>
      {native ? <ResizablePanelGroup id="desktop-conversation-layout" onLayoutChanged={(_layout, meta) => {
        if (!meta.isUserInteraction) return
        const measured = document.querySelector('[data-panel="conversations"]')?.getBoundingClientRect().width
        if (!measured) return
        setWidth(Math.min(360, Math.max(260, Math.round(measured))))
        localStorage.setItem('fixture:sidebar-width', String(measured)); window.measurements.writes++
      }}>
        <ResizablePanel id="conversations" defaultSize={300} minSize={260} maxSize={360}><div>{Array.from({ length: 300 }, (_, i) => <p key={i}>会话 {i}</p>)}</div></ResizablePanel>
        <ResizableHandle aria-label="调整主侧栏" withHandle />
        <ResizablePanel id="workspace" minSize={320}><Chat /></ResizablePanel>
      </ResizablePanelGroup> : <SidebarProvider open={open} onOpenChange={setOpen} className="relative h-full min-h-0 overflow-hidden" style={{ '--sidebar-width': `${width}px` } as React.CSSProperties}>
        {side === 'right' && <div style={{ flex: 1, minWidth: 0 }}><Chat /></div>}
        <Sidebar side={side} className="md:absolute md:h-full" mobileTitle="侧栏" mobileDescription="固定性能样稿">
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{side === 'left' ? Array.from({ length: 300 }, (_, i) => <p key={i}>演示文稿 {i}</p>) : contents}</div>
          <SidebarResizeHandle side={side} label="调整侧栏" min={side === 'left' ? 260 : '35%'} max={side === 'left' ? 360 : '65%'} onResize={value => { window.measurements.changes++; setWidth(value) }} />
        </Sidebar>
        {side === 'left' && <div style={{ flex: 1, minWidth: 0 }}><Chat /></div>}
        <SidebarTrigger className="fixed bottom-2 left-2" />
      </SidebarProvider>}
      </div>
    </div>
  </Profiler>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
