import { useEffect, useMemo, useRef } from 'react'
import { AvatarMini } from '@/components/Avatar'
import { PeekHeader, PeekLoading, PeekUnavailable, formatShortDate } from '@/components/ArtifactPeekPrimitives'
import { useBoards } from '../state'
import { useParticipants } from '@/features/agents/state'
import { IBoard } from '@/components/icons'
import { cn } from '@/lib/utils'
import type { BoardCard } from '../contracts'

export function BoardPeekContent({
  boardId,
  focusCardId,
  onClose,
  onOpenFull,
}: {
  boardId: string
  focusCardId?: string | null
  onClose: () => void
  onOpenFull?: () => void
}) {
  const list = useBoards((s) => s.list)
  const loadingList = useBoards((s) => s.loadingList)
  const loadList = useBoards((s) => s.loadList)
  const loadBoard = useBoards((s) => s.loadBoard)
  const loadingBoardId = useBoards((s) => s.loadingBoardId)
  const snap = useBoards((s) => s.snapshots[boardId])
  const summary = list.find((b) => b.id === boardId) ?? null
  const didRequestList = useRef(false)
  const requestedBoardId = useRef<string | null>(null)

  useEffect(() => {
    if (!summary && !loadingList && !didRequestList.current) {
      didRequestList.current = true
      void loadList().catch(() => { /* stale or missing board reference */ })
    }
  }, [loadList, loadingList, summary])

  useEffect(() => {
    if (!snap && loadingBoardId !== boardId && requestedBoardId.current !== boardId) {
      requestedBoardId.current = boardId
      void loadBoard(boardId).catch(() => { /* handled by unavailable state */ })
    }
  }, [boardId, loadBoard, loadingBoardId, snap])

  const cardsByColumn = useMemo(() => {
    const m = new Map<string, BoardCard[]>()
    if (!snap) return m
    for (const col of snap.columns) m.set(col.id, [])
    for (const card of snap.cards) {
      const arr = m.get(card.columnId)
      if (arr) arr.push(card)
    }
    for (const cards of m.values()) cards.sort((a, b) => a.position - b.position)
    return m
  }, [snap])

  const isBoardPending = !snap && (loadingBoardId === boardId || loadingList || requestedBoardId.current !== boardId)

  if (isBoardPending) {
    return <PeekLoading icon={<IBoard className="w-5 h-5" />} label="开板..." />
  }

  if (!snap) {
    return (
      <PeekUnavailable
        icon={<IBoard className="w-5 h-5" />}
        title="董事会不可用"
        detail="This board may have been deleted or moved out of this workspace."
        onClose={onClose}
      />
    )
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-cloud">
      <PeekHeader
        icon={<IBoard className="w-5 h-5" />}
        label="看板"
        title={snap.title}
        meta={`${snap.columns.length} columns - ${snap.cards.length} cards - updated ${formatShortDate(snap.updatedAt)}`}
        onClose={onClose}
        onOpenFull={onOpenFull}
      />
      {snap.description && (
        <div className="shrink-0 px-4 py-3 border-b border-ink-100 text-[12.5px] leading-relaxed text-ink-600 bg-white/55">
          {snap.description}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
        <div className="h-full flex gap-3 p-4">
          {snap.columns.map((col) => {
            const cards = cardsByColumn.get(col.id) ?? []
            return (
              <section key={col.id} className="w-[220px] shrink-0 h-full min-h-0 flex flex-col rounded-[10px] border border-ink-100 bg-white/70">
                <div className="px-3 py-2.5 border-b border-ink-100 flex items-center gap-2">
                  <div className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-800">{col.title}</div>
                  <span className="text-[11px] font-semibold text-ink-400">{cards.length}</span>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                  {cards.length === 0 && (
                    <div className="rounded-[8px] border border-dashed border-ink-100 px-3 py-4 text-center text-[11.5px] text-ink-400">
                      空
                    </div>
                  )}
                  {cards.map((card) => (
                    <BoardPeekCard key={card.id} card={card} focused={card.id === focusCardId} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
function BoardPeekCard({ card, focused }: { card: BoardCard; focused: boolean }) {
  const byId = useParticipants((s) => s.byId)
  const assignee = card.assigneeId ? byId[card.assigneeId] : null
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!focused) return
    const id = window.setTimeout(() => {
      ref.current?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
    }, 80)
    return () => window.clearTimeout(id)
  }, [focused])

  return (
    <article
      ref={ref}
      className={cn(
        'rounded-[8px] border px-3 py-2.5 shadow-[0_10px_24px_-22px_rgba(0,80,140,0.35)] transition',
        focused
          ? 'border-sky2-200 bg-sky2-50 ring-2 ring-sky2-100'
          : 'border-ink-100 bg-cloud',
      )}
    >
      {focused && (
        <div className="mb-1.5 inline-flex rounded-full bg-sky2-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-skype-deep">
          从聊天中打开
        </div>
      )}
      <div className="text-[12.5px] font-medium leading-snug text-ink-800 line-clamp-3">{card.title}</div>
      {(assignee || card.commentCount > 0 || card.mentions.length > 0) && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-500">
          {assignee && (
            <span className="min-w-0 inline-flex items-center gap-1.5">
              <AvatarMini p={assignee} size={18} />
              <span className="truncate">{assignee.name}</span>
            </span>
          )}
          {card.commentCount > 0 && <span className="ml-auto shrink-0">{card.commentCount} 评论</span>}
          {!assignee && card.mentions.length > 0 && <span className="truncate">@{card.mentions.slice(0, 2).join(' @')}</span>}
        </div>
      )}
    </article>
  )
}
