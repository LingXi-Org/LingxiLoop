import { useAuth } from '@/stores/auth'
import { ForumCommentEditor } from './ForumCommentEditor'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
import { MessageCircleIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { userFacingError } from '@/lib/userFacingError'
import { forumApi } from './api'
import type { ForumComment, ForumItem } from './contracts'
import { contentLinks, ForumContentFields, ForumFiles } from './ForumContentFields'
import { MemoCard } from './memos/MemoCard'
import { MemoContent } from './memos/MemoContent'
import { contentDraftSchema, emptyContent, useForumDraft } from './useForumDraft'

// The content/comment stack and load-more row adapt Memos MemoCommentSection; see memos/README.md.
export function ForumDiscussion({ courseId, item, canWrite, canManage, onComment }: {
  courseId: string; item: ForumItem; canWrite: boolean; canManage: boolean; onComment(): void
}) {
  const userId=useAuth(state=>state.user?.id)
  const [editing,setEditing]=useState<string | null>(null),[deleting,setDeleting]=useState<string | null>(null)
  const [comments, setComments] = useState<ForumComment[]>([]), [nextOffset, setNextOffset] = useState<number | null>(null)
  const { draft, setDraft, discard, storageError } = useForumDraft(`comment:${courseId}:${item.targetType}:${item.id}`, contentDraftSchema, emptyContent, canWrite)
  const { body, links, attachments } = draft
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const editor = useRef<HTMLFormElement>(null)
  useEffect(() => { if (showEditor) editor.current?.querySelector<HTMLElement>('.cm-content')?.focus() }, [showEditor])
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
  return <section data-memo-comments-section aria-label="评论" className="pt-8 pb-16 w-full">
      <h3 className="sr-only">评论</h3>
      <div className="relative mx-auto w-full flex flex-col items-start gap-y-1">
      {comments.length > 0 ? <div className="flex h-8 w-full items-center justify-between pl-3 mb-2">
        <div className="flex items-center text-sm text-muted-foreground"><MessageCircleIcon className="mr-1 size-5" /><span>评论（{Math.max(item.commentCount,comments.length)}）</span></div>
        {canWrite && !showEditor && <Button variant="ghost" className="text-muted-foreground" onClick={()=>setShowEditor(true)}>写评论</Button>}
      </div> : canWrite && !showEditor && <div className="flex w-full justify-center py-6"><Button variant="ghost" className="text-muted-foreground" onClick={()=>setShowEditor(true)}>写评论<MessageCircleIcon className="ml-2 size-5"/></Button></div>}
      {canWrite && showEditor && <form ref={editor} className="w-full mb-2 space-y-2" onSubmit={async event => {
        event.preventDefault()
        if (disabled || !body.trim() && !links.trim() && !attachments.length) return
        setBusy(true); setError('')
        try { await forumApi.comment(courseId,item,{ body, links: contentLinks(links), attachments }); setDraft(emptyContent); discard(); setShowEditor(false); onComment(); await load() }
        catch (reason) { setError(userFacingError(reason, '评论发送失败，请重试。')) }
        finally { setBusy(false) }
      }}><ForumContentFields label="发表评论" maxLength={10000} body={body} setBody={body => setDraft(previous => ({ ...previous, body }))}
        links={links} setLinks={links => setDraft(previous => ({ ...previous, links }))} attachments={attachments} setAttachments={attachments => setDraft(previous => ({ ...previous, attachments }))}
        disabled={disabled} onUploading={setUploading} />
        {storageError && <p role="status" className="text-sm text-destructive">无法保存本地草稿，请先复制内容再关闭。</p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" type="button" disabled={disabled} onClick={()=>setShowEditor(false)}>取消</Button><Button type="submit" disabled={disabled || !body.trim() && !links.trim() && !attachments.length}>{uploading ? '上传中…' : '发送评论'}</Button></div></form>}
      {comments.map(comment => <MemoCard key={comment.id} label={`${comment.authorName}的评论`} author={comment.authorName} authorId={comment.authorId} authorAvatarUrl={comment.authorAvatarUrl} createdAt={comment.createdAt}
        actions={<>{item.targetType==='post'&&canWrite&&comment.authorId===userId&&<Button variant="ghost" size="sm" onClick={()=>setEditing(comment.id)}>编辑评论</Button>}{item.targetType==='post'&&canWrite&&(canManage||comment.authorId===userId)&&<Button variant="ghost" size="sm" onClick={()=>setDeleting(comment.id)}>删除评论</Button>}</>}>
        {editing===comment.id ? <ForumCommentEditor courseId={courseId} item={item} comment={comment} onSaved={()=>{setEditing(null);void load();onComment()}} onClose={()=>setEditing(null)}/> : <><MemoContent content={comment.body}/><ForumFiles links={comment.links} attachments={comment.attachments}/></>}
      </MemoCard>)}
      <AlertDialog open={Boolean(deleting)} onOpenChange={open=>{if(!open)setDeleting(null)}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除这条评论？</AlertDialogTitle><AlertDialogDescription>删除后不再显示在讨论中。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={()=>{if(deleting)void forumApi.deleteComment(courseId,item,deleting).then(()=>{onComment();return load()}).catch(reason=>setError(userFacingError(reason,'删除失败。')));setDeleting(null)}}>确认删除评论</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      {nextOffset !== null && <div className="flex w-full justify-center mt-4"><Button variant="outline" className="rounded-full px-4" disabled={busy} onClick={() => void load(nextOffset)}>更多评论</Button></div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}<Button variant="link" onClick={() => void load()} disabled={busy}>重试</Button></p>}
      </div>
    </section>
}
