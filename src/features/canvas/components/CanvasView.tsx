import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { ws } from '@/api/core/realtime'
import { AvatarMini } from '@/components/Avatar'
import { IAt, IPlus, ISend, ITrash } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useParticipants } from '@/features/agents/state'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { userFacingError } from '@/lib/userFacingError'
import type { CanvasAgentAssignment, CanvasFrame, CanvasFrameType } from '../contracts'
import { canvasStatusLabel, isCanvasAssignmentActive } from '../lib/collaboration'
import { useCanvas } from '../state'
import { CanvasFrameContent } from './CanvasFrameContent'
import { CanvasHeader } from './CanvasHeader'
import { localizeCanvasStatus as localizeStatus } from './canvasLabels'
import '../canvas.css'

const MIN_ZOOM = 0.2
const MAX_ZOOM = 2.5
const FRAME_TYPES: Array<{ type: CanvasFrameType; label: string; detail: string }> = [
  { type: 'markdown', label: '文本卡片', detail: '标题与列表' },
  { type: 'html', label: '网页卡片', detail: '可视网页内容' },
  { type: 'document', label: '文档卡片', detail: '引用文档' },
  { type: 'image', label: '图片卡片', detail: '图片链接' },
]

const TYPE_LABELS: Record<CanvasFrameType, string> = {
  markdown: '文本', html: '网页', document: '文档', image: '图片', artifact: '成果',
}
const EDITABLE_FRAME_TYPES = new Set<CanvasFrameType>(['markdown', 'document'])

type Viewport = { x: number; y: number; zoom: number }
type CanvasMenu = { worldX: number; worldY: number }
type FrameMenu = { frameId: string }
type GesturePoint = { x: number; y: number; pointerType: string }
type PinchGesture = { distance: number; zoom: number; worldX: number; worldY: number }

export function CanvasView({ canvasId, onBack }: { canvasId?: string; onBack?: () => void } = {}) {
  const snapshot = useCanvas((state) => state.snapshot)
  const error = useCanvas((state) => state.error)
  const selectedId = useCanvas((state) => state.selectedFrameId)
  const activeCanvasId = useCanvas((state) => state.activeCanvasId)
  const load = useCanvas((state) => state.load)
  const loadWorkspaces = useCanvas((state) => state.loadWorkspaces)
  const selectFrame = useCanvas((state) => state.selectFrame)
  const createFrame = useCanvas((state) => state.createFrame)
  const setStatus = useCanvas((state) => state.setStatus)
  const stageRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState<Viewport>({ x: 80, y: 80, zoom: 1 })
  const [panning, setPanning] = useState(false)
  const [menu, setMenu] = useState<CanvasMenu | null>(null)
  const [frameMenu, setFrameMenu] = useState<FrameMenu | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [feedbackFrameId, setFeedbackFrameId] = useState<string | null>(null)
  const cursorSentAt = useRef(0)
  const fittedCanvasId = useRef<string | null>(null)
  const gesturePoints = useRef(new Map<number, GesturePoint>())
  const pinchGesture = useRef<PinchGesture | null>(null)
  const gestureTravel = useRef(0)
  const gestureMoved = useRef(false)
  const visibleFrames = useMemo(() => snapshot?.frames.filter((frame) => frame.type !== 'artifact') ?? [], [snapshot?.frames])

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
    const announce = () => void setStatus('查看画布', useCanvas.getState().selectedFrameId).catch(() => undefined)
    announce()
    const timer = window.setInterval(announce, 30_000)
    return () => {
      window.clearInterval(timer)
      void setStatus('offline').catch(() => undefined)
    }
  }, [activeCanvasId, setStatus])

  useEffect(() => {
    if (selectedId && activeCanvasId) void setStatus('查看卡片', selectedId).catch(() => undefined)
  }, [activeCanvasId, selectedId, setStatus])

  useEffect(() => {
    if (!snapshot || fittedCanvasId.current === snapshot.id) return
    fittedCanvasId.current = snapshot.id
    const frame = window.requestAnimationFrame(() => fitInitial())
    return () => window.cancelAnimationFrame(frame)
  }, [snapshot?.id])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !snapshot || typeof ResizeObserver === 'undefined') return
    let frame = 0
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => fitInitial())
    })
    observer.observe(stage)
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [snapshot?.id])

  function worldPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return { x: 80, y: 80 }
    return { x: (clientX - rect.left - viewport.x) / viewport.zoom, y: (clientY - rect.top - viewport.y) / viewport.zoom }
  }

  function createAt(type: CanvasFrameType, at: { x: number; y: number }) {
    setMenu(null)
    void createFrame(type, at)
  }

  function fit() {
    const stage = stageRef.current
    const surfaces = visibleFrames
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
    const zoom = Math.min(1.25, Math.max(MIN_ZOOM, Math.min((stage.clientWidth - 120) / width, (stage.clientHeight - 120) / height)))
    setViewport({ x: (stage.clientWidth - width * zoom) / 2 - minX * zoom, y: (stage.clientHeight - height * zoom) / 2 - minY * zoom, zoom })
  }

  function fitInitial() {
    const stage = stageRef.current
    if (stage && stage.clientWidth < 640) {
      const activeFrameId = snapshot?.assignments.find((assignment) => visibleFrames.some((frame) => frame.id === assignment.activeFrameId))?.activeFrameId
      const frameId = activeFrameId ?? visibleFrames[0]?.id
      if (frameId) {
        focusFrame(frameId)
        return
      }
    }
    fit()
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
      return { x: pivotX - (pivotX - current.x) * scale, y: pivotY - (pivotY - current.y) * scale, zoom }
    })
  }

  function focusFrame(frameId: string) {
    const frame = visibleFrames.find((item) => item.id === frameId)
    const stage = stageRef.current
    if (!frame || !stage) return
    const zoom = Math.min(1.2, Math.max(MIN_ZOOM, Math.min((stage.clientWidth - 100) / frame.width, (stage.clientHeight - 100) / frame.height)))
    setViewport({ x: (stage.clientWidth - frame.width * zoom) / 2 - frame.x * zoom, y: (stage.clientHeight - frame.height * zoom) / 2 - frame.y * zoom, zoom })
    selectFrame(frameId)
  }

  function onWheel(event: React.WheelEvent) {
    event.preventDefault()
    setMenu(null)
    const delta = event.deltaY || event.deltaX
    zoomBy(Math.exp(-Math.max(-120, Math.min(120, delta)) * 0.002), event.clientX, event.clientY)
  }

  function onStagePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (target.closest('[role="menu"], .canvas-inline-editor')) return
    setMenu(null)
    setFrameMenu(null)
    const blankSurface = event.target === event.currentTarget || Boolean(target.dataset.canvasWorld)
    const touchSurface = event.pointerType === 'touch' && !target.closest('button, input, textarea, [role="menu"]')
    if (!blankSurface && !touchSurface) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (blankSurface && document.activeElement instanceof HTMLElement) document.activeElement.blur()
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const points = gesturePoints.current
    if (points.size === 0) {
      gestureTravel.current = 0
      gestureMoved.current = false
    }
    points.set(event.pointerId, { x: event.clientX, y: event.clientY, pointerType: event.pointerType })
    if (points.size === 1) selectFrame(null)
    setPanning(true)
    if (points.size >= 2) {
      const [first, second] = [...points.values()]
      const stage = stageRef.current
      if (!first || !second || !stage) return
      const rect = stage.getBoundingClientRect()
      const centerX = (first.x + second.x) / 2 - rect.left
      const centerY = (first.y + second.y) / 2 - rect.top
      pinchGesture.current = {
        distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
        zoom: viewport.zoom,
        worldX: (centerX - viewport.x) / viewport.zoom,
        worldY: (centerY - viewport.y) / viewport.zoom,
      }
    }
  }

  function onStagePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    gesturePoints.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    pinchGesture.current = null
    if (gesturePoints.current.size === 0) {
      setPanning(false)
      window.setTimeout(() => { gestureMoved.current = false }, 0)
    }
  }

  function onStageContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    const stage = stageRef.current
    if (!stage) return
    const frameElement = (event.target as HTMLElement).closest<HTMLElement>('[data-canvas-frame]')
    if (frameElement?.dataset.canvasFrame) {
      setMenu(null)
      setFrameMenu({ frameId: frameElement.dataset.canvasFrame })
      return
    }
    setFrameMenu(null)
    const world = worldPoint(event.clientX, event.clientY)
    setMenu({
      worldX: world.x,
      worldY: world.y,
    })
  }

  function onStagePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const points = gesturePoints.current
    const previous = points.get(event.pointerId)
    if (previous) {
      event.preventDefault()
      const next = { x: event.clientX, y: event.clientY, pointerType: event.pointerType }
      gestureTravel.current += Math.abs(next.x - previous.x) + Math.abs(next.y - previous.y)
      if (gestureTravel.current > 5) gestureMoved.current = true
      points.set(event.pointerId, next)
      if (points.size >= 2) {
        const [first, second] = [...points.values()]
        const pinch = pinchGesture.current
        const stage = stageRef.current
        if (first && second && pinch && stage) {
          const rect = stage.getBoundingClientRect()
          const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y))
          const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinch.zoom * (distance / pinch.distance)))
          const centerX = (first.x + second.x) / 2 - rect.left
          const centerY = (first.y + second.y) / 2 - rect.top
          setViewport({ x: centerX - pinch.worldX * zoom, y: centerY - pinch.worldY * zoom, zoom })
        }
      } else {
        setViewport((current) => ({ ...current, x: current.x + next.x - previous.x, y: current.y + next.y - previous.y }))
      }
    }
    if (!activeCanvasId || Date.now() - cursorSentAt.current < 120) return
    cursorSentAt.current = Date.now()
    void setStatus('查看画布', selectedId, worldPoint(event.clientX, event.clientY)).catch(() => undefined)
  }

  const feedbackFrame = visibleFrames.find((frame) => frame.id === feedbackFrameId) ?? null

  return <div data-canvas-ui="root" className="canvas-shell relative h-full min-h-0 overflow-hidden">
    <CanvasHeader onBack={onBack} onFocusFrame={focusFrame} />
    <ContextMenu onOpenChange={(open) => { if (!open) { setMenu(null); setFrameMenu(null) } }}>
    <ContextMenuTrigger asChild>
    <div
      ref={stageRef}
      data-canvas-stage
      className={`canvas-stage canvas-main-stage absolute inset-x-0 bottom-0 overflow-hidden ${panning ? 'cursor-grabbing' : 'cursor-grab'}`}
      onPointerDownCapture={onStagePointerDown}
      onPointerMove={onStagePointerMove}
      onPointerUp={onStagePointerEnd}
      onPointerCancel={onStagePointerEnd}
      onContextMenu={onStageContextMenu}
      onWheel={onWheel}
      onDragStart={(event) => event.preventDefault()}
      style={{ backgroundPosition: `${viewport.x}px ${viewport.y}px`, backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px` }}
    >
      <div data-canvas-world="true" className="absolute left-0 top-0 h-full w-full origin-top-left" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
        {snapshot && visibleFrames.map((frame) => {
          const assignment = assignmentForFrame(frame, snapshot.assignments)
          const livePresence = assignment ? snapshot.presence.find((presence) => presence.participantId === assignment.agentId && presence.frameId === frame.id && presence.status !== 'offline') : undefined
          return <FrameCard key={frame.id} frame={frame} assignment={assignment} status={livePresence?.status} selected={selectedId === frame.id} zoom={viewport.zoom} allowActivation={() => !gestureMoved.current} />
        })}
      </div>
      {snapshot && visibleFrames.length === 0 && <div className="pointer-events-none fixed inset-0 grid place-items-center"><div data-canvas-empty className="canvas-empty-state px-5 py-4 text-center" style={{ transform: `scale(${viewport.zoom})` }}><div className="text-sm font-semibold text-ink">画布还没有卡片</div><div className="mt-1 text-xs text-ink-secondary">在空白处单击右键，选择“新增”或“对话”。</div></div></div>}
      {error && <div className="canvas-error-state absolute left-4 top-4 px-3 py-2 text-xs">{error}</div>}
    </div>
    </ContextMenuTrigger>
    <ContextMenuContent aria-label={frameMenu && snapshot ? `${snapshot.frames.find((frame) => frame.id === frameMenu.frameId)?.title ?? ''}卡片操作` : '画布操作'} className="min-w-[200px]">
      {frameMenu && snapshot
        ? <CanvasFrameMenu frame={snapshot.frames.find((frame) => frame.id === frameMenu.frameId)} onClose={() => setFrameMenu(null)} onFeedback={(frameId) => { setFrameMenu(null); setFeedbackFrameId(frameId) }} />
        : menu && <CanvasContextMenu menu={menu} onTalk={() => { setMenu(null); setDialogOpen(true) }} onCreate={createAt} />}
    </ContextMenuContent>
    </ContextMenu>
    {feedbackFrame && <FrameFeedbackDialog frame={feedbackFrame} onClose={() => setFeedbackFrameId(null)} />}
    {dialogOpen && snapshot && <CanvasAgentDialog onClose={() => setDialogOpen(false)} />}
  </div>
}

interface CanvasContextItem {
  label: string
  onSelect?: () => void
  icon?: React.ReactNode
  destructive?: boolean
  hint?: string
  disabled?: boolean
  submenu?: CanvasContextItem[]
  keepOpen?: boolean
}

function CanvasMenuItems({ items, onClose }: { items: CanvasContextItem[]; onClose: () => void }) {
  return items.map((item, index) => {
    const content = <>{item.icon}<span className="flex-1">{item.label}</span>{item.hint && <ContextMenuShortcut>{item.hint}</ContextMenuShortcut>}</>
    if (item.submenu?.length) return <ContextMenuSub key={`${item.label}:${index}`}><ContextMenuSubTrigger disabled={item.disabled}>{content}</ContextMenuSubTrigger><ContextMenuSubContent><CanvasMenuItems items={item.submenu} onClose={onClose} /></ContextMenuSubContent></ContextMenuSub>
    return <ContextMenuItem key={`${item.label}:${index}`} disabled={item.disabled} variant={item.destructive ? 'destructive' : 'default'} onClick={(event) => { if (item.keepOpen) event.preventDefault(); item.onSelect?.(); if (!item.keepOpen) onClose() }}>{content}</ContextMenuItem>
  })
}

function CanvasContextMenu({ menu, onTalk, onCreate }: {
  menu: CanvasMenu
  onTalk: () => void
  onCreate: (type: CanvasFrameType, at: { x: number; y: number }) => void
}) {
  return <CanvasMenuItems onClose={() => undefined} items={[
    { label: '对话', icon: <IAt />, onSelect: onTalk },
    { label: '新增', icon: <IPlus />, submenu: FRAME_TYPES.map((item) => ({ label: item.label, hint: item.detail, onSelect: () => onCreate(item.type, { x: menu.worldX, y: menu.worldY }) })) },
  ]} />
}

function CanvasFrameMenu({ frame: targetFrame, onClose, onFeedback }: {
  frame?: CanvasFrame
  onClose: () => void
  onFeedback: (frameId: string) => void
}) {
  const deleteFrame = useCanvas((state) => state.deleteFrame)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  if (!targetFrame) return null
  const frame = targetFrame

  async function copyContent() {
    try {
      await navigator.clipboard.writeText(frameTextContent(frame))
      setNotice('已复制内容')
    } catch {
      setNotice('复制失败，请在编辑器中手动复制')
    }
  }

  async function download() {
    try {
      await downloadFrame(frame)
      setNotice('已开始下载')
    } catch {
      setNotice('下载失败')
    }
  }

  async function remove() {
    if (busy) return
    if (!await confirmSensitiveAction({
      title: '删除画布卡片？',
      description: `“${frame.title}”将被永久删除，且无法恢复。`,
      confirmLabel: '删除卡片',
      tone: 'destructive',
    })) return
    setBusy(true)
    try {
      await toastAction(deleteFrame(frame.id), { loading: '正在删除画布卡片', success: '画布卡片已删除', error: '删除画布卡片失败' })
      onClose()
    } catch (cause) {
      setNotice(userFacingError(cause, '画布卡片删除失败，请稍后重试。'))
      setBusy(false)
    }
  }

  return <CanvasMenuItems onClose={onClose} items={[
    { label: frame.title, hint: `${TYPE_LABELS[frame.type]} · 第 ${frame.revision} 版`, disabled: true },
    { label: '反馈给智能助教', icon: <IAt />, onSelect: () => onFeedback(frame.id) },
    { label: notice ?? '复制内容', keepOpen: true, onSelect: () => void copyContent() },
    { label: '下载文件', keepOpen: true, onSelect: () => void download() },
    { label: '删除卡片', icon: <ITrash />, destructive: true, disabled: busy, onSelect: () => void remove() },
  ]} />
}

function frameTextContent(frame: CanvasFrame): string {
  if (frame.content) return frame.content
  const data = JSON.stringify(frame.data, null, 2)
  return data === '{}' ? '' : data
}

function safeDownloadName(title: string): string {
  return title.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 80) || '画布卡片'
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

async function downloadFrame(frame: CanvasFrame) {
  const base = safeDownloadName(frame.title)
  if (frame.type === 'image' && frame.content) {
    try {
      const response = await fetch(frame.content)
      if (!response.ok) throw new Error(String(response.status))
      const blob = await response.blob()
      const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'png'
      saveBlob(blob, `${base}.${extension}`)
      return
    } catch {
      const anchor = document.createElement('a')
      anchor.href = frame.content
      anchor.download = base
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      anchor.click()
      return
    }
  }
  const format = frame.type === 'markdown'
    ? { extension: 'md', mime: 'text/markdown;charset=utf-8' }
    : frame.type === 'html'
      ? { extension: 'html', mime: 'text/html;charset=utf-8' }
      : frame.type === 'artifact'
        ? { extension: 'json', mime: 'application/json;charset=utf-8' }
        : { extension: 'txt', mime: 'text/plain;charset=utf-8' }
  saveBlob(new Blob([frameTextContent(frame)], { type: format.mime }), `${base}.${format.extension}`)
}

function FrameCard({ frame, assignment, status, selected, zoom, allowActivation }: {
  frame: CanvasFrame
  assignment?: CanvasAgentAssignment
  status?: string
  selected: boolean
  zoom: number
  allowActivation: () => boolean
}) {
  const selectFrame = useCanvas((state) => state.selectFrame)
  const patchLocalFrame = useCanvas((state) => state.patchLocalFrame)
  const updateFrame = useCanvas((state) => state.updateFrame)
  const ownerId = assignment?.agentId ?? frame.updatedBy ?? frame.createdBy
  const owner = useParticipants((state) => ownerId ? state.byId[ownerId] : undefined)
  const moved = useRef(false)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const draftRef = useRef(frame.content)
  const savingRef = useRef(false)
  const queuedSaveRef = useRef(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(frame.content)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const color = assignment?.color ?? 'var(--primary)'

  useEffect(() => {
    if (!editing) {
      draftRef.current = frame.content
      setDraft(frame.content)
    }
  }, [editing, frame.content])

  useEffect(() => {
    if (!editing) return
    editorRef.current?.focus()
    editorRef.current?.setSelectionRange(editorRef.current.value.length, editorRef.current.value.length)
  }, [editing])

  useEffect(() => {
    if (!editing || draft === frame.content) return
    const timer = window.setTimeout(() => void persistContent(draft), 650)
    return () => window.clearTimeout(timer)
  }, [draft, editing, frame.content, frame.revision])

  async function persistContent(content = draftRef.current) {
    if (savingRef.current) {
      queuedSaveRef.current = true
      return
    }
    const currentFrame = useCanvas.getState().snapshot?.frames.find((item) => item.id === frame.id)
    if (!currentFrame || currentFrame.content === content) return
    savingRef.current = true
    setSaving(true); setSaveError(null)
    try {
      await updateFrame(frame.id, { content }, true, currentFrame.revision)
    } catch (cause) {
      setSaveError(userFacingError(cause, '画布内容保存失败，请稍后重试。'))
      setEditing(true)
    } finally {
      savingRef.current = false
      setSaving(false)
      if (queuedSaveRef.current || draftRef.current !== content) {
        queuedSaveRef.current = false
        void persistContent(draftRef.current)
      }
    }
  }

  function beginMove(event: React.PointerEvent) {
    if (event.pointerType === 'touch') {
      event.stopPropagation()
      return
    }
    event.preventDefault(); event.stopPropagation(); moved.current = false; selectFrame(frame.id)
    const start = { clientX: event.clientX, clientY: event.clientY, x: frame.x, y: frame.y }
    let latest = { x: frame.x, y: frame.y }
    const move = (next: PointerEvent) => {
      if (Math.abs(next.clientX - start.clientX) + Math.abs(next.clientY - start.clientY) > 4) moved.current = true
      latest = { x: Math.round(start.x + (next.clientX - start.clientX) / zoom), y: Math.round(start.y + (next.clientY - start.clientY) / zoom) }
      patchLocalFrame(frame.id, latest)
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (moved.current) void updateFrame(frame.id, latest).catch(() => undefined) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  function beginResize(event: React.PointerEvent) {
    event.preventDefault(); event.stopPropagation(); moved.current = true; selectFrame(frame.id)
    const start = { clientX: event.clientX, clientY: event.clientY, width: frame.width, height: frame.height }
    let latest = { width: frame.width, height: frame.height }
    const move = (next: PointerEvent) => {
      latest = { width: Math.max(180, Math.round(start.width + (next.clientX - start.clientX) / zoom)), height: Math.max(140, Math.round(start.height + (next.clientY - start.clientY) / zoom)) }
      patchLocalFrame(frame.id, latest)
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); void updateFrame(frame.id, latest).catch(() => undefined) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  return <article data-canvas-frame={frame.id} className={`canvas-frame-card absolute overflow-hidden ${selected ? 'is-selected' : ''} ${status ? 'is-live-editing' : ''}`} style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height, '--canvas-frame-accent': color } as CSSProperties} onPointerDown={(event) => { event.stopPropagation(); selectFrame(frame.id) }}>
    <header onPointerDown={beginMove} className="canvas-frame-header cursor-grab active:cursor-grabbing" aria-label={`移动${frame.title}`} />
    {ownerId && <span className="canvas-frame-agent-label"><i aria-hidden />{owner?.name ?? '智能助教'}</span>}
    <div className={`canvas-frame-body relative h-[calc(100%-40px)] overflow-auto ${EDITABLE_FRAME_TYPES.has(frame.type) ? 'cursor-text' : ''}`} onClick={(event) => {
      event.stopPropagation()
      if (EDITABLE_FRAME_TYPES.has(frame.type) && allowActivation() && !editing) setEditing(true)
    }}>
      {editing
        ? <div className="canvas-inline-editor flex h-full min-h-0 flex-col p-2" onPointerDown={(event) => event.stopPropagation()}>
          <Textarea ref={editorRef} value={draft} onChange={(event) => { draftRef.current = event.target.value; setDraft(event.target.value) }} onBlur={() => { void persistContent(draftRef.current); setEditing(false) }} onKeyDown={(event) => { if (event.key === 'Escape') event.currentTarget.blur() }} spellCheck className="canvas-panel-input canvas-content-input min-h-0 flex-1 resize-none text-xs leading-5" aria-label={`编辑${frame.title}`} />
          {(saving || saveError) && <div aria-live="polite" className={`canvas-save-status pointer-events-none absolute bottom-3 right-4 px-2 py-1 text-[9px] ${saveError ? 'is-error' : ''}`}>{saveError ?? '自动保存中…'}</div>}
        </div>
        : <CanvasFrameContent frame={frame} />}
    </div>
    <Button type="button" aria-label="调整卡片大小" onPointerDown={beginResize} onClick={(event) => event.stopPropagation()} className="canvas-frame-resize-handle absolute bottom-0 right-0 size-5 cursor-nwse-resize rounded-tl before:absolute before:bottom-1 before:right-1 before:size-2 before:border-b before:border-r" />
  </article>
}

function feedbackDraftKey(canvasId: string, frameId: string) {
  return `lingxiloop:canvas-feedback:${canvasId}:${frameId}`
}

function readFeedbackDraft(canvasId: string, frameId: string): string {
  try { return window.sessionStorage.getItem(feedbackDraftKey(canvasId, frameId)) ?? '' }
  catch { return '' }
}

function writeFeedbackDraft(canvasId: string, frameId: string, body: string) {
  try {
    const key = feedbackDraftKey(canvasId, frameId)
    if (body.trim()) window.sessionStorage.setItem(key, body)
    else window.sessionStorage.removeItem(key)
  } catch { /* Session storage can be unavailable in privacy-restricted webviews. */ }
}

function FrameFeedbackDialog({ frame, onClose }: { frame: CanvasFrame; onClose: () => void }) {
  const snapshot = useCanvas((state) => state.snapshot)!
  const steerAgent = useCanvas((state) => state.steerAgent)
  const assignAgent = useCanvas((state) => state.assignAgent)
  const addComment = useCanvas((state) => state.addComment)
  const byId = useParticipants((state) => state.byId)
  const [body, setBody] = useState(() => readFeedbackDraft(frame.canvasId, frame.id))
  const bodyRef = useRef(body)
  const [agentId, setAgentId] = useState(assignmentForFrame(frame, snapshot.assignments)?.agentId ?? snapshot.assignments[0]?.agentId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const assignment = assignmentForFrame(frame, snapshot.assignments)
  const targetAssignment = snapshot.assignments.find((item) => item.agentId === agentId)
  const participant = agentId ? byId[agentId] : undefined
  const comments = snapshot.comments.filter((comment) => comment.frameId === frame.id).slice(0, 3)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const text = body.trim()
    if (!text || busy) return
    setBusy(true); setError(null)
    try {
      if (agentId) {
        if (targetAssignment && isCanvasAssignmentActive(targetAssignment.status)) await steerAgent(agentId, text)
        else await assignAgent(agentId, text)
      }
      await addComment(text, frame.id)
      writeFeedbackDraft(frame.canvasId, frame.id, '')
      onClose()
    } catch (cause) { setError(userFacingError(cause, '反馈发送失败，请稍后重试。')) }
    finally { setBusy(false) }
  }

  return <Dialog open onOpenChange={(open) => { if (!open) { writeFeedbackDraft(frame.canvasId, frame.id, bodyRef.current); onClose() } }}><DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-sm"><form onSubmit={submit}>
    <DialogHeader className="pe-10"><div className="flex items-center gap-3">
      {participant ? <AvatarMini p={participant} size={34} /> : <span className="canvas-feedback-avatar grid size-9 place-items-center text-sm font-bold">评</span>}
      <div className="min-w-0 flex-1"><DialogTitle className="truncate">反馈给 {participant?.name ?? '智能助教'}</DialogTitle><DialogDescription className="truncate">{frame.title}{targetAssignment ? ` · ${localizeStatus(canvasStatusLabel(targetAssignment.status))}` : ''}</DialogDescription></div>
    </div></DialogHeader>
    {!assignment && <div className="mt-3 flex flex-wrap gap-2">{snapshot.assignments.map((item) => {
      const agent = byId[item.agentId]
      return <Button key={item.agentId} type="button" size="sm" variant={agentId === item.agentId ? 'default' : 'outline'} onClick={() => setAgentId(item.agentId)}>{agent && <AvatarMini p={agent} size={20} />}@{agent?.name ?? '智能助教'}</Button>
    })}</div>}
    {comments.length > 0 && <div className="mt-3 space-y-1.5">{comments.map((comment) => <div key={comment.id} className="rounded-md bg-muted px-2.5 py-2 text-xs leading-4 text-muted-foreground">{comment.body}</div>)}</div>}
    <Textarea autoFocus value={body} onChange={(event) => { bodyRef.current = event.target.value; setBody(event.target.value); writeFeedbackDraft(frame.canvasId, frame.id, event.target.value) }} rows={3} placeholder="说明需要修改或继续完成的内容…" className="mt-3 resize-none text-xs" />
    {error && <div className="mt-2 text-[10px] text-destructive">{error}</div>}
    <DialogFooter className="mt-3"><Button type="submit" disabled={!agentId || !body.trim() || busy}><ISend className="size-3.5" />发送反馈</Button></DialogFooter>
  </form></DialogContent></Dialog>
}

function CanvasAgentDialog({ onClose }: { onClose: () => void }) {
  const snapshot = useCanvas((state) => state.snapshot)!
  const assignAgent = useCanvas((state) => state.assignAgent)
  const byId = useParticipants((state) => state.byId)
  const agents = useMemo(() => Object.values(byId).filter((participant) => participant.kind === 'agent' && (participant.capabilities?.includes('canvas') || snapshot.assignments.some((item) => item.agentId === participant.id))), [byId, snapshot.assignments])
  const [agentId, setAgentId] = useState(agents[0]?.id ?? '')
  const [assignment, setAssignment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const text = assignment.trim()
    if (!agentId || !text || busy) return
    setBusy(true); setError(null)
    try {
      await assignAgent(agentId, text)
      onClose()
    } catch (cause) { setError(userFacingError(cause, '任务分配失败，请稍后重试。')) }
    finally { setBusy(false) }
  }

  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}><DialogContent><form onSubmit={submit}>
    <DialogHeader><DialogTitle>在画布中新增工作</DialogTitle><DialogDescription>选择智能助教，并通过 @ 对话把任务加入当前画布。</DialogDescription></DialogHeader>
    <div className="mt-4 flex flex-wrap gap-2">{agents.map((agent) => <Button key={agent.id} type="button" size="sm" variant={agentId === agent.id ? 'default' : 'outline'} onClick={() => setAgentId(agent.id)}><AvatarMini p={agent} size={24} />@{agent.name}</Button>)}</div>
    <Textarea autoFocus value={assignment} onChange={(event) => setAssignment(event.target.value)} rows={4} placeholder="描述希望智能助教在这块画布中完成的工作…" className="mt-4 resize-none text-xs" />
    {error && <div className="mt-2 text-[10px] text-destructive">{error}</div>}
    <DialogFooter className="mt-3"><Button type="submit" disabled={!agentId || !assignment.trim() || busy}><ISend className="size-3.5" />@ 智能助教并新增工作</Button></DialogFooter>
  </form></DialogContent></Dialog>
}

function assignmentForFrame(frame: CanvasFrame, assignments: CanvasAgentAssignment[]): CanvasAgentAssignment | undefined {
  return assignments.find((assignment) => assignment.agentId === frame.updatedBy)
    ?? assignments.find((assignment) => assignment.agentId === frame.createdBy)
    ?? assignments.find((assignment) => assignment.activeFrameId === frame.id)
}
