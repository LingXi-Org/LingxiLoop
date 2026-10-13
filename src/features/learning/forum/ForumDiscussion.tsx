import { MessageCircleIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { userFacingError } from '@/lib/userFacingError'
import { forumApi } from './api'
import type { ForumComment, ForumItem } from './contracts'
import { contentLinks, ForumContentFields, ForumFiles } from './ForumContentFields'
import { MemoCard } from './memos/MemoCard'
import { MemoContent } from './memos/MemoContent'
import { contentDraftSchema, emptyContent, useForumDraft } from './useForumDraft'

// The content/comment stack and load-more row adapt Memos MemoCommentSection; see memos/README.md.
export function ForumDiscussion({ courseId, item, canWrite, onClose, onComment }: {
  courseId: string; item: ForumItem; canWrite: boolean; onClose(): void; onComment(): void
}) {
  const [comments, setComments] = useState<ForumComment[]>([]), [nextOffset, setNextOffset] = useState<number | null>(null)
  const { draft, setDraft, discard, storageError } = useForumDraft(`comment:${courseId}:${item.targetType}:${item.id}`, contentDraftSchema, emptyContent, canWrite)
  const { body, links, attachments } = draft
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState('')
  const returnFocus = useRef(document.activeElement)
  const titleFocus = useRef<HTMLHeadingElement>(null)
  const load = useCallback(async (offset = 0) => {
    setBusy(true); setError('')
    try {
      const result = await forumApi.comments(courseId, item, offset)
      setComments(previous => offset ? [...previous,...result.items] : result.items)
      setNextOffset(result.nextOffset)
    } catch (reason) { setError(userFacingError(reason, '评论加载失败，请重试。')) }
    finally { setBusy(false) }
  }, [courseId,item])
  useEffect(() => { void load() }, [load])
  const disabled = busy || uploading
  return <Dialog open onOpenChange={open => { if (!open && !uploading) onClose() }}><DialogContent className="sm:max-w-3xl" onOpenAutoFocus={event => { event.preventDefault(); titleFocus.current?.focus() }} onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus() }}>
    <DialogHeader><DialogTitle ref={titleFocus} tabIndex={-1} className="outline-none">{item.title}</DialogTitle><DialogDescription>本课程讨论</DialogDescription></DialogHeader>
    <MemoCard label={item.title} author={item.authorName} createdAt={item.createdAt} pinned={item.pinned}>
      <MemoContent content={item.body} />
      <ForumFiles links={item.links} attachments={item.attachments} />
    </MemoCard>
    <section data-memo-comments-section aria-label="评论" className="pt-8 pb-4 w-full">
      <div className="flex items-center gap-1 px-3 mb-3 text-sm text-muted-foreground"><MessageCircleIcon className="size-4" /><h3>评论</h3><span>（{Math.max(item.commentCount, comments.length)}）</span></div>
      <div className="relative mx-auto w-full flex flex-col items-start gap-y-1">
      {comments.length === 0 && !busy && <p className="text-sm text-muted-foreground">还没有评论。</p>}
      {comments.map(comment => <MemoCard key={comment.id} label={`${comment.authorName}的评论`} author={comment.authorName} createdAt={comment.createdAt}><MemoContent content={comment.body} /><ForumFiles links={comment.links} attachments={comment.attachments} /></MemoCard>)}
      {nextOffset !== null && <div className="flex justify-center"><Button variant="outline" disabled={busy} onClick={() => void load(nextOffset)}>更多评论</Button></div>}
      {canWrite && <form className="w-full mt-3 space-y-2" onSubmit={async event => {
        event.preventDefault()
        if (disabled || !body.trim() && !links.trim() && !attachments.length) return
        setBusy(true); setError('')
        try { await forumApi.comment(courseId,item,{ body, links: contentLinks(links), attachments }); setDraft(emptyContent); discard(); onComment(); await load() }
        catch (reason) { setError(userFacingError(reason, '评论发送失败，请重试。')) }
        finally { setBusy(false) }
      }}><ForumContentFields label="发表评论" maxLength={10000} body={body} setBody={body => setDraft(previous => ({ ...previous, body }))}
        links={links} setLinks={links => setDraft(previous => ({ ...previous, links }))} attachments={attachments} setAttachments={attachments => setDraft(previous => ({ ...previous, attachments }))}
        disabled={disabled} onUploading={setUploading} />
        {storageError && <p role="status" className="text-sm text-destructive">无法保存本地草稿，请先复制内容再关闭。</p>}
        <Button type="submit" disabled={disabled || !body.trim() && !links.trim() && !attachments.length}>{uploading ? '上传中…' : '发送评论'}</Button></form>}
      {error && <p role="alert" className="text-sm text-destructive">{error}<Button variant="link" onClick={() => void load()} disabled={busy}>重试</Button></p>}
      </div>
    </section>
  </DialogContent></Dialog>
}
