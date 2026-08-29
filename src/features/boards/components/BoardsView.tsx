import { useEffect, useMemo, useState } from 'react'
import { AvatarMini } from '@/components/Avatar'
import { IAt, IBoard, IMore, IPlus, ITrash } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { cn } from '@/lib/utils'
import { useBoards } from '../state'
import { useParticipants } from '@/features/agents/state'
import type { BoardCard, BoardColumn } from '../contracts'
import { MentionedText, MentionInput } from './BoardMentions'
import { BoardCardDialog } from './BoardCardDialog'

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
  return (
    <div
      className="h-full grid"
      style={{ gridTemplateColumns: '280px minmax(0, 1fr)' }}
    >
      <BoardsSidebar />
      {selectedId
        ? <BoardCanvas boardId={selectedId} />
        : loadingList
          ? <ResourceSkeleton variant="cards" count={3} className="h-full p-6" label="正在加载看板" />
          : <EmptyBoardsState empty={list.length === 0} />}
    </div>
  )
}

/* ============== Sidebar ============== */

function BoardsSidebar() {
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
      await toastAction(createBoard(title), {
        loading: '正在创建看板', success: '看板已创建', error: '创建看板失败',
      })
    } catch (e) {
      console.warn('[boards] create failed', e)
    }
  }

  return (
    <aside className="relative h-full overflow-y-auto border-e border-border bg-muted/30">
      <div className="px-4 py-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">看板</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setCreating(true)}
          title="新板"
          aria-label="新板"
        >
          <IPlus className="size-4" />
        </Button>
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
            className="w-full"
          />
        </div>
      )}
      {loadingList && list.length === 0 && <ResourceSkeleton variant="list" count={5} compact label="正在加载看板列表" />}
      <ul className="pb-4">
        {list.map((b) => {
          const active = b.id === selectedId
          return (
            <li key={b.id}>
              <Button
                variant="ghost"
                onClick={() => selectBoard(b.id)}
                className={cn(
                  'h-auto w-full justify-start rounded-none px-4 py-2.5',
                  active ? 'bg-muted text-foreground' : 'text-muted-foreground',
                )}
              >
                <IBoard className="size-4 shrink-0" />
                <span className="text-sm truncate">{b.title}</span>
              </Button>
            </li>
          )
        })}
        {!loadingList && list.length === 0 && !creating && (
          <li className="px-4 py-3 text-xs text-muted-foreground">
            还没有板。单击 + 开始一个。
          </li>
        )}
      </ul>
    </aside>
  )
}

function EmptyBoardsState({ empty }: { empty: boolean }) {
  return (
    <div className="grid h-full place-items-center text-muted-foreground">
      <div className="text-center">
        <IBoard className="mx-auto mb-3 size-12 opacity-50" />
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
      : <div className="grid h-full place-items-center text-sm text-muted-foreground">无数据。</div>
  }

  const openCard = openCardId ? snap.cards.find((c) => c.id === openCardId) ?? null : null

  async function submitNewColumn() {
    const t = colDraft.trim()
    setAddingCol(false)
    setColDraft('')
    if (!t) return
    try {
      await toastAction(addColumn(boardId, t), {
        loading: '正在添加看板列', success: '看板列已添加', error: '添加看板列失败',
      })
    } catch (e) { console.warn('[boards] add column failed', e) }
  }

  async function submitTitle() {
    const t = titleDraft.trim()
    setEditingTitle(false)
    if (!t || t === snap.title) return
    try {
      await toastAction(renameBoard(boardId, t), {
        loading: '正在重命名看板', success: '看板已重命名', error: '重命名看板失败',
      })
    } catch (e) { console.warn('[boards] rename failed', e) }
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
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
              className="border-ring bg-transparent text-2xl font-semibold text-foreground"
            />
          ) : (
            <Button
              variant="ghost"
              onClick={() => { setTitleDraft(snap.title); setEditingTitle(true) }}
              className="h-auto max-w-full justify-start px-0 text-start text-2xl font-semibold text-foreground"
            >
              <span className="truncate">{snap.title}</span>
            </Button>
          )}
          {snap.description && (
            <p className="mt-1 truncate text-sm text-muted-foreground">
              <MentionedText text={snap.description} byId={byId} />
            </p>
          )}
        </div>
        <Button
          variant="destructive"
          size="icon-sm"
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
          title="删除板"
          aria-label="删除板"
        >
          <ITrash className="size-4" />
        </Button>
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
            <div className="w-72 shrink-0 rounded-3xl bg-muted/50 p-3">
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
                className="w-full"
              />
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => setAddingCol(true)}
              className="h-auto w-72 shrink-0 justify-start border-dashed px-3 py-2.5 text-muted-foreground"
            >
              + 添加列
            </Button>
          )}
        </div>
      </div>

      {openCard && (
        <BoardCardDialog
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
      await toastAction(addCard(boardId, { columnId: column.id, title }), {
        loading: '正在添加卡片', success: '卡片已添加', error: '添加卡片失败',
      })
    } catch (e) { console.warn('[boards] add card failed', e) }
  }

  async function submitTitle() {
    const t = titleDraft.trim()
    setEditingTitle(false)
    if (!t || t === column.title) return
    try {
      await toastAction(renameColumn(boardId, column.id, t), {
        loading: '正在重命名看板列', success: '看板列已重命名', error: '重命名看板列失败',
      })
    } catch (e) { console.warn('[boards] rename col failed', e) }
  }

  return (
    <div
      className={cn(
        'flex h-full w-72 shrink-0 flex-col rounded-3xl bg-muted/50 transition-colors',
        dragOver && 'bg-accent ring-2 ring-ring/40',
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
        void toastAction(moveCardOptimistic(boardId, cardId, column.id, cards.length), {
          loading: '正在移动卡片', success: '卡片已移动', error: '移动卡片失败',
        }).catch((error) => console.warn('[boards] move card failed', error))
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
            className="h-8 flex-1 text-sm font-medium"
          />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setTitleDraft(column.title); setEditingTitle(true) }}
            className="min-w-0 flex-1 justify-start px-1.5 text-foreground"
          >
            <span className="truncate">{column.title}</span>
          </Button>
        )}
        <span className="text-xs text-muted-foreground">{cards.length}</span>
        <Button
          variant="ghost"
          size="icon-xs"
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
          title="删除列"
          aria-label="删除列"
        >
          <IMore className="size-3.5" />
        </Button>
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
            className="w-full resize-none"
          />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdding(true)}
            className="w-full justify-start text-xs text-muted-foreground"
          >
            + 添加卡
          </Button>
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
      className="cursor-pointer rounded-3xl border border-border bg-card px-3 py-2.5 text-start shadow-sm transition-colors hover:border-ring/40"
    >
      <div className="text-sm leading-snug text-card-foreground">
        <MentionedText text={card.title} byId={byId} />
      </div>
      {(card.assigneeId || card.mentions.length > 0 || card.commentCount > 0) && (
        <div className="mt-2 flex items-center gap-2">
          {assignee && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <AvatarMini p={assignee} size={18} />
              <span>{assignee.name}</span>
            </span>
          )}
          {card.mentions.length > 0 && !card.assigneeId && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <IAt className="w-3 h-3" />
              {card.mentions.slice(0, 3).map((m) => '@' + (byId[m]?.name ?? m)).join(' ')}
            </span>
          )}
          {card.commentCount > 0 && (
            <span className="ms-auto text-xs text-muted-foreground">{card.commentCount} 💬</span>
          )}
        </div>
      )}
    </article>
  )
}
