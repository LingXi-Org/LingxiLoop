import { useLayoutEffect, useRef, useState } from 'react'
import { AvatarMini } from '@/components/Avatar'
import { IBack } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useParticipants } from '@/features/agents/state'
import type { CanvasAgentAssignment, CanvasSnapshot } from '../contracts'
import { canvasStatusLabel, isCanvasAssignmentActive } from '../lib/collaboration'
import { useCanvas } from '../state'
import { localizeCanvasStatus } from './canvasLabels'

const EXECUTION_ROLE_LABELS: Record<CanvasAgentAssignment['executionRole'], string> = {
  specialist: '执行',
  verifier: '核验',
}

export function CanvasHeader({ onBack, onFocusFrame }: {
  onBack?: () => void
  onFocusFrame: (frameId: string) => void
}) {
  return <header data-canvas-header className="canvas-header canvas-main-header absolute inset-x-0 top-0 z-30 flex items-center gap-3 px-3">
    {onBack && <Button type="button" variant="outline" size="icon-sm" onClick={onBack} aria-label="返回对话" className="rounded-full"><IBack className="size-4" /></Button>}
    <CanvasTimeline onFocusFrame={onFocusFrame} />
  </header>
}

function CanvasTimeline({ onFocusFrame }: { onFocusFrame: (frameId: string) => void }) {
  const snapshot = useCanvas((state) => state.snapshot)
  const loading = useCanvas((state) => state.loading)
  const byId = useParticipants((state) => state.byId)
  const timelineRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [scrollState, setScrollState] = useState({ overflowing: false, left: false, right: false })

  useLayoutEffect(() => {
    const timeline = timelineRef.current
    const track = trackRef.current
    if (!timeline || !track) return
    let animationFrame = 0
    const update = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(() => {
        const overflowing = timeline.scrollWidth > timeline.clientWidth + 2
        const left = overflowing && timeline.scrollLeft > 2
        const right = overflowing && timeline.scrollLeft + timeline.clientWidth < timeline.scrollWidth - 2
        setScrollState((current) => current.overflowing === overflowing && current.left === left && current.right === right ? current : { overflowing, left, right })
      })
    }
    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(timeline)
    observer?.observe(track)
    timeline.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      observer?.disconnect()
      timeline.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [snapshot?.assignments.length])

  if (!snapshot) return <div data-canvas-timeline data-canvas-timeline-state="loading" aria-busy={loading} aria-label="正在加载工作时间线" className="canvas-timeline-shell flex min-w-0 flex-1 items-center gap-5 overflow-hidden rounded-xl border bg-card px-4 shadow-sm">
    {[0, 1, 2].map((item) => <div key={item} className="flex min-w-32 items-center gap-2">
      <Skeleton className="size-7 shrink-0 rounded-full" />
      <span className="grid flex-1 gap-1.5"><Skeleton className="h-2.5 w-20" /><Skeleton className="h-2 w-28" /></span>
    </div>)}
  </div>
  const scrollTimeline = (direction: -1 | 1) => {
    const timeline = timelineRef.current
    if (!timeline) return
    timeline.scrollBy({ left: direction * Math.max(180, timeline.clientWidth * 0.72), behavior: 'smooth' })
  }
  if (snapshot.assignments.length === 0) return <div data-canvas-timeline data-canvas-timeline-state="empty" className="canvas-timeline-shell flex min-w-0 flex-1 items-center justify-center rounded-xl border bg-card px-4 text-muted-foreground shadow-sm">
    <span className="size-1.5 rounded-full bg-muted-foreground/40" aria-hidden />
    <span className="ms-2 text-xs font-medium">暂无工作任务</span>
    <span className="ms-2 hidden text-xs text-muted-foreground/70 sm:inline">智能助教接到任务后会在这里显示进度</span>
  </div>
  return <div data-canvas-timeline className="canvas-timeline-shell relative min-w-0 flex-1 rounded-xl border bg-card shadow-sm">
    {scrollState.left && <Button type="button" variant="outline" size="icon" aria-label="向左移动工作时间轴" onClick={() => scrollTimeline(-1)} className="canvas-timeline-scroll-button is-left"><svg viewBox="0 0 20 20" aria-hidden><path d="m12.5 5-5 5 5 5" /></svg></Button>}
    <div ref={timelineRef} className={`canvas-work-timeline min-w-0 overflow-x-auto py-2 ${scrollState.overflowing ? 'px-8' : 'px-2'}`} onWheel={(event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      event.currentTarget.scrollLeft += event.deltaY
    }}><div ref={trackRef} className="canvas-work-timeline-track flex min-w-max items-center gap-3">
      {snapshot.assignments.map((assignment) => {
        const participant = byId[assignment.agentId]
        const activeFrameId = snapshot.frames.some((frame) => frame.id === assignment.activeFrameId && frame.type !== 'artifact') ? assignment.activeFrameId : null
        const progress = latestAssignmentProgress(snapshot, assignment)
        return <Button key={assignment.id} type="button" variant="ghost" disabled={!activeFrameId} onClick={() => activeFrameId && onFocusFrame(activeFrameId)} className="canvas-timeline-item group relative flex max-w-52 items-center gap-2 rounded-lg border border-transparent px-3 text-left hover:border-border disabled:cursor-default">
          <span className="canvas-timeline-node relative z-10 grid size-7 shrink-0 place-items-center">{participant ? <AvatarMini p={participant} size={26} statusOverride={assignment.status === 'blocked' || assignment.status === 'waiting' ? 'thinking' : isCanvasAssignmentActive(assignment.status) ? 'working' : 'avail'} /> : <span className="text-[9px] font-bold" style={{ color: assignment.color }}>助</span>}</span>
          <span className="min-w-0"><span className="flex items-center gap-1 truncate text-[10px] font-semibold" style={{ color: assignment.color }}>{participant?.name ?? '智能助教'}<span className="canvas-timeline-role bg-raised px-1 py-0.5 text-[7px] text-ink-secondary">{EXECUTION_ROLE_LABELS[assignment.executionRole]}</span></span><span className="block truncate text-[8px] text-ink-secondary" title={progress}>{progress}{snapshot.reports.some((report) => report.assignmentId === assignment.id) ? ' · 已提交报告' : ''}</span></span>
        </Button>
      })}
    </div></div>
    {scrollState.right && <Button type="button" variant="outline" size="icon" aria-label="向右移动工作时间轴" onClick={() => scrollTimeline(1)} className="canvas-timeline-scroll-button is-right"><svg viewBox="0 0 20 20" aria-hidden><path d="m7.5 5 5 5-5 5" /></svg></Button>}
  </div>
}

function latestAssignmentProgress(snapshot: CanvasSnapshot, assignment: CanvasAgentAssignment): string {
  const presence = snapshot.presence
    .filter((item) => item.participantId === assignment.agentId && item.status !== 'offline')
    .sort((left, right) => Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt))[0]
  if (presence?.status && !['viewing', '查看画布'].includes(presence.status)) return localizeCanvasStatus(presence.status)
  const activity = snapshot.activity
    .filter((item) => item.actorId === assignment.agentId)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0]
  if (activity) {
    const status = typeof activity.detail.status === 'string' ? activity.detail.status : null
    if (status) return localizeCanvasStatus(status)
    const frame = activity.frameId ? snapshot.frames.find((item) => item.id === activity.frameId) : null
    if (activity.action === 'frame_updated') return `已更新 ${String(activity.detail.title ?? frame?.title ?? '卡片')}`
    if (activity.action === 'frame_created') return `已新建 ${frame?.title ?? '卡片'}`
    if (activity.action === 'comment_created') return '已收到新的画布反馈'
    if (activity.action === 'handoff') return `已移交给 ${String(activity.detail.toAgentName ?? '另一位智能助教')}`
  }
  return `${localizeCanvasStatus(canvasStatusLabel(assignment.status))} · ${assignment.assignment}`
}
