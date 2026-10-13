import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { TypesetMarkdown } from '@/components/Typeset'
import { userFacingError } from '@/lib/userFacingError'
import { forumApi } from './api'
import type { ForumComment, ForumItem } from './contracts'
import { ForumFiles } from './ForumContentFields'

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
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><DialogTitle>{item.title}</DialogTitle><DialogDescription>本课程讨论</DialogDescription></DialogHeader>
    <TypesetMarkdown content={item.body} preset="document" />
    <ForumFiles links={item.links} attachments={item.attachments} />
    <section aria-label="评论" className="w-full space-y-4 border-t pt-4">
      {comments.length === 0 && !busy && <p className="text-sm text-muted-foreground">还没有评论。</p>}
      {comments.map(comment => <div key={comment.id} className="min-w-0 space-y-1 border-b pb-3"><p className="flex flex-wrap gap-2 text-xs text-muted-foreground"><span>{comment.authorName}</span><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time></p><TypesetMarkdown content={comment.body} preset="document" /></div>)}
      {nextOffset !== null && <div className="flex justify-center"><Button variant="outline" disabled={busy} onClick={() => void load(nextOffset)}>更多评论</Button></div>}
      {canWrite && <form className="space-y-2" onSubmit={async event => {
        event.preventDefault()
        if (busy || !body.trim()) return
        setBusy(true); setError('')
        try { await forumApi.comment(courseId,item,body); setBody(''); onComment(); await load() }
        catch (reason) { setError(userFacingError(reason, '评论发送失败，请重试。')) }
        finally { setBusy(false) }
      }}><Label htmlFor="forum-comment-body">发表评论</Label><Textarea id="forum-comment-body" value={body} onChange={event => setBody(event.target.value)} maxLength={10000} disabled={busy} /><Button type="submit" disabled={busy || !body.trim()}>发送评论</Button></form>}
      {error && <p role="alert" className="text-sm text-destructive">{error}<Button variant="link" onClick={() => void load()} disabled={busy}>重试</Button></p>}
    </section>
  </DialogContent></Dialog>
}
