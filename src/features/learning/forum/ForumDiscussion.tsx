import { MessageCircleIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { userFacingError } from '@/lib/userFacingError'
import { forumApi } from './api'
import type { ForumComment, ForumItem } from './contracts'
import { ForumFiles } from './ForumContentFields'
import { MemoCard } from './memos/MemoCard'
import { MemoContent } from './memos/MemoContent'
import { Button, Label, Textarea } from './memos/MemoControls'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './memos/MemoDialog'

// The content/comment stack and load-more row adapt Memos MemoCommentSection; see memos/README.md.
export function ForumDiscussion({ courseId, item, canWrite, onClose, onComment }: {
  courseId: string; item: ForumItem; canWrite: boolean; onClose(): void; onComment(): void
}) {
  const [comments, setComments] = useState<ForumComment[]>([]), [nextOffset, setNextOffset] = useState<number | null>(null)
  const [body, setBody] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
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
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent>
    <DialogHeader><DialogTitle>{item.title}</DialogTitle><DialogDescription>本课程讨论</DialogDescription></DialogHeader>
    <MemoCard label={item.title} author={item.authorName} createdAt={item.createdAt} pinned={item.pinned}>
      <MemoContent content={item.body} />
      <ForumFiles links={item.links} attachments={item.attachments} />
    </MemoCard>
    <section data-memo-comments-section aria-label="评论" className="pt-8 pb-4 w-full">
      <div className="flex items-center gap-1 px-3 mb-3 text-sm text-muted-foreground"><MessageCircleIcon className="size-4" /><h3>评论</h3><span>（{Math.max(item.commentCount, comments.length)}）</span></div>
      <div className="relative mx-auto w-full flex flex-col items-start gap-y-1">
      {comments.length === 0 && !busy && <p className="text-sm text-muted-foreground">还没有评论。</p>}
      {comments.map(comment => <MemoCard key={comment.id} label={`${comment.authorName}的评论`} author={comment.authorName} createdAt={comment.createdAt}><MemoContent content={comment.body} /></MemoCard>)}
      {nextOffset !== null && <div className="flex justify-center"><Button variant="outline" disabled={busy} onClick={() => void load(nextOffset)}>更多评论</Button></div>}
      {canWrite && <form className="w-full mt-3 space-y-2" onSubmit={async event => {
        event.preventDefault()
        if (busy || !body.trim()) return
        setBusy(true); setError('')
        try { await forumApi.comment(courseId,item,body); setBody(''); onComment(); await load() }
        catch (reason) { setError(userFacingError(reason, '评论发送失败，请重试。')) }
        finally { setBusy(false) }
      }}><Label htmlFor="forum-comment-body">发表评论</Label><Textarea id="forum-comment-body" value={body} onChange={event => setBody(event.target.value)} maxLength={10000} disabled={busy} /><Button type="submit" disabled={busy || !body.trim()}>发送评论</Button></form>}
      {error && <p role="alert" className="text-sm text-destructive">{error}<Button variant="link" onClick={() => void load()} disabled={busy}>重试</Button></p>}
      </div>
    </section>
  </DialogContent></Dialog>
}
