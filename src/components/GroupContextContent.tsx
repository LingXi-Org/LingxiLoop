import { type ReactNode, useEffect, useState } from 'react'
import { IconLayoutDashboard, IconPlus } from '@tabler/icons-react'
import { CanvasPreview } from '@/components/CanvasPreview'
import { Button } from '@/components/ui/button'
import { SourcePanel } from '@/components/WorkspaceChrome'
import { useApp } from '@/stores/app'
import { useCanvas } from '@/stores/canvas'

export function GroupCanvasPanel({ conversationId, flat = false, toolbar }: { conversationId: string; flat?: boolean; toolbar?: ReactNode }) {
  const workspaces = useCanvas((state) => state.workspaces)
  const previews = useCanvas((state) => state.previews)
  const snapshot = useCanvas((state) => state.snapshot)
  const loadWorkspaces = useCanvas((state) => state.loadWorkspaces)
  const loadPreview = useCanvas((state) => state.loadPreview)
  const createForConversation = useCanvas((state) => state.createForConversation)
  const openCanvas = useApp((state) => state.openCanvasPeek)
  const [creating, setCreating] = useState(false)
  const summary = workspaces.find((item) => item.conversationId === conversationId) ?? null
  const preview = summary ? (previews[summary.id] ?? (snapshot?.id === summary.id ? snapshot : null)) : null

  useEffect(() => { void loadWorkspaces(conversationId) }, [conversationId, loadWorkspaces])
  useEffect(() => { if (summary) void loadPreview(summary.id) }, [loadPreview, summary?.id])

  const start = async () => {
    setCreating(true)
    try {
      const created = await createForConversation(conversationId)
      openCanvas(created.id)
    }
    finally { setCreating(false) }
  }

  return <section className={`flex h-full min-h-0 flex-col ${flat ? 'bg-transparent' : 'bg-panel'}`}>
    {flat ? toolbar ? <div className="flex h-10 shrink-0 items-center justify-between px-3">
      {toolbar}
    </div> : null : <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-hairline px-3.5">
      <div><h2 className="text-sm font-semibold text-ink">Canvas</h2><p className="text-[10px] text-ink-secondary">只读实时预览</p></div>
    </header>}
    {summary ? <div className={`flex min-h-0 flex-1 flex-col ${flat ? 'px-3 pb-2 pt-9' : 'gap-2 p-3'}`}>
      <button type="button" onClick={() => openCanvas(summary.id)} className={`group relative min-h-0 flex-1 cursor-zoom-in overflow-hidden bg-app text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${flat ? 'rounded-2xl shadow-sm' : 'rounded-xl border border-hairline'}`} aria-label="打开完整 Canvas"><CanvasPreview snapshot={preview} title={summary.title} frameCount={summary.frameCount} fill={flat} /></button>
      {!flat && <p className="flex shrink-0 items-center justify-between text-[10px] text-ink-secondary"><span>{summary.frameCount} 张卡片 · {summary.assignmentCount} 个 Agent</span><span className="flex items-center gap-1"><i className="size-1.5 rounded-full bg-emerald-500" />实时</span></p>}
    </div> : <div className="grid min-h-0 flex-1 place-items-center px-8 pb-12 text-center"><div><IconLayoutDashboard className="mx-auto size-8 text-muted-foreground" /><p className="mt-4 text-sm font-medium text-foreground">还没有 Canvas</p><p className="mt-1 max-w-[250px] text-xs leading-5 text-muted-foreground">开始后，Agent 的工作进度会实时出现在这里。</p><Button type="button" disabled={creating} onClick={() => void start()} className="context-empty-action mt-4" size="sm"><IconPlus />{creating ? '正在创建…' : '开始 Canvas'}</Button></div></div>}
  </section>
}

/** Business content rendered inside OpenBot's unmodified DetailPanel. */
export function GroupContextContent({ conversationId }: { conversationId: string }) {
  return <div className="grid h-full min-h-0 grid-rows-[minmax(0,38fr)_minmax(0,62fr)] overflow-hidden bg-sidebar" data-context-layout="flat-stacked" aria-label="群聊上下文内容">
    <div className="min-h-0 overflow-hidden"><GroupCanvasPanel conversationId={conversationId} flat /></div>
    <div className="min-h-0 overflow-hidden"><SourcePanel flat toolbar={<span className="px-2 text-xs font-medium text-muted-foreground">资料</span>} /></div>
  </div>
}
