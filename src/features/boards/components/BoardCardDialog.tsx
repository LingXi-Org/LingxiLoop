import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { AvatarMini } from '@/components/Avatar'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useParticipants } from '@/features/agents/state'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { toastAction } from '@/lib/actionToast'
import { useMe } from '@/stores/auth'
import type { Participant } from '@/types'
import type { BoardCard, BoardCardComment, BoardColumn } from '../contracts'
import { useBoards } from '../state'
import { hasLinkedReference, MentionedText, MentionInput } from './BoardMentions'

const EMPTY_COMMENTS: BoardCardComment[] = []

interface BoardCardDialogProps {
  boardId: string
  card: BoardCard
  columns: BoardColumn[]
  onClose(): void
}

export function BoardCardDialog({ boardId, card, columns, onClose }: BoardCardDialogProps) {
  const byId = useParticipants((state) => state.byId)
  const meId = useMe()
  const patchCard = useBoards((state) => state.patchCard)
  const deleteCard = useBoards((state) => state.deleteCard)
  const loadComments = useBoards((state) => state.loadComments)
  const addComment = useBoards((state) => state.addComment)
  const commentsRaw = useBoards((state) => state.comments[card.id])
  const commentsLoading = useBoards((state) => state.loadingCommentCardIds.has(card.id))
  const commentError = useBoards((state) => state.commentErrors[card.id] ?? null)
  const comments = commentsRaw ?? EMPTY_COMMENTS
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description ?? '')
  const [draftComment, setDraftComment] = useState('')
  const [posting, setPosting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setTitle(card.title)
    setDescription(card.description ?? '')
  }, [card.id, card.title, card.description])

  useEffect(() => {
    void loadComments(boardId, card.id)
  }, [boardId, card.id, loadComments])

  async function saveTitle(): Promise<void> {
    const next = title.trim()
    if (!next || next === card.title) return
    try {
      await toastAction(patchCard(boardId, card.id, { title: next }), {
        loading: '正在保存卡片标题',
        success: '卡片标题已保存',
        error: '保存卡片标题失败',
      })
    } catch (error) {
      console.warn('[boards] save card title failed', error)
    }
  }

  async function saveDescription(): Promise<void> {
    const next = description.trim()
    if (next === (card.description ?? '')) return
    try {
      await toastAction(patchCard(boardId, card.id, { description: next }), {
        loading: '正在保存卡片说明',
        success: '卡片说明已保存',
        error: '保存卡片说明失败',
      })
    } catch (error) {
      console.warn('[boards] save card description failed', error)
    }
  }

  async function moveToColumn(columnId: string): Promise<void> {
    if (columnId === card.columnId) return
    try {
      await toastAction(patchCard(boardId, card.id, { columnId }), {
        loading: '正在移动卡片',
        success: '卡片已移动',
        error: '移动卡片失败',
      })
    } catch (error) {
      console.warn('[boards] move card failed', error)
    }
  }

  async function setAssignee(assigneeId: string | null): Promise<void> {
    try {
      await toastAction(patchCard(boardId, card.id, { assigneeId }), {
        loading: '正在更新负责人',
        success: '负责人已更新',
        error: '更新负责人失败',
      })
    } catch (error) {
      console.warn('[boards] update card assignee failed', error)
    }
  }

  async function postComment(): Promise<void> {
    const body = draftComment.trim()
    if (!body || posting) return
    setPosting(true)
    try {
      await toastAction(addComment(boardId, card.id, body), {
        loading: '正在发表评论',
        success: '评论已发表',
        error: '发表评论失败',
      })
      setDraftComment('')
    } catch (error) {
      console.warn('[boards] post card comment failed', error)
    } finally {
      setPosting(false)
    }
  }

  function closeDialog(): void {
    void saveTitle()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !deleting) closeDialog() }}>
      <DialogContent className="flex max-h-[min(85vh,48rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5 pe-16">
          <DialogTitle className="sr-only">编辑卡片：{card.title}</DialogTitle>
          <DialogDescription className="sr-only">
            编辑卡片标题、栏目、负责人、说明和评论。
          </DialogDescription>
          <MentionInput
            value={title}
            onChange={setTitle}
            onSubmit={() => void saveTitle()}
            placeholder="卡片标题 — @提及任何人"
            className="-ms-2 border-transparent bg-transparent px-2 text-xl font-semibold text-foreground placeholder:text-muted-foreground focus:border-ring focus:bg-background"
          />
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 px-6 py-5">
          <section className="grid gap-4 sm:grid-cols-2">
            <Field label="栏目">
              <Select value={card.columnId} onValueChange={(columnId) => void moveToColumn(columnId)}>
                <SelectTrigger aria-label="栏目"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {columns.map((column) => (
                    <SelectItem key={column.id} value={column.id}>{column.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="负责人">
              <AssigneePicker
                value={card.assigneeId}
                onChange={(id) => void setAssignee(id)}
                meId={meId}
              />
            </Field>
          </section>

          <Field label="说明">
            <MentionInput
              value={description}
              onChange={setDescription}
              onSubmit={() => void saveDescription()}
              placeholder="描述这张卡片；可使用 @ 提及成员"
              multiline
              rows={4}
            />
            {hasLinkedReference(description) && (
              <div className="whitespace-pre-wrap text-sm text-foreground">
                <MentionedText text={description} byId={byId} />
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => void saveDescription()}>
                保存说明
              </Button>
            </div>
          </Field>

          <Field label={`评论${comments.length > 0 ? ` · ${comments.length}` : ''}`}>
            {commentsRaw === undefined && !commentError ? (
              <ResourceSkeleton variant="list" count={3} compact label="正在加载卡片评论" />
            ) : (
              <>
                {commentError && (
                  <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-3xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <span>评论加载失败，请重试。</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={commentsLoading}
                      onClick={() => void loadComments(boardId, card.id)}
                    >
                      重试
                    </Button>
                  </div>
                )}
                <ul className="space-y-3">
                  {comments.map((comment) => {
                    const author = byId[comment.authorId]
                    return (
                      <li key={comment.id} className="flex items-start gap-3">
                        {author
                          ? <AvatarMini p={author} size={26} />
                          : <span className="size-7 shrink-0 rounded-full bg-muted" />}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="text-sm font-medium text-foreground">
                              {author?.name ?? comment.authorId}
                            </span>
                            <span className="text-xs text-muted-foreground">{formatTime(comment.createdAt)}</span>
                          </div>
                          <div className="whitespace-pre-wrap text-sm text-foreground">
                            <MentionedText text={comment.body} byId={byId} />
                          </div>
                        </div>
                      </li>
                    )
                  })}
                  {comments.length === 0 && (
                    <li className="text-sm text-muted-foreground">还没有评论。</li>
                  )}
                </ul>
              </>
            )}
            <MentionInput
              value={draftComment}
              onChange={setDraftComment}
              onSubmit={() => void postComment()}
              placeholder="发表评论；⌘/Ctrl + Enter 发送"
              multiline
              rows={2}
            />
            <div className="flex justify-end">
              <Button
                onClick={() => void postComment()}
                disabled={!draftComment.trim() || posting}
              >
                发表评论
              </Button>
            </div>
          </Field>
          </div>
        </ScrollArea>

        <DialogFooter className="items-center justify-between border-t border-border px-6 py-4 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {formatTime(card.createdAt)} · {byId[card.createdBy]?.name ?? card.createdBy}
          </span>
          <Button
            variant="destructive"
            size="sm"
            disabled={deleting}
            onClick={async () => {
              if (deleting) return
              if (!await confirmSensitiveAction({
                title: '删除卡片？',
                description: `“${card.title}”将被永久删除。`,
                confirmLabel: '删除卡片',
                tone: 'destructive',
              })) return
              setDeleting(true)
              try {
                await toastAction(deleteCard(boardId, card.id), {
                  loading: '正在删除卡片',
                  success: '卡片已删除',
                  error: '删除卡片失败',
                })
                onClose()
              } catch (error) {
                console.warn('[boards] delete card failed', error)
              } finally {
                setDeleting(false)
              }
            }}
          >
            删除卡片
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
      {children}
    </section>
  )
}

function AssigneePicker({ value, onChange, meId }: {
  value: string | null
  onChange(id: string | null): void
  meId: string | null
}) {
  const byId = useParticipants((state) => state.byId)
  const [open, setOpen] = useState(false)
  const everyone = useMemo(() => Object.values(byId)
    .filter((participant) => !participant.departedAt && !participant.managed)
    .sort((left, right) => {
      if (left.id === meId) return -1
      if (right.id === meId) return 1
      if (left.kind !== right.kind) return left.kind === 'human' ? -1 : 1
      return left.name.localeCompare(right.name)
    }), [byId, meId])
  const selected = value ? everyone.find((participant) => participant.id === value) ?? null : null
  const options = useMemo(() => [
    { id: null, label: '未分配', meta: '', participant: null as Participant | null },
    ...everyone.map((participant) => ({
      id: participant.id,
      label: participant.name,
      meta: participant.kind === 'agent' ? 'Agent' : participant.id === meId ? '你' : '成员',
      participant,
    })),
  ], [everyone, meId])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected
              ? <AvatarMini p={selected} size={22} />
              : <span className="size-5 rounded-full bg-muted" />}
            <span className="truncate">{selected?.name ?? '未分配'}</span>
          </span>
          <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] gap-0 p-0">
        <Command>
          <CommandInput placeholder="搜索负责人…" />
          <CommandList>
            <CommandEmpty>没有匹配的成员。</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option.id ?? 'unassigned'}
                value={`${option.label} ${option.meta} ${option.id ?? ''}`}
                data-checked={option.id === value}
                onSelect={() => {
                  onChange(option.id)
                  setOpen(false)
                }}
              >
                {option.participant
                  ? <AvatarMini p={option.participant} size={22} />
                  : <span className="size-5 rounded-full bg-muted" />}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.meta && <span className="text-xs text-muted-foreground">{option.meta}</span>}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
}
