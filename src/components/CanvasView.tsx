import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { ws } from '@/api/client'
import { AvatarMini } from '@/components/Avatar'
import { IPlus, ITrash } from '@/components/icons'
import { useCanvas } from '@/stores/canvas'
import { useParticipants } from '@/stores/participants'
import type { CanvasFrame, CanvasFrameType } from '@/types'

const MIN_ZOOM = 0.2
const MAX_ZOOM = 2.5
const FRAME_TYPES: Array<{ type: CanvasFrameType; label: string }> = [
  { type: 'markdown', label: 'Markdown' },
  { type: 'html', label: 'HTML' },
  { type: 'document', label: 'Document' },
  { type: 'image', label: 'Image' },
  { type: 'artifact', label: 'Artifact' },
]

type Viewport = { x: number; y: number; zoom: number }

export function CanvasView({ canvasId }: { canvasId?: string; embedded?: boolean } = {}) {
  const snapshot = useCanvas((state) => state.snapshot)
  const error = useCanvas((state) => state.error)
  const selectedId = useCanvas((state) => state.selectedFrameId)
  const activeCanvasId = useCanvas((state) => state.activeCanvasId)
  const workspaces = useCanvas((state) => state.workspaces)
  const load = useCanvas((state) => state.load)
  const loadWorkspaces = useCanvas((state) => state.loadWorkspaces)
  const selectFrame = useCanvas((state) => state.selectFrame)
  const createFrame = useCanvas((state) => state.createFrame)
  const setStatus = useCanvas((state) => state.setStatus)
  const stageRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState<Viewport>({ x: 80, y: 80, zoom: 1 })
  const [addOpen, setAddOpen] = useState(false)
  const [panning, setPanning] = useState(false)
  const cursorSentAt = useRef(0)
  const fittedCanvasId = useRef<string | null>(null)

  useEffect(() => {
    void ws.connect()
    void (async () => {
      await loadWorkspaces()
      const target = canvasId ?? useCanvas.getState().activeCanvasId ?? useCanvas.getState().workspaces[0]?.id
      if (target) await load(target)
    })()
  }, [canvasId, load, loadWorkspaces])

  useEffect(() => {
    if (!activeCanvasId) return
    const announce = () => void setStatus('viewing', useCanvas.getState().selectedFrameId).catch(() => undefined)
    announce()
    const timer = window.setInterval(announce, 30_000)
    return () => {
      window.clearInterval(timer)
      void setStatus('offline').catch(() => undefined)
    }
  }, [activeCanvasId, setStatus])

  useEffect(() => {
    if (selectedId && activeCanvasId) void setStatus('viewing', selectedId).catch(() => undefined)
  }, [activeCanvasId, selectedId, setStatus])

  useEffect(() => {
    if (!snapshot || fittedCanvasId.current === snapshot.id) return
    fittedCanvasId.current = snapshot.id
    const frame = window.requestAnimationFrame(() => fit())
    return () => window.cancelAnimationFrame(frame)
  }, [snapshot?.id])

  function worldPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return { x: 80, y: 80 }
    return {
      x: (clientX - rect.left - viewport.x) / viewport.zoom,
      y: (clientY - rect.top - viewport.y) / viewport.zoom,
    }
  }

  function createAtCenter(type: CanvasFrameType) {
    const rect = stageRef.current?.getBoundingClientRect()
    const at = rect
      ? worldPoint(rect.left + rect.width / 2 - 210, rect.top + rect.height / 2 - 150)
      : { x: 80, y: 80 }
    setAddOpen(false)
    void createFrame(type, at)
  }

  function fit() {
    const stage = stageRef.current
    const surfaces = [
      ...(snapshot?.frames ?? []).map((frame) => ({ x: frame.x, y: frame.y, width: frame.width, height: frame.height })),
      ...(snapshot?.assignments ?? []).map((assignment) => assignment.workArea),
    ]
    if (!stage || surfaces.length === 0) {
      setViewport({ x: 80, y: 80, zoom: 1 })
      return
    }
    const minX = Math.min(...surfaces.map((surface) => surface.x))
    const minY = Math.min(...surfaces.map((surface) => surface.y))
    const maxX = Math.max(...surfaces.map((surface) => surface.x + surface.width))
    const maxY = Math.max(...surfaces.map((surface) => surface.y + surface.height))
    const width = Math.max(1, maxX - minX)
    const height = Math.max(1, maxY - minY)
    const zoom = Math.min(1.25, Math.max(MIN_ZOOM, Math.min((stage.clientWidth - 140) / width, (stage.clientHeight - 140) / height)))
    setViewport({
      x: (stage.clientWidth - width * zoom) / 2 - minX * zoom,
      y: (stage.clientHeight - height * zoom) / 2 - minY * zoom,
      zoom,
    })
  }

  function zoomBy(factor: number, clientX?: number, clientY?: number) {
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const pivotX = (clientX ?? rect.left + rect.width / 2) - rect.left
    const pivotY = (clientY ?? rect.top + rect.height / 2) - rect.top
    setViewport((current) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * factor))
      const scale = zoom / current.zoom
      return {
        x: pivotX - (pivotX - current.x) * scale,
        y: pivotY - (pivotY - current.y) * scale,
        zoom,
      }
    })
  }

  function onWheel(event: React.WheelEvent) {
    if (!event.ctrlKey && !event.metaKey && (event.target as HTMLElement).closest('[data-canvas-frame]')) return
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) {
      zoomBy(Math.exp(-Math.max(-40, Math.min(40, event.deltaY)) * 0.01), event.clientX, event.clientY)
    } else {
      setViewport((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }))
    }
  }

  function onStagePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget && !(event.target as HTMLElement).dataset.canvasWorld) return
    if (event.button !== 0 && event.button !== 1) return
    selectFrame(null)
    setPanning(true)
    let lastX = event.clientX
    let lastY = event.clientY
    const move = (next: PointerEvent) => {
      const dx = next.clientX - lastX
      const dy = next.clientY - lastY
      lastX = next.clientX
      lastY = next.clientY
      setViewport((current) => ({ ...current, x: current.x + dx, y: current.y + dy }))
    }
    const up = () => {
      setPanning(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function onStagePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!activeCanvasId) return
    if (Date.now() - cursorSentAt.current < 120) return
    cursorSentAt.current = Date.now()
    void setStatus('viewing', selectedId, worldPoint(event.clientX, event.clientY)).catch(() => undefined)
  }

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-[#f4f5f7]">
      <section className="relative min-w-0 flex-1 overflow-hidden">
        <CanvasHeader />
        <div
          ref={stageRef}
          className={`absolute inset-x-0 bottom-0 overflow-hidden ${snapshot || workspaces.length > 0 ? 'top-14' : 'top-0'} ${panning ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onWheel={onWheel}
          style={{
            backgroundColor: '#f6f7f9',
            backgroundImage: 'radial-gradient(circle, rgba(87, 96, 118, .2) 1px, transparent 1px)',
            backgroundPosition: `${viewport.x}px ${viewport.y}px`,
            backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
          }}
        >
          <div
            data-canvas-world="true"
            className="absolute left-0 top-0 h-full w-full origin-top-left"
            style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
          >
            {snapshot?.assignments.map((assignment) => {
              const hasFrame = snapshot.frames.some((frame) => frame.createdBy === assignment.agentId)
              const liveStatus = snapshot.presence.find((presence) => presence.participantId === assignment.agentId)?.status ?? assignment.status
              return <div key={assignment.id} className="pointer-events-none absolute rounded-2xl border-2 border-dashed"
                style={{ left: assignment.workArea.x, top: assignment.workArea.y, width: assignment.workArea.width, height: assignment.workArea.height, borderColor: assignment.color, backgroundColor: `color-mix(in srgb, ${assignment.color} 5%, transparent)` }}>
                <div className="absolute left-3 top-3 origin-top-left rounded-full px-2.5 py-1 text-[11px] font-semibold text-white shadow" style={{ backgroundColor: assignment.color, transform: `scale(${1 / viewport.zoom})` }}>
                  {byAgentName(assignment.agentId)} · {liveStatus}
                </div>
                {!hasFrame && <div className="absolute inset-10 top-20 grid place-items-center rounded-xl border border-dashed bg-white/45 text-center">
                  <div><div className="text-xs font-semibold" style={{ color: assignment.color }}>{assignment.assignment}</div><div className="mt-1 text-[10px] text-ink-400">{assignment.status === 'blocked' ? `等待 ${assignment.dependsOnAgentIds.map(byAgentName).join('、')}` : liveStatus}</div></div>
                </div>}
              </div>
            })}
            {snapshot?.frames.map((frame) => (
              <FrameCard key={frame.id} frame={frame} selected={selectedId === frame.id} zoom={viewport.zoom}
                editorColor={snapshot.assignments.find((assignment) => assignment.agentId === frame.updatedBy)?.color}
                editorName={snapshot.assignments.some((assignment) => assignment.agentId === frame.updatedBy) ? byAgentName(frame.updatedBy) : undefined} />
            ))}
            {snapshot?.assignments.filter((assignment) => assignment.cursor).map((assignment) => <div key={`${assignment.id}-cursor`} className="pointer-events-none absolute z-50 origin-top-left transition-[left,top] duration-300 ease-out" style={{ left: assignment.cursor!.x, top: assignment.cursor!.y, transform: `scale(${1 / viewport.zoom})` }}>
              <svg width="20" height="24" viewBox="0 0 20 24" fill="none"><path d="M2 2l15 10-7 1-3 7L2 2z" fill={assignment.color} stroke="white" strokeWidth="1.5" /></svg>
              <span className="absolute left-4 top-4 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-semibold text-white" style={{ backgroundColor: assignment.color }}>{byAgentName(assignment.agentId)}</span>
            </div>)}
          </div>

          {error && <div className="absolute left-4 top-16 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 shadow">{error}</div>}

          {snapshot && <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded-xl border border-hairline bg-white/95 p-1 shadow-lg backdrop-blur">
            <div className="relative">
              <button type="button" onClick={() => setAddOpen((open) => !open)} className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink hover:bg-raised">
                <IPlus className="size-4" /> Frame
              </button>
              {addOpen && (
                <div className="absolute bottom-11 left-0 w-44 rounded-xl border border-hairline bg-white p-1.5 shadow-xl">
                  {FRAME_TYPES.map(({ type, label }) => (
                    <button key={type} type="button" onClick={() => createAtCenter(type)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-raised">
                      {label}<span className="text-[10px] uppercase text-ink-400">{type}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="mx-1 h-5 w-px bg-hairline" />
            <button type="button" onClick={() => zoomBy(1 / 1.2)} className="size-9 rounded-lg text-lg text-ink-secondary hover:bg-raised">−</button>
            <span className="w-12 text-center text-xs tabular-nums text-ink-secondary">{Math.round(viewport.zoom * 100)}%</span>
            <button type="button" onClick={() => zoomBy(1.2)} className="size-9 rounded-lg text-lg text-ink-secondary hover:bg-raised">+</button>
            <button type="button" onClick={fit} className="h-9 rounded-lg px-3 text-xs font-medium text-ink-secondary hover:bg-raised">Fit</button>
          </div>}
        </div>
      </section>
    </div>
  )
}

function byAgentName(agentId: string): string {
  return useParticipants.getState().byId[agentId]?.name ?? agentId
}

function CanvasHeader() {
  const snapshot = useCanvas((state) => state.snapshot)
  const workspaces = useCanvas((state) => state.workspaces)
  const load = useCanvas((state) => state.load)
  const byId = useParticipants((state) => state.byId)
  if (!snapshot && workspaces.length === 0) return null
  return (
    <header className="absolute inset-x-0 top-0 z-20 flex h-14 items-center justify-between border-b border-hairline bg-white/90 px-4 backdrop-blur">
      <select aria-label="Canvas workspace history" value={snapshot?.id ?? ''} onChange={(event) => void load(event.target.value)} className="max-w-[260px] bg-transparent text-sm font-semibold text-ink outline-none">
        {snapshot && !workspaces.some((item) => item.id === snapshot.id) && <option value={snapshot.id}>{snapshot.title}</option>}
        {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.status === 'active' ? '● ' : ''}{workspace.title}</option>)}
      </select>
      <div className="flex items-center -space-x-1.5">
        {snapshot?.presence.slice(0, 8).map((presence) => {
          const participant = byId[presence.participantId]
          return participant ? (
            <div key={presence.participantId} title={`${participant.name} · ${presence.status}`} className="relative rounded-full ring-2 ring-white">
              <AvatarMini p={participant} size={28} />
              <span className="absolute bottom-0 right-0 size-2 rounded-full border border-white bg-emerald-500" />
            </div>
          ) : (
            <div key={presence.participantId} title={`${presence.participantId} · ${presence.status}`} className="grid size-7 place-items-center rounded-full bg-accent text-[10px] font-bold text-white ring-2 ring-white">
              {presence.participantId.slice(0, 1).toUpperCase()}
            </div>
          )
        })}
      </div>
    </header>
  )
}

function FrameCard({ frame, selected, zoom, editorColor, editorName }: { frame: CanvasFrame; selected: boolean; zoom: number; editorColor?: string; editorName?: string }) {
  const selectFrame = useCanvas((state) => state.selectFrame)
  const patchLocalFrame = useCanvas((state) => state.patchLocalFrame)
  const updateFrame = useCanvas((state) => state.updateFrame)
  const deleteFrame = useCanvas((state) => state.deleteFrame)

  function beginMove(event: React.PointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    selectFrame(frame.id)
    const start = { clientX: event.clientX, clientY: event.clientY, x: frame.x, y: frame.y }
    let latest = { x: frame.x, y: frame.y }
    const move = (next: PointerEvent) => {
      latest = {
        x: Math.round(start.x + (next.clientX - start.clientX) / zoom),
        y: Math.round(start.y + (next.clientY - start.clientY) / zoom),
      }
      patchLocalFrame(frame.id, latest)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      void updateFrame(frame.id, latest).catch(() => undefined)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function beginResize(event: React.PointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    selectFrame(frame.id)
    const start = { clientX: event.clientX, clientY: event.clientY, width: frame.width, height: frame.height }
    let latest = { width: frame.width, height: frame.height }
    const move = (next: PointerEvent) => {
      latest = {
        width: Math.max(180, Math.round(start.width + (next.clientX - start.clientX) / zoom)),
        height: Math.max(140, Math.round(start.height + (next.clientY - start.clientY) / zoom)),
      }
      patchLocalFrame(frame.id, latest)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      void updateFrame(frame.id, latest).catch(() => undefined)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <article
      data-canvas-frame="true"
      className={`absolute overflow-hidden rounded-xl border bg-white shadow-md transition-[box-shadow,border-color] ${selected ? 'border-accent shadow-[0_0_0_2px_rgba(80,110,255,.18),0_12px_35px_rgba(25,35,60,.16)]' : 'border-black/10 hover:shadow-lg'}`}
      style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height, ...(editorColor ? { borderColor: editorColor, boxShadow: `0 0 0 2px color-mix(in srgb, ${editorColor} 16%, transparent), 0 12px 35px rgba(25,35,60,.16)` } : {}) }}
      onPointerDown={(event) => { event.stopPropagation(); selectFrame(frame.id) }}
    >
      <header onPointerDown={beginMove} className="flex h-10 cursor-grab items-center gap-2 border-b border-hairline bg-[#fafbfc] px-3 active:cursor-grabbing">
        <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-500">{frame.type}</span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">{frame.title}</span>
        {editorName && <span className="max-w-24 truncate rounded-full px-2 py-0.5 text-[9px] font-semibold text-white" style={{ backgroundColor: editorColor }}>{editorName}</span>}
        <span className="text-[9px] tabular-nums text-ink-400">v{frame.revision}</span>
        <button type="button" aria-label="Delete frame" onPointerDown={(event) => event.stopPropagation()} onClick={() => void deleteFrame(frame.id)} className="grid size-7 place-items-center rounded text-ink-400 hover:bg-red-50 hover:text-red-600">
          <ITrash className="size-3.5" />
        </button>
      </header>
      <div className="h-[calc(100%-40px)] overflow-auto bg-white">
        <FrameContent frame={frame} />
      </div>
      <button type="button" aria-label="Resize frame" onPointerDown={beginResize} className="absolute bottom-0 right-0 size-5 cursor-nwse-resize rounded-tl bg-accent/10 before:absolute before:bottom-1 before:right-1 before:size-2 before:border-b before:border-r before:border-accent" />
    </article>
  )
}

function FrameContent({ frame }: { frame: CanvasFrame }) {
  if (frame.type === 'html') {
    return <iframe title={frame.title} sandbox="" srcDoc={frame.content} className="h-full min-h-40 w-full border-0 bg-white" />
  }
  if (frame.type === 'markdown') {
    return (
      <div className="prose prose-sm max-w-none p-4 text-ink">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{frame.content}</ReactMarkdown>
      </div>
    )
  }
  if (frame.type === 'image') {
    return frame.content
      ? <img src={frame.content} alt={String(frame.data.alt ?? frame.title)} className="h-full w-full object-contain" />
      : <EmptyFrame label="Waiting for image content" />
  }
  if (frame.type === 'document') {
    return (
      <div className="flex h-full flex-col justify-between p-5">
        <div><div className="text-xs font-semibold uppercase tracking-wider text-ink-400">Document reference</div><p className="mt-3 whitespace-pre-wrap text-sm text-ink-secondary">{frame.content || 'Waiting for document content.'}</p></div>
        {typeof frame.data.documentId === 'string' && <span className="text-xs text-accent">Document · {frame.data.documentId}</span>}
      </div>
    )
  }
  return (
    <div className="p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">Artifact</div>
      <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-xs text-ink-secondary">{frame.content || JSON.stringify(frame.data, null, 2) || 'No artifact payload yet.'}</pre>
    </div>
  )
}

function EmptyFrame({ label }: { label: string }) {
  return <div className="grid h-full place-items-center p-6 text-center text-xs text-ink-400">{label}</div>
}
