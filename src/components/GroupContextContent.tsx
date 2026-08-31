import { DashboardSquare01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type ReactNode, useEffect, useState } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { CanvasPreview } from '@/features/canvas/components/CanvasPreview'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { SourcePanel } from '@/components/WorkspaceChrome'
import { useSurface } from '@/stores/surface'
import { useCanvas } from '@/features/canvas/state'

export function GroupCanvasPanel({ conversationId, flat = false, toolbar }: { conversationId: string; flat?: boolean; toolbar?: ReactNode }) {
  const workspaces = useCanvas((state) => state.workspaces)
  const previews = useCanvas((state) => state.previews)
  const snapshot = useCanvas((state) => state.snapshot)
  const loadPreview = useCanvas((state) => state.loadPreview)
  const ensureForConversation = useCanvas((state) => state.ensureForConversation)
  const openCanvas = useSurface((state) => state.openCanvasPeek)
  const [preparing, setPreparing] = useState(true)
  const [prepareFailed, setPrepareFailed] = useState(false)
  const summary = workspaces.find((item) => item.conversationId === conversationId) ?? null
  const preview = summary ? (previews[summary.id] ?? (snapshot?.id === summary.id ? snapshot : null)) : null

  useEffect(() => {
    let active = true
    setPreparing(true)
    setPrepareFailed(false)
    void ensureForConversation(conversationId)
      .catch(() => { if (active) setPrepareFailed(true) })
      .finally(() => { if (active) setPreparing(false) })
    return () => { active = false }
  }, [conversationId, ensureForConversation])
  useEffect(() => { if (summary) void loadPreview(summary.id) }, [loadPreview, summary?.id])

  return <section className={`flex h-full min-h-0 flex-col ${flat ? 'bg-transparent' : 'bg-panel'}`}>
    {flat ? toolbar ? <div className="flex h-10 shrink-0 items-center justify-between px-3">
      {toolbar}
    </div> : null : <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-hairline px-3.5">
      <div><h2 className="text-sm font-semibold text-ink">画布</h2><p className="text-[10px] text-ink-secondary">实时预览</p></div>
    </header>}
    {summary ? <div className={`flex min-h-0 flex-1 flex-col ${flat ? 'p-3' : 'gap-2 p-3'}`}>
      <Button type="button" variant="outline" onClick={() => openCanvas(summary.id)} aria-label="打开完整画布" data-canvas-open-trigger={summary.id} className="canvas-preview-shell h-full min-h-0 w-full flex-1 shrink cursor-zoom-in items-stretch justify-stretch overflow-hidden rounded-2xl border-border bg-card p-0 text-start shadow-none hover:bg-card"><CanvasPreview snapshot={preview} title={summary.title} frameCount={summary.frameCount} fill={flat} /></Button>
      {!flat && <p className="flex shrink-0 items-center justify-between text-[10px] text-ink-secondary"><span>{summary.frameCount} 张卡片 · {summary.assignmentCount} 位智能助教</span><span className="flex items-center gap-1"><i className="size-1.5 rounded-full bg-primary" />实时</span></p>}
    </div> : preparing ? <ResourceSkeleton variant="media" label="正在准备画布" className="min-h-0 flex-1 p-3" /> : <Empty className="min-h-0 px-6 py-8">
      <EmptyHeader>
        <EmptyMedia variant="icon"><HugeiconsIcon icon={DashboardSquare01Icon} strokeWidth={2} /></EmptyMedia>
        <EmptyTitle className="text-base">{prepareFailed ? '画布暂不可用' : '正在准备画布'}</EmptyTitle>
        <EmptyDescription>{prepareFailed ? '暂时无法准备画布，请稍后重试。' : '每个会话都有独立画布，准备完成后会自动显示。'}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent><span className="text-xs text-muted-foreground">无需手动创建</span></EmptyContent>
    </Empty>}
  </section>
}

/** Business content rendered inside the shared detail panel. */
export function GroupContextContent({ conversationId }: { conversationId: string }) {
  return <div className="grid h-full min-h-0 grid-rows-[minmax(0,38fr)_minmax(0,62fr)] overflow-hidden bg-card" data-context-layout="flat-stacked" aria-label="资料与 Canvas 工作区">
    <div className="min-h-0 overflow-hidden"><GroupCanvasPanel conversationId={conversationId} flat toolbar={<span className="px-2 text-xs font-medium text-muted-foreground">Canvas</span>} /></div>
    <div className="min-h-0 overflow-hidden"><SourcePanel flat toolbar={<span className="px-2 text-xs font-medium text-muted-foreground">资料</span>} /></div>
  </div>
}
