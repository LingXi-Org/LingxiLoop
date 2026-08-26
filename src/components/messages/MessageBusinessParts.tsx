import { useAuiState } from '@assistant-ui/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/api/client'
import { CardSurface } from '@/components/assistant-ui/elements/surfaces'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Attachment, AttachmentContent, AttachmentDescription, AttachmentMedia, AttachmentTitle, AttachmentTrigger } from '@/components/ui/attachment'
import { Skeleton } from '@/components/ui/skeleton'
import type { LingxiImMessageCustom } from '@/im/assistantMessage'
import { inferAttachmentPreview } from '@/lib/attachmentPreview'
import { useResolvedBoardId, useResolvedCalendarId, useResolvedCardId, useResolvedDocumentId } from '@/lib/useArtifactId'
import { cn, parseBlocks, parseBody } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useBoards } from '@/stores/boards'
import { useCalendar } from '@/stores/calendar'
import { useCanvas } from '@/stores/canvas'
import { useDocuments } from '@/stores/documents'
import { useKnowledgeSources } from '@/stores/knowledgeSources'
import { useParticipants } from '@/stores/participants'
import type { Message } from '@/types'
import { AttachmentViewer } from '../AttachmentViewer'
import { CanvasPreview } from '../CanvasPreview'
import { ImageViewer } from '../ImageViewer'
import { IBoard, ICalendar, IFigma, IFile, IMail } from '../icons'
import { RichBody } from './MessageBody'

type ArtifactRef = { type: 'document' | 'board' | 'card' | 'calendar'; id: string }

function artifactKey(ref: ArtifactRef): string {
  return `${ref.type}:${ref.id}`
}

function addArtifactRef(out: Map<string, ArtifactRef>, ref: ArtifactRef) {
  out.set(artifactKey(ref), ref)
}

function artifactRefsFromBody(body: string): ArtifactRef[] {
  const out = new Map<string, ArtifactRef>()
  for (const block of parseBlocks(body)) {
    if (block.kind !== 'prose') continue
    for (const token of parseBody(block.text)) {
      if (token.kind === 'document' || token.kind === 'board' || token.kind === 'card' || token.kind === 'calendar') {
        addArtifactRef(out, { type: token.kind, id: token.id })
      }
    }
  }
  return Array.from(out.values())
}

function artifactRefsFromPlainText(text: string): ArtifactRef[] {
  const out = new Map<string, ArtifactRef>()
  const re = /\b(doc_[A-Za-z0-9]+|board-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*|card-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*|ce-[A-Za-z0-9-]+)\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const id = m[0]
    if (id.startsWith('doc_')) addArtifactRef(out, { type: 'document', id })
    else if (id.startsWith('board-')) addArtifactRef(out, { type: 'board', id })
    else if (id.startsWith('card-')) addArtifactRef(out, { type: 'card', id })
    else if (id.startsWith('ce-')) addArtifactRef(out, { type: 'calendar', id })
  }
  return Array.from(out.values())
}

function artifactRefsForMessage(msg: Message): ArtifactRef[] {
  const out = new Map<string, ArtifactRef>()
  for (const ref of artifactRefsFromBody(msg.body)) addArtifactRef(out, ref)
  if (msg.tool) {
    for (const ref of artifactRefsFromPlainText(`${msg.tool.arg}\n${msg.tool.detail}`)) addArtifactRef(out, ref)
  }
  return Array.from(out.values())
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const ms = Date.now() - then
  if (!Number.isFinite(then)) return 'recently'
  if (ms < 60_000) return 'just now'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return new Date(iso).toLocaleDateString()
}

function DocumentArtifactCard({ id: rawId, conversationId }: { id: string; conversationId: string }) {
  const id = useResolvedDocumentId(rawId) // git-style short-id → full id
  const loaded = useDocuments((s) => s.loaded)
  const loadDocuments = useDocuments((s) => s.load)
  const selectDocument = useDocuments((s) => s.select)
  const doc = useDocuments((s) => s.list.find((d) => d.id === id) ?? null)
  const byId = useParticipants((s) => s.byId)
  const openDocumentPeek = useApp((s) => s.openDocumentPeek)

  useEffect(() => {
    if (!loaded) void loadDocuments()
  }, [loadDocuments, loaded])

  const title = doc?.title?.trim() || (loaded ? 'Document unavailable' : 'Opening document…')
  const author = doc ? byId[doc.createdBy]?.name ?? doc.createdBy : null
  const updated = doc ? timeAgo(doc.updatedAt) : null
  const isPinnedHere = doc?.conversationId === conversationId

  const open = () => {
    selectDocument(id)
    openDocumentPeek(id)
  }

  if (!loaded && !doc) return <ResourceSkeleton variant="cards" count={1} className="mt-2 max-w-[580px]" label="正在加载文档卡片" />

  return (
    <button
      type="button"
      onClick={open}
      className="mt-2 group block w-full max-w-[min(100%,580px)] text-left rounded-[12px] border border-ink-100 bg-cloud overflow-hidden transition hover:border-sky2-200 hover:shadow-[0_16px_34px_-22px_rgba(0,80,140,0.42)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky2-300"
      aria-label={`Open document ${title}`}
    >
      <div className="grid grid-cols-[52px_minmax(0,1fr)_auto] gap-3 px-3 py-3 items-center">
        <div
          className="relative w-[52px] h-[64px] rounded-[9px] bg-white border border-sky2-100 shadow-[0_10px_24px_-20px_rgba(0,80,140,0.35)] overflow-hidden"
          aria-hidden
        >
          <div className="h-2 bg-gradient-to-r from-skype via-sky2-200 to-coral-soft" />
          <div className="px-2.5 py-2 space-y-1.5">
            <span className="block h-1.5 rounded-full bg-ink-100 w-7" />
            <span className="block h-1 rounded-full bg-sky2-100 w-8" />
            <span className="block h-1 rounded-full bg-sky2-100 w-5" />
            <span className="block h-1 rounded-full bg-coral-soft/70 w-7" />
          </div>
          <div className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-md grid place-items-center bg-skype text-white shadow-sm">
            <IFile className="w-3 h-3" strokeWidth={1.8} />
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-skype-deep">文件</span>
            <span className="w-1 h-1 rounded-full bg-ink-200 shrink-0" />
            <span className="text-[10.5px] text-ink-400 truncate">{id}</span>
          </div>
          <div className="mt-1 text-[14px] font-semibold text-ink-900 truncate">{title}</div>
          <div className="mt-1 flex items-center gap-1.5 min-w-0 text-[11.5px] text-ink-500">
            {author && <span className="truncate">{author}</span>}
            {author && updated && <span className="w-1 h-1 rounded-full bg-ink-200 shrink-0" />}
            {updated && <span className="shrink-0">已更新 {updated}</span>}
            {isPinnedHere && (
              <>
                <span className="w-1 h-1 rounded-full bg-ink-200 shrink-0" />
                <span className="shrink-0 text-gold-deep">在此对话中</span>
              </>
            )}
          </div>
        </div>

        <div className="ml-1 h-8 px-3 rounded-full bg-sky2-50 text-skype-deep text-[11.5px] font-semibold inline-flex items-center gap-1.5 transition group-hover:bg-skype group-hover:text-white">
          打开
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>
      </div>
    </button>
  )
}

export function CanvasWorkspaceCard() {
  const { message: msg } = useAuiState((state) => state.message.metadata.custom) as unknown as LingxiImMessageCustom
  const openCanvasPeek = useApp((state) => state.openCanvasPeek)
  const setView = useApp((state) => state.setView)
  const load = useCanvas((state) => state.load)
  const loadPreview = useCanvas((state) => state.loadPreview)
  const canvasId = msg.canvas?.canvasId
  const live = useCanvas((state) => state.snapshot?.id === canvasId
    ? state.snapshot
    : (canvasId ? state.previews[canvasId] ?? null : null))
  const liveCard = useCanvas((state) => msg.canvas ? state.liveCards[msg.canvas.canvasId] : undefined)
  const canvas = msg.canvas
  useEffect(() => {
    if (canvasId) void loadPreview(canvasId)
  }, [canvasId, loadPreview])
  if (!canvas) return null
  const frameCount = live?.frames.filter((frame) => frame.type !== 'artifact').length ?? liveCard?.frameIds.length ?? canvas.frameCount
  const open = () => {
    void load(canvas.canvasId)
    if (window.innerWidth < 768) setView('canvas')
    else openCanvasPeek(canvas.canvasId)
  }
  return <CardSurface asChild variant="interactive" interactive className="mt-1 w-full max-w-[min(100%,580px)] gap-0 py-0 text-left [--card-spacing:0px]">
    <button type="button" onClick={open} aria-label={`打开 ${canvas.title} Canvas`}>
      <CanvasPreview snapshot={live} title={canvas.title} frameCount={frameCount} />
    </button>
  </CardSurface>
}


function BoardArtifactCard({ id: rawId }: { id: string }) {
  const id = useResolvedBoardId(rawId) // git-style short-id → full id
  const loadList = useBoards((s) => s.loadList)
  const loadingList = useBoards((s) => s.loadingList)
  const list = useBoards((s) => s.list)
  const loadBoard = useBoards((s) => s.loadBoard)
  const loadingBoardId = useBoards((s) => s.loadingBoardId)
  const snapshot = useBoards((s) => s.snapshots[id])
  const selectBoard = useBoards((s) => s.selectBoard)
  const openBoardPeek = useApp((s) => s.openBoardPeek)
  const summary = list.find((b) => b.id === id) ?? null
  const didRequestList = useRef(false)
  const requestedBoardId = useRef<string | null>(null)

  useEffect(() => {
    if (!summary && !loadingList && !didRequestList.current) {
      didRequestList.current = true
      void loadList().catch(() => { /* stale or missing board reference */ })
    }
  }, [loadList, loadingList, summary])

  useEffect(() => {
    if (!snapshot && loadingBoardId !== id && requestedBoardId.current !== id) {
      requestedBoardId.current = id
      void loadBoard(id).catch(() => { /* handled by unavailable card state */ })
    }
  }, [id, loadBoard, loadingBoardId, snapshot])

  const isBoardPending = !snapshot && (loadingBoardId === id || requestedBoardId.current !== id)
  const title = snapshot?.title?.trim() || summary?.title?.trim() || (isBoardPending ? 'Opening board...' : 'Board unavailable')
  const updated = snapshot?.updatedAt || summary?.updatedAt
  const columns = snapshot?.columns.length ?? null
  const cards = snapshot?.cards.length ?? null

  const open = () => {
    selectBoard(id)
    openBoardPeek(id)
  }

  if (isBoardPending) return <ResourceSkeleton variant="cards" count={1} className="mt-2 max-w-[580px]" label="正在加载看板卡片" />

  return (
    <button
      type="button"
      onClick={open}
      className="mt-2 group block w-full max-w-[min(100%,580px)] text-left rounded-[12px] border border-ink-100 bg-cloud overflow-hidden transition hover:border-sky2-200 hover:shadow-[0_16px_34px_-24px_rgba(0,80,140,0.24)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky2-200"
      aria-label={`Open board ${title}`}
    >
      <div className="grid grid-cols-[52px_minmax(0,1fr)_auto] gap-3 px-3 py-3 items-center">
        <div className="relative w-[52px] h-[64px] rounded-[9px] bg-white border border-sky2-100 shadow-[0_10px_24px_-22px_rgba(0,80,140,0.22)] overflow-hidden" aria-hidden>
          <div className="h-2 bg-gradient-to-r from-sky2-200 via-sky2-100 to-sky2-100" />
          <div className="grid grid-cols-3 gap-1 px-2 py-2 h-[46px]">
            <span className="rounded bg-sky2-100" />
            <span className="rounded bg-sky2-100" />
            <span className="rounded bg-ink-100" />
          </div>
          <div className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-md grid place-items-center bg-skype-deep text-white shadow-sm">
            <IBoard className="w-3 h-3" strokeWidth={1.8} />
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-skype-deep">看板</span>
            <span className="w-1 h-1 rounded-full bg-ink-200 shrink-0" />
            <span className="text-[10.5px] text-ink-400 truncate">{id}</span>
          </div>
          <div className="mt-1 text-[14px] font-semibold text-ink-900 truncate">{title}</div>
          <div className="mt-1 flex items-center gap-1.5 min-w-0 text-[11.5px] text-ink-500">
            {columns !== null && <span>{columns} 列</span>}
            {columns !== null && cards !== null && <span className="w-1 h-1 rounded-full bg-ink-200 shrink-0" />}
            {cards !== null && <span>{cards} 卡</span>}
            {updated && (
              <>
                <span className="w-1 h-1 rounded-full bg-ink-200 shrink-0" />
                <span className="shrink-0">已更新 {timeAgo(updated)}</span>
              </>
            )}
          </div>
        </div>

        <div className="ml-1 h-8 px-3 rounded-full bg-sky2-50 text-skype-deep text-[11.5px] font-semibold inline-flex items-center gap-1.5 transition group-hover:bg-skype-deep group-hover:text-white">
          打开
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>
      </div>
    </button>
  )
}

function CardArtifactCard({ id: rawId }: { id: string }) {
  const id = useResolvedCardId(rawId) // git-style short-id → full id (best-effort for cards)
  const lookup = useBoards((s) => s.cardLookups[id])
  const loadingCardId = useBoards((s) => s.loadingCardId)
  const loadCard = useBoards((s) => s.loadCard)
  const selectBoard = useBoards((s) => s.selectBoard)
  const openBoardPeek = useApp((s) => s.openBoardPeek)
  const byId = useParticipants((s) => s.byId)
  const [failed, setFailed] = useState(false)
  const didRequestCard = useRef(false)

  useEffect(() => {
    if (lookup || failed || loadingCardId === id || didRequestCard.current) return
    didRequestCard.current = true
    void loadCard(id).catch(() => setFailed(true))
  }, [failed, id, loadCard, loadingCardId, lookup])

  const card = lookup?.card ?? null
  const assignee = card?.assigneeId ? byId[card.assigneeId]?.name ?? card.assigneeId : null
  const title = card?.title.trim() || (failed ? 'Card unavailable' : 'Opening card...')
  const updated = card?.updatedAt ? timeAgo(card.updatedAt) : null
  const location = lookup ? `${lookup.board.title} -> ${lookup.column.title}` : id

  const open = () => {
    if (lookup) {
      selectBoard(lookup.board.id)
      openBoardPeek(lookup.board.id, id)
      return
    }
    void loadCard(id)
      .then((resolved) => {
        selectBoard(resolved.board.id)
        openBoardPeek(resolved.board.id, id)
      })
      .catch(() => setFailed(true))
  }

  if (!card && !failed) return <ResourceSkeleton variant="cards" count={1} className="mt-2 max-w-[580px]" label="正在加载看板任务" />

  return (
    <button
      type="button"
      onClick={open}
      className="mt-2 group block w-full max-w-[min(100%,580px)] text-left rounded-[12px] border border-ink-100 bg-cloud overflow-hidden transition hover:border-sky2-200 hover:shadow-[0_16px_34px_-24px_rgba(0,80,140,0.24)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky2-200"
      aria-label={`Open card ${title}`}
    >
      <div className="grid grid-cols-[52px_minmax(0,1fr)_auto] gap-3 px-3 py-3 items-center">
        <div className="relative w-[52px] h-[64px] rounded-[9px] bg-white border border-sky2-100 shadow-[0_10px_24px_-22px_rgba(0,80,140,0.22)] overflow-hidden" aria-hidden>
          <div className="h-2 bg-gradient-to-r from-sky2-200 via-sky2-100 to-cloud" />
          <div className="px-2 py-2 space-y-1.5">
            <span className="block h-1.5 rounded-full bg-ink-200 w-8" />
            <span className="block h-1 rounded-full bg-sky2-100 w-7" />
            <span className="block h-1 rounded-full bg-sky2-100 w-6" />
          </div>
          <div className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-md grid place-items-center bg-skype-deep text-white shadow-sm">
            <IBoard className="w-3 h-3" strokeWidth={1.8} />
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-skype-deep">看板卡</span>
            <span className="w-1 h-1 rounded-full bg-ink-200 shrink-0" />
            <span className="text-[10.5px] text-ink-400 truncate">{id}</span>
          </div>
          <div className="mt-1 text-[14px] font-semibold text-ink-900 truncate">{title}</div>
          <div className="mt-1 flex items-center gap-1.5 min-w-0 text-[11.5px] text-ink-500">
            <span className="truncate">{location}</span>
            {assignee && (
              <>
                <span className="w-1 h-1 rounded-full bg-ink-200 shrink-0" />
                <span className="truncate">{assignee}</span>
              </>
            )}
            {updated && (
              <>
                <span className="w-1 h-1 rounded-full bg-ink-200 shrink-0" />
                <span className="shrink-0">已更新 {updated}</span>
              </>
            )}
          </div>
        </div>

        <div className="ml-1 h-8 px-3 rounded-full bg-sky2-50 text-skype-deep text-[11.5px] font-semibold inline-flex items-center gap-1.5 transition group-hover:bg-skype-deep group-hover:text-white">
          看
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>
      </div>
    </button>
  )
}

function CalendarArtifactCard({ id: rawId }: { id: string }) {
  const id = useResolvedCalendarId(rawId) // git-style short-id → full event id
  const loadingEventId = useCalendar((s) => s.loadingEventId)
  const loadEvent = useCalendar((s) => s.loadEvent)
  const event = useCalendar((s) => s.events.find((e) => e.id === id) ?? null)
  const byId = useParticipants((s) => s.byId)
  const openCalendarEventPeek = useApp((s) => s.openCalendarEventPeek)
  const [failed, setFailed] = useState(false)
  const didRequestCalendar = useRef(false)

  useEffect(() => {
    if (!event && !failed && loadingEventId !== id && !didRequestCalendar.current) {
      didRequestCalendar.current = true
      void loadEvent(id).catch(() => setFailed(true))
    }
  }, [event, failed, id, loadEvent, loadingEventId])

  const title = event?.title?.trim() || (failed ? 'Event unavailable' : 'Opening event...')
  const assignee = event?.assigneeId ? byId[event.assigneeId]?.name ?? event.assigneeId : null
  const start = event ? new Date(event.startAt) : null
  const startLabel = start && Number.isFinite(start.getTime())
    ? `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : null

  if (!event && !failed) return <ResourceSkeleton variant="cards" count={1} className="mt-2 max-w-[580px]" label="正在加载日历事件" />

  return (
    <button
      type="button"
      onClick={() => openCalendarEventPeek(id)}
      className="mt-2 group block w-full max-w-[min(100%,580px)] text-left rounded-[12px] border border-ink-100 bg-cloud overflow-hidden transition hover:border-sky2-200 hover:shadow-[0_16px_34px_-24px_rgba(0,168,240,0.20)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky2-200"
      aria-label={`Open calendar event ${title}`}
    >
      <div className="grid grid-cols-[52px_minmax(0,1fr)_auto] gap-3 px-3 py-3 items-center">
        <div className="relative w-[52px] h-[64px] rounded-[9px] bg-white border border-sky2-100 shadow-[0_10px_24px_-22px_rgba(0,168,240,0.18)] overflow-hidden" aria-hidden>
          <div className="h-2 bg-gradient-to-r from-sky2-200 via-sky2-100 to-cloud" />
          <div className="px-2 py-2">
            <span className="block text-[18px] leading-none font-semibold text-skype-deep">{start?.getDate() ?? '-'}</span>
            <span className="mt-1 block h-1 rounded-full bg-sky2-100 w-8" />
            <span className="mt-1.5 block h-1 rounded-full bg-ink-100 w-6" />
          </div>
          <div className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-md grid place-items-center bg-skype text-white shadow-sm">
            <ICalendar className="w-3 h-3" strokeWidth={1.8} />
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-skype-deep">日历</span>
            <span className="w-1 h-1 rounded-full bg-ink-200 shrink-0" />
            <span className="text-[10.5px] text-ink-400 truncate">{id}</span>
          </div>
          <div className="mt-1 text-[14px] font-semibold text-ink-900 truncate">{title}</div>
          <div className="mt-1 flex items-center gap-1.5 min-w-0 text-[11.5px] text-ink-500">
            {startLabel && <span className="truncate">{startLabel}</span>}
            {event?.kind === 'agent_task' && assignee && (
              <>
                <span className="w-1 h-1 rounded-full bg-ink-200 shrink-0" />
                <span className="truncate">为 {assignee}</span>
              </>
            )}
            {event?.status && (
              <>
                <span className="w-1 h-1 rounded-full bg-ink-200 shrink-0" />
                <span className="shrink-0 capitalize">{event.status}</span>
              </>
            )}
          </div>
        </div>

        <div className="ml-1 h-8 px-3 rounded-full bg-sky2-50 text-skype-deep text-[11.5px] font-semibold inline-flex items-center gap-1.5 transition group-hover:bg-skype group-hover:text-white">
          打开
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>
      </div>
    </button>
  )
}

export function MessageArtifactParts() {
  const { message } = useAuiState((state) => state.message.metadata.custom) as unknown as LingxiImMessageCustom
  const refs = useMemo(
    () => artifactRefsForMessage(message),
    [message.body, message.tool?.arg, message.tool?.detail],
  )
  if (refs.length === 0) return null
  return (
    <div className="flex flex-col">
      {refs.map((ref) => (
        ref.type === 'document'
          ? <DocumentArtifactCard key={artifactKey(ref)} id={ref.id} conversationId={message.conversationId} />
          : ref.type === 'board'
            ? <BoardArtifactCard key={artifactKey(ref)} id={ref.id} />
            : ref.type === 'card'
              ? <CardArtifactCard key={artifactKey(ref)} id={ref.id} />
              : <CalendarArtifactCard key={artifactKey(ref)} id={ref.id} />
      ))}
    </div>
  )
}

/* ============== email ==============
 * Distinct chrome from chat bubbles: pale parchment background, subject as
 * a serif headline, then a header row (from / to / cc collapsed onto one
 * line), then the body. Direction is conveyed by a tiny chip in the
 * subject row (↓ in / ↑ out) and by a leading edge color.
 *
 * Failed sends get a red border + inline note. The default body is the
 * plain-text version (server strips HTML on inbound for searchability).
 * When the message has a richer HTML version, the "html" chip becomes a
 * toggle that opens the rendered HTML inside a sandboxed iframe — the
 * server sanitizes and the sandbox forbids scripts, so even residual
 * hostile markup can't escape. */
export function EmailCard() {
  const { message: msg } = useAuiState((state) => state.message.metadata.custom) as unknown as LingxiImMessageCustom
  const openComposeReply = useApp((s) => s.openComposeReply)
  const [showHtml, setShowHtml] = useState(false)
  const [htmlBody, setHtmlBody] = useState<string | null>(null)
  const [htmlError, setHtmlError] = useState<string | null>(null)
  const [htmlLoading, setHtmlLoading] = useState(false)

  useEffect(() => {
    if (!showHtml || htmlBody !== null || htmlError) return
    let cancelled = false
    setHtmlLoading(true)
    api.fetchEmailHtml(msg.id)
      .then((html) => { if (!cancelled) setHtmlBody(html ?? '') })
      .catch((e: unknown) => { if (!cancelled) setHtmlError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setHtmlLoading(false) })
    return () => { cancelled = true }
  }, [showHtml, htmlBody, htmlError, msg.id])

  if (!msg.email) return null
  const e = msg.email
  const isOut = e.direction === 'out'
  const isFailed = e.transportStatus === 'failed'
  const isQueued = e.transportStatus === 'queued'
  // Parchment palette — distinct from the chat coral / sky bubble pair so
  // an email reads as "different artifact, takes more attention" without
  // being loud about it.
  const ringColor = isFailed
    ? 'rgba(196, 60, 50, 0.55)'
    : isOut
      ? 'rgba(0, 168, 240, 0.35)'
      : 'rgba(120, 110, 95, 0.30)'
  const dirChipBg = isFailed
    ? 'var(--coral-soft)'
    : isOut
      ? 'var(--sky-100, #E1F3FD)'
      : '#F4EEDD'
  const dirChipColor = isFailed
    ? '#B23A2A'
    : isOut
      ? 'var(--skype-deep)'
      : '#7A6A3F'
  const recipients = [
    ...e.to.map((t) => ({ label: "至", value: t })),
    ...e.cc.map((c) => ({ label: "抄送", value: c })),
  ]
  return (
    <CardSurface
      variant={isFailed ? 'destructive' : 'parchment'}
      status={isFailed ? 'failed' : isQueued ? 'pending' : 'success'}
      className="mt-1 max-w-[min(100%,640px)] overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #FBF8F0, #F4EEDD)',
        border: `1px solid ${ringColor}`,
        borderRadius: '14px',
        boxShadow: '0 1px 0 rgba(0,0,0,0.02), 0 8px 20px -16px rgba(60, 50, 30, 0.18)',
      }}
    >
      <div className="px-4 pt-3 pb-2 border-b border-[rgba(120,110,95,0.18)]">
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold py-0.5 px-1.5 rounded uppercase tracking-wider"
            style={{ background: dirChipBg, color: dirChipColor }}
          >
            <IMail className="w-3 h-3" strokeWidth={2} />
            {isFailed ? "失败" : isQueued ? "已排队" : isOut ? "已发送" : "已收到"}
          </span>
          {e.hasHtml && (
            <button
              type="button"
              onClick={() => setShowHtml((v) => !v)}
              className={cn(
                'text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded transition',
                showHtml
                  ? 'bg-[#7A6A3F] text-[#FBF8F0]'
                  : 'text-ink-400 hover:text-ink-700 hover:bg-[rgba(120,110,95,0.10)]',
              )}
              aria-pressed={showHtml}
              title={showHtml ? "隐藏 HTML 版本" : "显示HTML版本"}
            >
              {showHtml ? "简单" : 'html'}
            </button>
          )}
          {e.smtpMessageId && (
            <span
              className="ml-auto text-[10px] text-ink-300 font-mono truncate max-w-[180px]"
              title={e.smtpMessageId}
            >
              {e.smtpMessageId}
            </span>
          )}
        </div>
        <div className="font-display font-medium text-[16px] leading-snug text-ink-900 break-words">
          {e.subject || <span className="text-ink-400 italic">（无主题）</span>}
        </div>
      </div>
      <div className="px-4 py-2.5 text-[11.5px] text-ink-500 space-y-0.5 border-b border-[rgba(120,110,95,0.18)]">
        <div className="flex gap-2">
          <span className="font-semibold w-7 shrink-0 text-ink-300 uppercase tracking-wider text-[10px] pt-0.5">来自</span>
          <span className="text-ink-700 break-all">{e.from}</span>
        </div>
        {recipients.length > 0 && recipients.map((r, i) => (
          <div key={i} className="flex gap-2">
            <span className="font-semibold w-7 shrink-0 text-ink-300 uppercase tracking-wider text-[10px] pt-0.5">{r.label}</span>
            <span className="text-ink-700 break-all">{r.value}</span>
          </div>
        ))}
      </div>
      {showHtml ? (
        <div className="px-2 py-2 bg-white">
          {htmlLoading && (
            <div className="space-y-3 px-3 py-4" role="status" aria-label="正在加载邮件 HTML 内容"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-5/6" /><Skeleton className="h-24 w-full rounded-xl" /></div>
          )}
          {htmlError && (
            <div className="px-3 py-3 text-[12px] text-coral-deep">
              无法加载 html: {htmlError}
            </div>
          )}
          {htmlBody !== null && !htmlError && (
            <EmailHtmlFrame html={htmlBody} />
          )}
        </div>
      ) : (
        <div className="px-4 py-3 text-[14px] leading-[1.55] text-ink-700 break-words">
          <RichBody body={msg.body} conversationId={msg.conversationId} />
        </div>
      )}
      {e.attachments && e.attachments.length > 0 && (
        <div className="px-4 py-2.5 border-t border-[rgba(120,110,95,0.18)] space-y-1">
          {e.attachments.map((a) => (
            <EmailAttachmentRow key={a.id} att={a} />
          ))}
        </div>
      )}
      {isFailed && e.transportError && (
        <div
          className="px-4 py-2 text-[11.5px] text-coral-deep border-t border-[rgba(196,60,50,0.25)]"
          style={{ background: 'rgba(196, 60, 50, 0.06)' }}
        >
          发送失败： {e.transportError}
        </div>
      )}
      <div className="flex items-center gap-2 px-4 py-2 border-t border-[rgba(120,110,95,0.18)]">
        <button
          type="button"
          onClick={() => openComposeReply(msg.id)}
          className="inline-flex items-center gap-1.5 py-1.5 px-3 text-[11.5px] font-semibold text-ink-700 bg-cloud border border-ink-100 rounded-[7px] hover:border-sky2-200 hover:text-skype-deep transition"
        >
          <IMail className="w-3.5 h-3.5" strokeWidth={2} />
          回复
        </button>
      </div>
    </CardSurface>
  )
}

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function EmailAttachmentRow({ att }: { att: NonNullable<NonNullable<Message['email']>['attachments']>[number] }) {
  const isImg = att.mimeType.startsWith('image/')
  const isPdf = att.mimeType === 'application/pdf'
  const icon = isImg ? '🖼' : isPdf ? '📄' : '📎'
  return (
    <Attachment size="xs" state={att.truncated ? 'error' : 'done'} className="w-full">
      <AttachmentMedia>{icon}</AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{att.filename}</AttachmentTitle>
        <AttachmentDescription>
          {att.mimeType}{att.sizeBytes > 0 && ` · ${humanSize(att.sizeBytes)}`}
          {att.truncated && ' · skipped (too large)'}
        </AttachmentDescription>
      </AttachmentContent>
      {att.url ? (
        <AttachmentTrigger render={<a href={att.url} target="_blank" rel="noreferrer noopener" download={att.filename} aria-label={`下载 ${att.filename}`} />} />
      ) : null}
    </Attachment>
  )
}

/** Sandboxed HTML email viewer. The iframe's `sandbox` attribute omits
 *  `allow-scripts` and `allow-top-navigation`, so even if the server-side
 *  sanitizer missed a vector, scripts can't run and the page can't be
 *  hijacked. `allow-popups` is the one capability we keep so a clicked
 *  link can open in a new tab; everything is forced to target=_blank +
 *  rel=noopener via a CSP-friendly wrapper around the body. */
function EmailHtmlFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement | null>(null)
  const [h, setH] = useState(120)
  // Wrap the sanitized body in a minimal HTML skeleton with a base target
  // so every link opens in a new tab (no top-frame navigation). The body
  // gets a reasonable default font + word-wrap so plain-text-shaped HTML
  // doesn't overflow horizontally.
  const wrapped = useMemo(() => `<!doctype html>
<html><head>
<meta charset="utf-8" />
<base target="_blank" />
<style>
  html, body { margin:0; padding:0; }
  body { font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; color: #2A2823; word-wrap: break-word; overflow-wrap: break-word; }
  body > * { max-width: 100% !important; }
  img, table { max-width: 100% !important; height: auto; }
  a { color: #00A8F0; }
  blockquote { border-left: 3px solid rgba(120,110,95,0.3); margin: 0; padding: 4px 0 4px 12px; color: #6B6859; }
</style>
</head><body>${html}</body></html>`, [html])
  // Resize the iframe to its content height. We measure body.scrollHeight
  // after load, plus a small buffer so the last line never sits flush
  // against the chrome.
  useEffect(() => {
    const f = ref.current
    if (!f) return
    const measure = () => {
      try {
        const doc = f.contentDocument
        if (!doc?.body) return
        const next = Math.min(800, Math.max(120, doc.body.scrollHeight + 8))
        setH(next)
      } catch { /* cross-origin defensiveness, ignore */ }
    }
    f.addEventListener('load', measure)
    // Re-measure after images stream in (height can grow significantly).
    const id = window.setTimeout(measure, 500)
    return () => { f.removeEventListener('load', measure); window.clearTimeout(id) }
  }, [wrapped])
  return (
    <iframe
      ref={ref}
      srcDoc={wrapped}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      style={{ width: '100%', height: h, border: 0, background: 'white', borderRadius: 6 }}
      title="HTML 电子邮件正文"
    />
  )
}
