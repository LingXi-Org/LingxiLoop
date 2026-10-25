import { useEffect, useId, useRef, useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { userFacingError } from '@/lib/userFacingError'
import { contentLinks, ForumContentFields } from '../forum/ForumContentFields'
import { contentDraftSchema, emptyContent, useForumDraft } from '../forum/useForumDraft'
import { HomeworkDraftCard } from './HomeworkDraftCard'
import { homeworkApi } from './api'

const draftSchema=contentDraftSchema.extend({ title:z.string().max(200),criteria:z.string().max(10000),dueAt:z.string().max(40),creationId:z.uuid(),homeworkId:z.uuid().nullable() })

// Keyed by account + company + course at the caller. This is the same Homework
// lifecycle as assistant-created drafts, with no conversation or model required
// to enter the form. The existing validation and human publish gates still apply.
export function HomeworkComposer({ courseId,onClose,onPublished,onBusyChange }: { courseId:string;onClose():void;onPublished():void;onBusyChange?(busy:boolean):void }) {
  const id=useId(),titleInput=useRef<HTMLInputElement>(null),mounted=useRef(true),saving=useRef(false)
  const {draft,setDraft,discard,storageError}=useForumDraft(`create-homework:${courseId}`,draftSchema,{...emptyContent,title:'',criteria:'',dueAt:'',creationId:crypto.randomUUID(),homeworkId:null})
  const [busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState('')
  useEffect(()=>{mounted.current=true;titleInput.current?.focus();return()=>{mounted.current=false}},[])
  const disabled=busy||uploading
  useEffect(() => { onBusyChange?.(disabled); return () => onBusyChange?.(false) }, [disabled, onBusyChange])
  const published=()=>{discard();onPublished()}
  return <section aria-label="创建课程作业" className="space-y-4 rounded-lg border bg-card p-4">
    <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">创建课程作业</h2><Button type="button" variant="ghost" disabled={disabled} onClick={onClose}>返回论坛</Button></div>
    {draft.homeworkId ? <HomeworkDraftCard courseId={courseId} homeworkId={draft.homeworkId} readOnly={false} preparing={false} onViewForum={published} /> : <form className="space-y-4" onSubmit={async event=>{
      event.preventDefault()
      if(disabled||saving.current)return
      saving.current=true;setBusy(true);setError('')
      try {
        const detail=await homeworkApi.createDraft(courseId,draft.creationId,{title:draft.title,instructions:draft.body,editorDocument:draft.editorDocument,
          criteria:draft.criteria.split('\n').map(value=>value.trim()).filter(Boolean),links:contentLinks(draft.links),attachments:draft.attachments,dueAt:draft.dueAt?new Date(draft.dueAt).toISOString():null})
        // The stable creation ID is already in the scoped local draft. A late
        // receipt must not overwrite a newer instance's edits after navigation.
        if(mounted.current)setDraft(previous=>({...previous,homeworkId:detail.homework.id}))
      } catch(reason){if(mounted.current)setError(userFacingError(reason,'草稿未能保存，输入和附件已保留，请重试。'))}
      finally{saving.current=false;if(mounted.current)setBusy(false)}
    }}>
      <p className="text-sm text-muted-foreground">填写要求与验收标准，保存后检查草稿并确认发布。学生仅能看到已发布的作业。</p>
      <div className="space-y-2"><Label htmlFor={`${id}-title`}>作业标题</Label><Input ref={titleInput} id={`${id}-title`} value={draft.title} required maxLength={200} disabled={disabled} onChange={event=>setDraft(previous=>({...previous,title:event.target.value}))}/></div>
      <ForumContentFields label="作业要求" body={draft.body} editorDocument={draft.editorDocument} setBody={(body,editorDocument)=>setDraft(previous=>({...previous,body,editorDocument}))}
        links={draft.links} setLinks={links=>setDraft(previous=>({...previous,links}))} attachments={draft.attachments} setAttachments={attachments=>setDraft(previous=>({...previous,attachments}))} disabled={disabled} onUploading={setUploading}/>
      <div className="space-y-2"><Label htmlFor={`${id}-criteria`}>验收标准</Label><Textarea id={`${id}-criteria`} className="min-h-24" value={draft.criteria} required maxLength={10000} disabled={disabled} onChange={event=>setDraft(previous=>({...previous,criteria:event.target.value}))}/><p className="text-xs text-muted-foreground">每行一条标准，最多 20 条。</p></div>
      <div className="space-y-2"><Label htmlFor={`${id}-due`}>截止时间（可选）</Label><Input id={`${id}-due`} className="max-w-xs" type="datetime-local" value={draft.dueAt} disabled={disabled} onChange={event=>setDraft(previous=>({...previous,dueAt:event.target.value}))}/></div>
      {error&&<div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button type="button" variant="outline" disabled={disabled} onClick={async()=>{
        setBusy(true)
        try{const detail=await homeworkApi.detail(courseId,draft.creationId);if(mounted.current)setDraft(previous=>({...previous,homeworkId:detail.homework.id}))}
        catch(reason){if(mounted.current)setError(userFacingError(reason,'暂未找到已保存草稿，请保留输入并重试保存。'))}
        finally{if(mounted.current)setBusy(false)}
      }}>找回已保存草稿</Button><p className="text-xs">找回后显示服务器保存的内容。</p></div>}
      {storageError&&<p role="status" className="text-sm text-destructive">本地草稿保存失败，请先复制内容。</p>}
      <Button type="submit" disabled={disabled||!draft.title.trim()||!draft.body.trim()||!draft.criteria.trim()}>{busy?'保存中…':'保存并检查草稿'}</Button>
    </form>}
  </section>
}
