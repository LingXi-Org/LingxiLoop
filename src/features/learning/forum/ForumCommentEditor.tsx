// Memos MemoCommentSection edit-in-place adapter, pinned source in memos/README.md.
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { userFacingError } from '@/lib/userFacingError'
import { forumApi } from './api'
import type { ForumComment, ForumItem } from './contracts'
import { contentLinks, ForumContentFields } from './ForumContentFields'
import { contentDraftSchema, useForumDraft } from './useForumDraft'

export function ForumCommentEditor({courseId,item,comment,onSaved,onClose}:{courseId:string;item:ForumItem;comment:ForumComment;onSaved():void;onClose():void}) {
  const {draft,setDraft,discard,storageError}=useForumDraft(`comment-edit:${courseId}:${item.id}:${comment.id}`,contentDraftSchema,{body:comment.body,links:comment.links.join('\n'),attachments:comment.attachments})
  const [busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState('')
  return <form className="w-full space-y-3" onSubmit={async event=>{event.preventDefault();if(busy||uploading)return;setBusy(true);try{await forumApi.editComment(courseId,item,comment.id,{...draft,links:contentLinks(draft.links)});discard();onSaved()}catch(reason){setError(userFacingError(reason,'保存失败，草稿已保留。'))}finally{setBusy(false)}}}>
    <ForumContentFields label="编辑评论" {...draft} setBody={body=>setDraft(p=>({...p,body}))} setLinks={links=>setDraft(p=>({...p,links}))} setAttachments={attachments=>setDraft(p=>({...p,attachments}))} disabled={busy||uploading} onUploading={setUploading}/>
    {storageError&&<p role="status">本地草稿保存失败，请复制内容。</p>}{error&&<p role="alert">{error}</p>}
    <Button type="button" variant="ghost" onClick={onClose}>收起编辑</Button><Button type="submit" disabled={busy||uploading}>保存评论</Button>
  </form>
}
