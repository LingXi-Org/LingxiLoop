import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { ws } from '@/api/client'
import { AvatarMini } from '@/components/Avatar'
import { IPlus, ITrash } from '@/components/icons'
import { createCanvasDraftSaveQueue, shouldSyncCanvasDraft, type CanvasDraftPatch } from '@/lib/canvasDraft'
import { useMe } from '@/stores/auth'
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

export function CanvasView() {
  const snapshot = useCanvas((state) => state.snapshot)
  const loading = useCanvas((state) => state.loading)
  const error = useCanvas((state) => state.error)
  const selectedId = useCanvas((state) => state.selectedFrameId)
  const load = useCanvas((state) => state.load)
  const selectFrame = useCanvas((state) => state.selectFrame)
  const createFrame = useCanvas((state) => state.createFrame)
  const setStatus = useCanvas((state) => state.setStatus)
  const stageRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState<Viewport>({ x: 80, y: 80, zoom: 1 })
  const [addOpen, setAddOpen] = useState(false)
  const [panning, setPanning] = useState(false)

  useEffect(() => {
    void ws.connect()
    void load()
  }, [load])

  useEffect(() => {
    const announce = () => void setStatus('viewing', useCanvas.getState().selectedFrameId).catch(() => undefined)
    announce()
    const timer = window.setInterval(announce, 30_000)
    return () => {
      window.clearInterval(timer)
      void setStatus('offline').catch(() => undefined)
    }
  }, [setStatus])

  useEffect(() => {
    if (selectedId) void setStatus('viewing', selectedId).catch(() => undefined)
  }, [selectedId, setStatus])

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
    const frames = snapshot?.frames ?? []
    if (!stage || frames.length === 0) {
      setViewport({ x: 80, y: 80, zoom: 1 })
      return
    }
    const minX = Math.min(...frames.map((frame) => frame.x))
    const minY = Math.min(...frames.map((frame) => frame.y))
    const maxX = Math.max(...frames.map((frame) => frame.x + frame.width))
    const maxY = Math.max(...frames.map((frame) => frame.y + frame.height))
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

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-[#f4f5f7]">
      <section className="relative min-w-0 flex-1 overflow-hidden">
        <CanvasHeader />
        <div
          ref={stageRef}
          className={`absolute inset-x-0 bottom-0 top-14 overflow-hidden ${panning ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={onStagePointerDown}
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
            {snapshot?.frames.map((frame) => (
              <FrameCard key={frame.id} frame={frame} selected={selectedId === frame.id} zoom={viewport.zoom} />
            ))}
          </div>

          {!loading && snapshot?.frames.length === 0 && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="rounded-2xl border border-dashed border-ink-200 bg-white/85 px-10 py-8 text-center shadow-sm backdrop-blur">
                <div className="text-base font-semibold text-ink">Shared Canvas</div>
                <p className="mt-1 max-w-sm text-sm text-ink-secondary">Humans and agents share frames here while every Agent OS execution environment stays isolated.</p>
                <p className="mt-3 text-xs text-ink-400">Use + Frame to add the first shared surface.</p>
              </div>
            </div>
          )}

          {error && <div className="absolute left-4 top-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 shadow">{error}</div>}

          <div className="absolute bottom-[calc(42%+1rem)] left-4 flex items-center gap-1 rounded-xl border border-hairline bg-white/95 p-1 shadow-lg backdrop-blur md:bottom-4">
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
          </div>
        </div>
      </section>
      <CanvasRail />
    </div>
  )
}

function CanvasHeader() {
  const snapshot = useCanvas((state) => state.snapshot)
  const byId = useParticipants((state) => state.byId)
  return (
    <header className="absolute inset-x-0 top-0 z-20 flex h-14 items-center justify-between border-b border-hairline bg-white/90 px-4 backdrop-blur">
      <div>
        <h1 className="text-sm font-semibold text-ink">{snapshot?.title ?? 'Shared Canvas'}</h1>
        <p className="text-[10px] uppercase tracking-[.14em] text-ink-400">Shared state · isolated execution</p>
      </div>
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
        {(snapshot?.presence.length ?? 0) === 0 && <span className="text-xs text-ink-400">Connecting presence…</span>}
      </div>
    </header>
  )
}

function FrameCard({ frame, selected, zoom }: { frame: CanvasFrame; selected: boolean; zoom: number }) {
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
      style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
      onPointerDown={(event) => { event.stopPropagation(); selectFrame(frame.id) }}
    >
      <header onPointerDown={beginMove} className="flex h-10 cursor-grab items-center gap-2 border-b border-hairline bg-[#fafbfc] px-3 active:cursor-grabbing">
        <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-500">{frame.type}</span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">{frame.title}</span>
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
      : <EmptyFrame label="Paste an image URL in the inspector" />
  }
  if (frame.type === 'document') {
    return (
      <div className="flex h-full flex-col justify-between p-5">
        <div><div className="text-xs font-semibold uppercase tracking-wider text-ink-400">Document reference</div><p className="mt-3 whitespace-pre-wrap text-sm text-ink-secondary">{frame.content || 'Add a document id, URL, or note in the inspector.'}</p></div>
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

function CanvasRail() {
  const snapshot = useCanvas((state) => state.snapshot)
  const selectedId = useCanvas((state) => state.selectedFrameId)
  const updateFrame = useCanvas((state) => state.updateFrame)
  const addComment = useCanvas((state) => state.addComment)
  const byId = useParticipants((state) => state.byId)
  const me = useMe()
  const frame = snapshot?.frames.find((item) => item.id === selectedId) ?? null
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [editorFocused, setEditorFocused] = useState(false)
  const [titleDirty, setTitleDirty] = useState(false)
  const [contentDirty, setContentDirty] = useState(false)
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({})
  const [comment, setComment] = useState('')
  const [tab, setTab] = useState<'inspect' | 'activity'>('inspect')
  const draftFrameIdRef = useRef<string | null>(null)
  const draftTitleRef = useRef('')
  const draftContentRef = useRef('')
  const updateFrameRef = useRef(updateFrame)
  updateFrameRef.current = updateFrame
  const saveQueueRef = useRef<ReturnType<typeof createCanvasDraftSaveQueue> | null>(null)
  if (!saveQueueRef.current) {
    saveQueueRef.current = createCanvasDraftSaveQueue({
      save: async (frameId, patch) => {
        await updateFrameRef.current(frameId, patch)
        setSaveErrors((current) => {
          if (!(frameId in current)) return current
          const next = { ...current }
          delete next[frameId]
          return next
        })
        if (draftFrameIdRef.current !== frameId) return
        if (patch.title !== undefined && draftTitleRef.current === patch.title) setTitleDirty(false)
        if (patch.content !== undefined && draftContentRef.current === patch.content) setContentDirty(false)
      },
      onError: (frameId) => {
        setSaveErrors((current) => ({ ...current, [frameId]: 'Autosave failed. Your draft is kept for retry.' }))
      },
    })
  }

  useEffect(() => {
    const nextFrameId = frame?.id ?? null
    if (!shouldSyncCanvasDraft({
      currentFrameId: draftFrameIdRef.current,
      nextFrameId,
      focused: editorFocused,
      dirty: titleDirty || contentDirty,
    })) return

    const nextTitle = frame?.title ?? ''
    const nextContent = frame?.content ?? ''
    draftFrameIdRef.current = nextFrameId
    draftTitleRef.current = nextTitle
    draftContentRef.current = nextContent
    setDraftTitle(nextTitle)
    setDraftContent(nextContent)
    setTitleDirty(false)
    setContentDirty(false)
  }, [contentDirty, editorFocused, frame?.id, frame?.revision, titleDirty])

  function scheduleDraftSave(patch: CanvasDraftPatch) {
    const frameId = draftFrameIdRef.current
    if (frameId) saveQueueRef.current?.schedule(frameId, patch)
  }

  function changeDraftTitle(value: string) {
    draftTitleRef.current = value
    setDraftTitle(value)
    setTitleDirty(true)
    scheduleDraftSave({ title: value })
  }

  function changeDraftContent(value: string) {
    draftContentRef.current = value
    setDraftContent(value)
    setContentDirty(true)
    scheduleDraftSave({ content: value })
  }

  function leaveEditor(event: React.FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return
    setEditorFocused(false)
  }

  const comments = useMemo(
    () => (snapshot?.comments ?? []).filter((item) => !item.frameId || item.frameId === selectedId),
    [snapshot?.comments, selectedId],
  )
  const saveError = frame ? saveErrors[frame.id] : undefined

  async function submitComment() {
    const body = comment.trim()
    if (!body) return
    setComment('')
    await addComment(body, selectedId)
  }

  return (
    <aside className="absolute inset-x-0 bottom-0 z-30 flex h-[42%] shrink-0 flex-col border-t border-hairline bg-white shadow-[0_-8px_30px_rgba(30,40,60,.12)] md:static md:h-full md:w-[320px] md:border-l md:border-t-0 md:shadow-none">
      <div className="grid h-14 grid-cols-2 border-b border-hairline p-1.5">
        <button type="button" onClick={() => setTab('inspect')} className={`rounded-lg text-xs font-semibold ${tab === 'inspect' ? 'bg-raised text-ink' : 'text-ink-400 hover:text-ink'}`}>Inspector</button>
        <button type="button" onClick={() => setTab('activity')} className={`rounded-lg text-xs font-semibold ${tab === 'activity' ? 'bg-raised text-ink' : 'text-ink-400 hover:text-ink'}`}>Activity</button>
      </div>
      {tab === 'inspect' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {frame ? (
              <div onFocusCapture={() => setEditorFocused(true)} onBlurCapture={leaveEditor}>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-ink-400">Title</label>
                <input value={draftTitle} onChange={(event) => changeDraftTitle(event.target.value)} className="mt-1.5 w-full rounded-lg border border-hairline bg-inset px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
                <label className="mt-4 block text-[10px] font-semibold uppercase tracking-wider text-ink-400">Content · {frame.type}</label>
                <textarea value={draftContent} onChange={(event) => changeDraftContent(event.target.value)} rows={12} className="mt-1.5 w-full resize-y rounded-lg border border-hairline bg-inset px-3 py-2 font-mono text-xs leading-5 text-ink outline-none focus:border-accent" placeholder={frame.type === 'image' ? 'https://…' : 'Frame content'} />
                <div className="mt-3 flex items-center justify-between text-[10px] text-ink-400"><span>{Math.round(frame.width)} × {Math.round(frame.height)}</span><span>revision {frame.revision}</span></div>
                {saveError && (
                  <div role="alert" className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                    <span>{saveError}</span>
                    <button type="button" onClick={() => saveQueueRef.current?.retry(frame.id)} className="shrink-0 font-semibold underline underline-offset-2">Retry</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl bg-raised p-4 text-sm text-ink-secondary">Select a frame to edit its title and content.</div>
            )}

            <div className="mt-6 border-t border-hairline pt-4">
              <h3 className="text-xs font-semibold text-ink">Comments</h3>
              <div className="mt-3 space-y-3">
                {comments.map((item) => {
                  const author = byId[item.authorId]
                  return (
                    <div key={item.id} className="flex gap-2.5">
                      {author ? <AvatarMini p={author} size={24} /> : <div className="grid size-6 shrink-0 place-items-center rounded-full bg-raised text-[9px]">{item.authorId.slice(0, 1).toUpperCase()}</div>}
                      <div className="min-w-0"><div className="text-[10px] font-semibold text-ink">{author?.name ?? (item.authorId === me ? 'You' : item.authorId)}</div><p className="mt-0.5 whitespace-pre-wrap text-xs leading-4 text-ink-secondary">{item.body}</p></div>
                    </div>
                  )
                })}
                {comments.length === 0 && <p className="text-xs text-ink-400">No comments yet.</p>}
              </div>
            </div>
          </div>
          <div className="border-t border-hairline p-3">
            <div className="flex gap-2">
              <input value={comment} onChange={(event) => setComment(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void submitComment() }} placeholder={frame ? 'Comment on this frame…' : 'Comment on canvas…'} className="min-w-0 flex-1 rounded-lg border border-hairline bg-inset px-3 py-2 text-xs outline-none focus:border-accent" />
              <button type="button" onClick={() => void submitComment()} className="rounded-lg bg-accent px-3 text-xs font-semibold text-white">Send</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            {snapshot?.activity.map((item) => {
              const actor = byId[item.actorId]
              return (
                <div key={item.id} className="relative pl-5 before:absolute before:left-[5px] before:top-2 before:size-2 before:rounded-full before:bg-accent/70 after:absolute after:bottom-[-18px] after:left-[8px] after:top-4 after:w-px after:bg-hairline last:after:hidden">
                  <p className="text-xs text-ink"><span className="font-semibold">{actor?.name ?? item.actorId}</span> {activityLabel(item.action)}</p>
                  <p className="mt-1 text-[10px] text-ink-400">{new Date(item.createdAt).toLocaleString()}</p>
                </div>
              )
            })}
            {(snapshot?.activity.length ?? 0) === 0 && <p className="text-xs text-ink-400">Canvas activity will appear here.</p>}
          </div>
        </div>
      )}
    </aside>
  )
}

function activityLabel(action: string): string {
  const labels: Record<string, string> = {
    'frame.created': 'created a frame',
    'frame.updated': 'updated a frame',
    'frame.content_appended': 'appended frame content',
    'frame.deleted': 'deleted a frame',
    'comment.created': 'left a comment',
  }
  return labels[action] ?? action
}
