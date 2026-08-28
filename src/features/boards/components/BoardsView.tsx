import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AvatarMini } from '@/components/Avatar'
import { IAt, IBoard, IMore, IPlus, ITrash } from '@/components/icons'
import { ResizeHandle } from '@/components/ResizeHandle'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { useResizableWidth } from '@/lib/useResizableWidth'
import { cn } from '@/lib/utils'
import { useMe } from '@/stores/auth'
import { useBoards } from '../state'
import { useParticipants } from '@/features/agents/state'
import type { Participant } from '@/types'
import type { BoardCard, BoardCardComment, BoardColumn } from '../contracts'
import { hasLinkedReference, MentionedText, MentionInput } from './BoardMentions'

/**
 * Boards view — Kanban for both humans and agents.
 *
 * The same boards/cards an agent manipulates via `lingxiloop board ...` show
 * up here. Card titles, descriptions, and comments accept `@<id>` tokens;
 * mentions get chipped inline and broadcast on the boards channel so the
 * recipient (human or agent) is reachable from anywhere.
 */
export function BoardsView() {
  const list = useBoards((s) => s.list)
  const loadingList = useBoards((s) => s.loadingList)
  const selectedId = useBoards((s) => s.selectedId)
  const loadList = useBoards((s) => s.loadList)
  const selectBoard = useBoards((s) => s.selectBoard)

  useEffect(() => { void loadList() }, [loadList])

  // Auto-pick the first board when one becomes available — matches the
  // conversations pane's behaviour and avoids a perpetual "Pick a board"
  // empty state for users who only have one.
  useEffect(() => {
    if (!selectedId && list.length > 0) selectBoard(list[0].id)
  }, [list, selectedId, selectBoard])

  // Same shape as ConversationsLayout — `minmax(0, 1fr)` is critical:
  // a plain `1fr` track expands to fit its widest child, which would
  // make the canvas's horizontal overflow never trigger.
  const { width, onResizeStart } = useResizableWidth('sidebar:boards', 280, { min: 220, max: 480 })

  return (
    <div
      className="h-full grid"
      style={{ gridTemplateColumns: `${width}px minmax(0, 1fr)` }}
    >
      <BoardsSidebar onResizeStart={onResizeStart} />
      {selectedId
        ? <BoardCanvas boardId={selectedId} />
        : loadingList
          ? <ResourceSkeleton variant="cards" count={3} className="h-full p-6" label="正在加载看板" />
          : <EmptyBoardsState empty={list.length === 0} />}
    </div>
  )
}

/* ============== Sidebar ============== */

function BoardsSidebar({ onResizeStart }: { onResizeStart: (e: React.MouseEvent) => void }) {
  const list = useBoards((s) => s.list)
  const loadingList = useBoards((s) => s.loadingList)
  const selectedId = useBoards((s) => s.selectedId)
  const selectBoard = useBoards((s) => s.selectBoard)
  const createBoard = useBoards((s) => s.createBoard)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')

  async function submit() {
    const title = draft.trim()
    if (!title) { setCreating(false); return }
    setCreating(false)
    setDraft('')
    try {
      await createBoard(title)
    } catch (e) {
      console.warn('[boards] create failed', e)
    }
  }

  return (
    <aside className="h-full overflow-y-auto border-r border-ink-100 bg-cloud/40 relative">
      <ResizeHandle onMouseDown={onResizeStart} />
      <div className="px-4 py-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink-900">看板</h2>
        <button
          onClick={() => setCreating(true)}
          className="w-7 h-7 rounded-md grid place-items-center text-ink-500 hover:bg-ink-50 hover:text-skype-deep"
          title="新板"
          aria-label="新板"
        >
          <IPlus className="w-4 h-4" />
        </button>
      </div>
      {creating && (
        <div className="px-4 pb-2">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
              if (e.key === 'Escape') { setCreating(false); setDraft('') }
            }}
            onBlur={() => void submit()}
            placeholder="董事会标题..."
            className="w-full px-2.5 py-1.5 text-sm rounded-md border border-ink-200 bg-white focus:outline-none focus:border-skype"
          />
        </div>
      )}
      {loadingList && list.length === 0 && <ResourceSkeleton variant="list" count={5} compact label="正在加载看板列表" />}
      <ul className="pb-4">
        {list.map((b) => {
          const active = b.id === selectedId
          return (
            <li key={b.id}>
              <button
                onClick={() => selectBoard(b.id)}
                className={cn(
                  'w-full text-left px-4 py-2.5 flex items-center gap-2.5 transition-colors',
                  active ? 'bg-skype/10 text-skype-deep' : 'text-ink-700 hover:bg-ink-50',
                )}
              >
                <IBoard className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm truncate">{b.title}</span>
              </button>
            </li>
          )
        })}
        {!loadingList && list.length === 0 && !creating && (
          <li className="px-4 py-3 text-xs text-ink-400">
            还没有板。单击 + 开始一个。
          </li>
        )}
      </ul>
    </aside>
  )
}

function EmptyBoardsState({ empty }: { empty: boolean }) {
  return (
    <div className="h-full grid place-items-center text-ink-400">
      <div className="text-center">
        <IBoard className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p className="text-sm">
          {empty ? "创建您的第一个看板以开始使用。" : "选择一个板将其打开。"}
        </p>
      </div>
    </div>
  )
}

/* ============== Canvas (columns + cards) ============== */

function BoardCanvas({ boardId }: { boardId: string }) {
  const byId = useParticipants((s) => s.byId)
  const snap = useBoards((s) => s.snapshots[boardId])
  const loadingBoardId = useBoards((s) => s.loadingBoardId)
  const addColumn = useBoards((s) => s.addColumn)
  const deleteBoard = useBoards((s) => s.deleteBoard)
  const renameBoard = useBoards((s) => s.renameBoard)
  const [addingCol, setAddingCol] = useState(false)
  const [colDraft, setColDraft] = useState('')
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  // Hooks must run on every render in the same order — keep useMemo
  // above any conditional early return. When the snapshot hasn't
  // hydrated yet we just memoize over an empty board.
  const cardsByColumn = useMemo(() => {
    const m = new Map<string, BoardCard[]>()
    if (!snap) return m
    for (const col of snap.columns) m.set(col.id, [])
    for (const c of snap.cards) {
      const arr = m.get(c.columnId)
      if (arr) arr.push(c)
    }
    for (const [k, arr] of m) {
      arr.sort((a, b) => a.position - b.position)
      m.set(k, arr)
    }
    return m
  }, [snap])

  if (!snap) {
    return loadingBoardId === boardId
      ? <ResourceSkeleton variant="cards" count={3} className="h-full p-6" label="正在加载看板内容" />
      : <div className="h-full grid place-items-center text-ink-400 text-sm">无数据。</div>
  }

  const openCard = openCardId ? snap.cards.find((c) => c.id === openCardId) ?? null : null

  async function submitNewColumn() {
    const t = colDraft.trim()
    setAddingCol(false)
    setColDraft('')
    if (!t) return
    try { await addColumn(boardId, t) } catch (e) { console.warn('[boards] add column failed', e) }
  }

  async function submitTitle() {
    const t = titleDraft.trim()
    setEditingTitle(false)
    if (!t || t === snap.title) return
    try { await renameBoard(boardId, t) } catch (e) { console.warn('[boards] rename failed', e) }
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <header className="flex items-center justify-between px-6 py-4 border-b border-ink-100">
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <Input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitTitle()
                if (e.key === 'Escape') setEditingTitle(false)
              }}
              onBlur={() => void submitTitle()}
              className="text-2xl font-semibold text-ink-900 bg-transparent border-b border-skype outline-none"
            />
          ) : (
            <button
              onClick={() => { setTitleDraft(snap.title); setEditingTitle(true) }}
              className="text-2xl font-semibold text-ink-900 hover:text-skype-deep text-left truncate"
            >
              {snap.title}
            </button>
          )}
          {snap.description && (
            <p className="text-sm text-ink-500 mt-1 truncate">
              <MentionedText text={snap.description} byId={byId} />
            </p>
          )}
        </div>
        <button
          onClick={async () => {
            if (!await confirmSensitiveAction({
              title: '删除看板？',
              description: `“${snap.title}”中的所有列和卡片都将永久删除。`,
              confirmLabel: '删除看板',
              tone: 'destructive',
            })) return
            try {
              await toastAction(deleteBoard(boardId), { loading: '正在删除看板', success: '看板已删除', error: '删除看板失败' })
            } catch (e) { console.warn('[boards] delete failed', e) }
          }}
          className="w-8 h-8 rounded-md grid place-items-center text-ink-400 hover:bg-coral-50 hover:text-coral-deep"
          title="删除板"
          aria-label="删除板"
        >
          <ITrash className="w-4 h-4" />
        </button>
      </header>

      <div className="flex-1 overflow-x-auto overflow-y-hidden min-h-0">
        <div className="h-full flex items-start gap-4 px-6 py-4">
          {snap.columns.map((col) => (
            <ColumnView
              key={col.id}
              boardId={boardId}
              column={col}
              cards={cardsByColumn.get(col.id) ?? []}
              onOpenCard={setOpenCardId}
            />
          ))}
          {addingCol ? (
            <div className="w-72 flex-shrink-0 p-3 rounded-lg bg-cloud/60">
              <Input
                autoFocus
                value={colDraft}
                onChange={(e) => setColDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitNewColumn()
                  if (e.key === 'Escape') { setAddingCol(false); setColDraft('') }
                }}
                onBlur={() => void submitNewColumn()}
                placeholder="列标题..."
                className="w-full px-2.5 py-1.5 text-sm rounded-md border border-ink-200 bg-white focus:outline-none focus:border-skype"
              />
            </div>
          ) : (
            <button
              onClick={() => setAddingCol(true)}
              className="w-72 flex-shrink-0 px-3 py-2.5 rounded-lg text-sm text-ink-500 border border-dashed border-ink-200 hover:bg-cloud/40 hover:text-ink-700 transition-colors text-left"
            >
              + 添加列
            </button>
          )}
        </div>
      </div>

      {openCard && (
        <CardDetailModal
          boardId={boardId}
          card={openCard}
          columns={snap.columns}
          onClose={() => setOpenCardId(null)}
        />
      )}
    </div>
  )
}

/* ============== Column ============== */

function ColumnView({ boardId, column, cards, onOpenCard }: {
  boardId: string; column: BoardColumn; cards: BoardCard[]
  onOpenCard: (id: string) => void
}) {
  const addCard = useBoards((s) => s.addCard)
  const moveCardOptimistic = useBoards((s) => s.moveCardOptimistic)
  const renameColumn = useBoards((s) => s.renameColumn)
  const deleteColumn = useBoards((s) => s.deleteColumn)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [dragOver, setDragOver] = useState(false)

  async function submit() {
    const title = draft.trim()
    setAdding(false)
    setDraft('')
    if (!title) return
    try {
      await addCard(boardId, { columnId: column.id, title })
    } catch (e) { console.warn('[boards] add card failed', e) }
  }

  async function submitTitle() {
    const t = titleDraft.trim()
    setEditingTitle(false)
    if (!t || t === column.title) return
    try { await renameColumn(boardId, column.id, t) } catch (e) { console.warn('[boards] rename col failed', e) }
  }

  return (
    <div
      className={cn(
        'w-72 flex-shrink-0 h-full flex flex-col rounded-lg bg-cloud/60 transition-colors',
        dragOver && 'ring-2 ring-skype/40 bg-skype/5',
      )}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const cardId = e.dataTransfer.getData('text/lingxiloop-card')
        if (!cardId) return
        // Drop at the end of this column. Per-card drop targets would be
        // nicer for fine-grained ordering, but end-of-column covers the
        // common "move to Done" gesture.
        void moveCardOptimistic(boardId, cardId, column.id, cards.length)
      }}
    >
      <div className="px-3 pt-3 pb-2 flex items-center justify-between gap-2">
        {editingTitle ? (
          <Input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitTitle()
              if (e.key === 'Escape') setEditingTitle(false)
            }}
            onBlur={() => void submitTitle()}
            className="flex-1 px-1.5 py-0.5 text-sm font-medium rounded-md border border-skype/50 bg-white focus:outline-none"
          />
        ) : (
          <button
            onClick={() => { setTitleDraft(column.title); setEditingTitle(true) }}
            className="text-sm font-medium text-ink-700 hover:text-skype-deep flex-1 text-left truncate"
          >
            {column.title}
          </button>
        )}
        <span className="text-xs text-ink-400">{cards.length}</span>
        <button
          onClick={async () => {
            if (!await confirmSensitiveAction({
              title: '删除看板列？',
              description: cards.length > 0
                ? `“${column.title}”中的 ${cards.length} 张卡片也会被永久删除。`
                : `“${column.title}”将被永久删除。`,
              confirmLabel: '删除列',
              tone: 'destructive',
            })) return
            try {
              await toastAction(deleteColumn(boardId, column.id), { loading: '正在删除看板列', success: '看板列已删除', error: '删除看板列失败' })
            } catch (e) { console.warn('[boards] delete col failed', e) }
          }}
          className="w-5 h-5 rounded grid place-items-center text-ink-300 hover:text-coral-deep"
          title="删除列"
          aria-label="删除列"
        >
          <IMore className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
        {cards.map((c) => (
          <CardTile key={c.id} card={c} onOpen={() => onOpenCard(c.id)} />
        ))}
        {adding ? (
          <MentionInput
            autoFocus
            value={draft}
            onChange={setDraft}
            onSubmit={() => void submit()}
            onEscape={() => { setAdding(false); setDraft('') }}
            onBlur={() => void submit()}
            placeholder="卡片标题...（@提及任何人）"
            multiline
            submitOnEnter
            rows={2}
            className="w-full px-2.5 py-2 text-sm rounded-md border border-ink-200 bg-white focus:outline-none focus:border-skype resize-none"
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full text-left text-xs text-ink-400 px-2.5 py-1.5 rounded-md hover:bg-white hover:text-ink-600 transition-colors"
          >
            + 添加卡
          </button>
        )}
      </div>
    </div>
  )
}

/* ============== Card tile ============== */

function CardTile({ card, onOpen }: { card: BoardCard; onOpen: () => void }) {
  const byId = useParticipants((s) => s.byId)
  const assignee = card.assigneeId ? byId[card.assigneeId] : null
  return (
    <article
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/lingxiloop-card', card.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      className="px-3 py-2.5 rounded-md bg-white border border-ink-100 shadow-soft text-left cursor-pointer hover:border-skype/40 transition-colors"
    >
      <div className="text-sm text-ink-800 leading-snug">
        <MentionedText text={card.title} byId={byId} />
      </div>
      {(card.assigneeId || card.mentions.length > 0 || card.commentCount > 0) && (
        <div className="mt-2 flex items-center gap-2">
          {assignee && (
            <span className="flex items-center gap-1 text-[11px] text-ink-500">
              <AvatarMini p={assignee} size={18} />
              <span>{assignee.name}</span>
            </span>
          )}
          {card.mentions.length > 0 && !card.assigneeId && (
            <span className="flex items-center gap-0.5 text-[11px] text-ink-400">
              <IAt className="w-3 h-3" />
              {card.mentions.slice(0, 3).map((m) => '@' + (byId[m]?.name ?? m)).join(' ')}
            </span>
          )}
          {card.commentCount > 0 && (
            <span className="ml-auto text-[11px] text-ink-400">{card.commentCount} 💬</span>
          )}
        </div>
      )}
    </article>
  )
}

/* ============== Card detail modal ============== */

/** Module-level constant so the "no comments yet" fallback is referentially
 *  stable across renders — see the comment in CardDetailModal where it's used. */
const EMPTY_COMMENTS: BoardCardComment[] = []

function CardDetailModal({ boardId, card, columns, onClose }: {
  boardId: string; card: BoardCard; columns: BoardColumn[]; onClose: () => void
}) {
  const byId = useParticipants((s) => s.byId)
  const meId = useMe()
  const patchCard = useBoards((s) => s.patchCard)
  const deleteCard = useBoards((s) => s.deleteCard)
  const loadComments = useBoards((s) => s.loadComments)
  const addComment = useBoards((s) => s.addComment)
  // Select the raw entry (may be undefined), then fall back OUTSIDE the
  // selector — `?? []` inside would mint a new array literal on every
  // call, fail Object.is, and cycle render → reselect → render forever.
  const commentsRaw = useBoards((s) => s.comments[card.id])
  const comments: BoardCardComment[] = commentsRaw ?? EMPTY_COMMENTS
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description ?? '')
  const [draftComment, setDraftComment] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    setTitle(card.title)
    setDescription(card.description ?? '')
  }, [card.id, card.title, card.description])

  useEffect(() => {
    void loadComments(boardId, card.id)
  }, [loadComments, boardId, card.id])

  async function saveTitle() {
    const next = title.trim()
    if (!next || next === card.title) return
    try { await patchCard(boardId, card.id, { title: next }) } catch (e) { console.warn(e) }
  }
  async function saveDescription() {
    const next = description.trim()
    if (next === (card.description ?? '')) return
    try { await patchCard(boardId, card.id, { description: next }) } catch (e) { console.warn(e) }
  }
  async function moveToColumn(columnId: string) {
    if (columnId === card.columnId) return
    try { await patchCard(boardId, card.id, { columnId }) } catch (e) { console.warn(e) }
  }
  async function setAssignee(id: string | null) {
    try { await patchCard(boardId, card.id, { assigneeId: id }) } catch (e) { console.warn(e) }
  }
  async function postComment() {
    const body = draftComment.trim()
    if (!body || posting) return
    setPosting(true)
    try {
      await addComment(boardId, card.id, body)
      setDraftComment('')
    } catch (e) {
      console.warn(e)
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-6" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-cloud w-full max-w-2xl max-h-[85vh] rounded-xl shadow-xl flex flex-col"
      >
        <header className="px-5 py-4 border-b border-ink-100 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <MentionInput
              value={title}
              onChange={setTitle}
              onSubmit={() => void saveTitle()}
              placeholder="卡片标题 — @提及任何人"
              className="-ml-2 w-full border-transparent bg-transparent px-2 py-1.5 text-[19px] font-semibold leading-7 text-ink-900 placeholder:text-ink-300 focus:border-skype/30 focus:bg-white focus:ring-2 focus:ring-skype/15"
            />
          </div>
          <button
            type="button"
            onClick={() => { void saveTitle().then(onClose) }}
            className="shrink-0 rounded-md px-2.5 py-1.5 text-sm text-ink-500 hover:bg-sky2-50 hover:text-skype-deep"
          >关闭</button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <section className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-ink-400 mb-1">栏目</div>
              <Select value={card.columnId} onValueChange={(columnId) => void moveToColumn(columnId)}>
                <SelectTrigger aria-label="Column"><SelectValue /></SelectTrigger>
                <SelectContent>{columns.map((column) => <SelectItem key={column.id} value={column.id}>{column.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-ink-400 mb-1">受让人</div>
              <AssigneePicker
                value={card.assigneeId}
                onChange={(id) => void setAssignee(id)}
                meId={meId ?? null}
              />
            </div>
          </section>

          <section>
            <div className="text-[11px] uppercase tracking-wide text-ink-400 mb-1">说明</div>
            <MentionInput
              value={description}
              onChange={setDescription}
              onSubmit={() => void saveDescription()}
              placeholder="这张卡是关于什么的？ （@提及特工或人类——他们会看到的）"
              multiline
              rows={4}
            />
            {hasLinkedReference(description) && (
              <div className="mt-2 text-sm text-ink-700 whitespace-pre-wrap">
                <MentionedText text={description} byId={byId} />
              </div>
            )}
            <div className="mt-1 flex justify-end">
              <button
                onClick={() => void saveDescription()}
                className="text-xs text-ink-500 hover:text-skype-deep px-2 py-1"
              >保存描述</button>
            </div>
          </section>

          <section>
            <div className="text-[11px] uppercase tracking-wide text-ink-400 mb-1">
              评论 {comments.length > 0 && <span className="text-ink-500">· {comments.length}</span>}
            </div>
            <ul className="space-y-2">
              {comments.map((c) => {
                const author = byId[c.authorId]
                return (
                  <li key={c.id} className="flex items-start gap-2.5">
                    {author ? <AvatarMini p={author} size={26} /> : <span className="w-6 h-6 rounded-full bg-ink-200" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-ink-800">{author?.name ?? c.authorId}</span>
                        <span className="text-[11px] text-ink-400">{formatTime(c.createdAt)}</span>
                      </div>
                      <div className="text-sm text-ink-700 whitespace-pre-wrap">
                        <MentionedText text={c.body} byId={byId} />
                      </div>
                    </div>
                  </li>
                )
              })}
              {comments.length === 0 && (
                <li className="text-xs text-ink-400">还没有评论。</li>
              )}
            </ul>
            <div className="mt-3">
              <MentionInput
                value={draftComment}
                onChange={setDraftComment}
                onSubmit={() => void postComment()}
                placeholder="评论…（⌘↵发帖·@提及ping）"
                multiline
                rows={2}
              />
              <div className="mt-1 flex justify-end gap-2">
                <button
                  onClick={() => void postComment()}
                  disabled={!draftComment.trim() || posting}
                  className="px-3 py-1.5 text-sm rounded-md bg-skype text-white hover:bg-skype-deep disabled:opacity-40 disabled:hover:bg-skype"
                >发表评论</button>
              </div>
            </div>
          </section>
        </div>

        <footer className="px-5 py-3 border-t border-ink-100 flex items-center justify-between">
          <div className="text-[11px] text-ink-400">
            已创建 {formatTime(card.createdAt)} ·由 {byId[card.createdBy]?.name ?? card.createdBy}
          </div>
          <button
            onClick={async () => {
              if (!await confirmSensitiveAction({
                title: '删除卡片？',
                description: `“${card.title}”将被永久删除。`,
                confirmLabel: '删除卡片',
                tone: 'destructive',
              })) return
              try {
                await toastAction(deleteCard(boardId, card.id), { loading: '正在删除卡片', success: '卡片已删除', error: '删除卡片失败' })
                onClose()
              } catch (e) { console.warn(e) }
            }}
            className="text-xs text-coral-deep hover:underline"
          >删除卡</button>
        </footer>
      </div>
    </div>
  )
}

function AssigneePicker({ value, onChange, meId }: {
  value: string | null; onChange: (id: string | null) => void; meId: string | null
}) {
  const byId = useParticipants((s) => s.byId)
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const everyone = useMemo(() =>
    Object.values(byId).filter((p) => !p.departedAt && !p.managed)
      .sort((a, b) => {
        // Me first, then humans, then agents, then alphabetical.
        if (a.id === meId) return -1
        if (b.id === meId) return 1
        if (a.kind !== b.kind) return a.kind === 'human' ? -1 : 1
        return a.name.localeCompare(b.name)
      }),
    [byId, meId],
  )
  const selected = value ? everyone.find((p) => p.id === value) ?? null : null
  const options = useMemo(() => [
    { id: null, label: "未分配", meta: '', participant: null as Participant | null },
    ...everyone.map((p) => ({
      id: p.id,
      label: p.name,
      meta: p.kind === 'agent' ? 'agent' : (p.id === meId ? 'you' : 'human'),
      participant: p,
    })),
  ], [everyone, meId])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter((option) =>
      option.label.toLowerCase().includes(needle) ||
      option.meta.toLowerCase().includes(needle) ||
      (option.id ?? '').toLowerCase().includes(needle)
    )
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const idx = filtered.findIndex((option) => option.id === value)
    setActiveIndex(Math.max(0, idx))
  }, [filtered, open, value])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (target && rootRef.current?.contains(target)) return
      setOpen(false)
      setQuery('')
    }
    window.addEventListener('mousedown', onDown, true)
    return () => window.removeEventListener('mousedown', onDown, true)
  }, [open])

  function openMenu() {
    setOpen(true)
    setQuery('')
    queueMicrotask(() => inputRef.current?.focus())
  }

  function commit(option: (typeof options)[number] | undefined) {
    if (!option) return
    onChange(option.id)
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
  }

  const displayValue = open ? query : (selected ? `${selected.name}${selected.kind === 'agent' ? ' · agent' : ''}` : 'Unassigned')

  return (
    <div ref={rootRef} className="relative">
      <div
        className={cn(
          'group relative flex h-11 w-full items-center rounded-[14px] border border-ink-100 bg-cloud text-left text-[13px] font-semibold text-ink-900 outline-none transition',
          'shadow-[0_1px_0_rgba(255,255,255,0.92)_inset,0_10px_24px_-24px_rgba(26,78,120,0.55)]',
          'hover:border-sky2-200 hover:bg-sky2-50/60',
          open && 'border-sky2-300 bg-white ring-4 ring-sky2-100',
        )}
        style={{
          backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(246,250,253,0.94))',
        }}
      >
        {!open && (
          <span className="pointer-events-none absolute left-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center">
            {selected
              ? <AvatarMini p={selected} size={26} />
              : <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-ink-100 text-[12px] text-ink-400">-</span>}
          </span>
        )}
        <Input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          aria-activedescendant={open && filtered[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
          value={displayValue}
          placeholder="搜索受让人..."
          onFocus={openMenu}
          onMouseDown={() => {
            if (!open) openMenu()
          }}
          onChange={(event) => {
            if (!open) setOpen(true)
            setQuery(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              if (!open) { openMenu(); return }
              setActiveIndex((idx) => Math.min(filtered.length - 1, idx + 1))
              return
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              if (!open) { openMenu(); return }
              setActiveIndex((idx) => Math.max(0, idx - 1))
              return
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              commit(filtered[activeIndex])
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              setOpen(false)
              setQuery('')
            }
          }}
          className={cn(
            'h-full min-w-0 flex-1 rounded-[14px] bg-transparent px-3.5 pr-[76px] text-[13px] font-semibold text-ink-900 outline-none placeholder:text-ink-300',
            !open && 'pl-11',
          )}
        />
        {value && (
          <button
            type="button"
            aria-label="清除受让人"
            title="清除受让人"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChange(null)}
            className="absolute right-[45px] grid h-7 w-7 place-items-center rounded-[9px] text-ink-300 transition hover:bg-sky2-50 hover:text-ink-600"
          >
            <span aria-hidden="true" className="text-base leading-none">×</span>
          </button>
        )}
        <button
          type="button"
          aria-label="打开受让人菜单"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => openMenu()}
          className={cn(
            'absolute right-2 grid h-7 w-7 place-items-center rounded-[9px] border border-sky2-100 bg-sky2-50 text-skype-deep transition',
            'group-hover:bg-white group-focus-within:bg-sky2-50',
            open && 'border-sky2-200 bg-sky2-50',
          )}
        >
          <svg viewBox="0 0 14 14" className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} fill="none">
            <path d="M3.5 5.5 7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {open && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          className="app-menu-surface absolute left-0 right-0 top-full z-[70] mt-2 max-h-72 overflow-auto p-1.5 animate-rise"
        >
          {filtered.map((option, idx) => {
            const active = idx === activeIndex
            const selectedOption = option.id === value
            return (
              <button
                key={option.id ?? 'unassigned'}
                id={`${id}-option-${idx}`}
                type="button"
                role="option"
                aria-selected={selectedOption}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => commit(option)}
                className={cn(
                  'app-menu-item',
                  selectedOption
                    ? 'bg-skype text-white shadow-[0_10px_22px_-16px_rgba(0,120,200,0.82)]'
                    : active
                      ? 'bg-sky2-50 text-skype-deep'
                      : 'text-ink-700 hover:bg-sky2-50 hover:text-skype-deep',
                )}
              >
                {option.participant
                  ? <AvatarMini p={option.participant} size={22} />
                  : <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-ink-100 text-[11px] text-ink-400">-</span>}
                <span className="min-w-0 flex-1 truncate font-medium">{option.label}</span>
                {option.meta && (
                  <span className={cn(
                    'shrink-0 text-[10px] uppercase tracking-wide',
                    selectedOption ? 'text-white/70' : 'text-ink-300',
                  )}>{option.meta}</span>
                )}
              </button>
            )
          })}
          {filtered.length === 0 && (
            <div className="px-3 py-3 text-[12.5px] font-semibold text-ink-400">没有匹配的队友。</div>
          )}
        </div>
      )}
    </div>
  )
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}
