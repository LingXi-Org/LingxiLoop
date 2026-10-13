import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectField } from '@/components/ui/select-field'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { knowledgeApi } from '@/features/knowledge/api'
import type { KnowledgeSource } from '@/features/knowledge/contracts'
import { userFacingError } from '@/lib/userFacingError'
import type { LearningSpace } from '../contracts'
import { forumApi } from './api'
import { contentLinks, ForumContentFields } from './ForumContentFields'
import { composerDraftSchema, emptyContent, useForumDraft } from './useForumDraft'

export function ForumComposer({ space, onCreated, onCancel }: { space: LearningSpace; onCreated(): void; onCancel(): void }) {
  const { draft, setDraft, discard, storageError } = useForumDraft(`post:${space.courseId}`, composerDraftSchema,
    { ...emptyContent, kind: 'share' as const, title: '', tags: '', sourceId: 'none' })
  const { kind, title, body, tags, links, attachments, sourceId } = draft
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void knowledgeApi.listProjectSources(space.projectId).then(value => {
      if (active) setSources(value.filter(source => source.visibilityScope === 'PROJECT'))
    }).catch(() => { if (active) setError('公共资料暂时无法加载，可稍后重试引用。') })
    return () => { active = false }
  }, [space.projectId])
  const disabled = busy || uploading
  return <form className="space-y-4 rounded-lg border bg-card p-4" aria-label="发布论坛内容" onSubmit={async event => {
    event.preventDefault()
    if (disabled || !space.courseId) return
    setBusy(true); setError('')
    try {
      await forumApi.create(space.courseId, { kind,title,body,tags: tags.split(/[,，]/).map(tag => tag.trim()).filter(Boolean),
        links: contentLinks(links),attachments,...(sourceId !== 'none' ? { sourceId } : {}) })
      discard(); toast.success('内容已发布'); onCreated()
    } catch (reason) { setError(userFacingError(reason, '内容发布失败，请重试。')) }
    finally { setBusy(false) }
  }}>
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="forum-post-title">内容标题</Label><Input autoFocus id="forum-post-title" value={title} onChange={event => setDraft(previous => ({ ...previous, title: event.target.value }))} maxLength={200} required disabled={disabled} /></div>
      <div className="space-y-2"><Label htmlFor="forum-post-kind">内容类型</Label><SelectField id="forum-post-kind" ariaLabel="内容类型" value={kind} onValueChange={kind => setDraft(previous => ({ ...previous, kind }))} disabled={disabled} options={[{ value: 'share', label: '普通分享' }, { value: 'resource', label: '资料' }, { value: 'case', label: '作品案例' }]} /></div>
    </div>
    <ForumContentFields body={body} setBody={body => setDraft(previous => ({ ...previous, body }))} links={links} setLinks={links => setDraft(previous => ({ ...previous, links }))}
      attachments={attachments} setAttachments={attachments => setDraft(previous => ({ ...previous, attachments }))} disabled={disabled} onUploading={setUploading} tags={tags.split(/[,，]/).map(tag => tag.trim()).filter(Boolean)} />
    <div className="space-y-2"><Label htmlFor="forum-post-tags">标签</Label><Input id="forum-post-tags" value={tags} onChange={event => setDraft(previous => ({ ...previous, tags: event.target.value }))} placeholder="用逗号分隔，最多 10 个" disabled={disabled} /></div>
    <div className="space-y-2"><Label htmlFor="forum-post-source">引用课程公共资料</Label><SelectField id="forum-post-source" ariaLabel="引用课程公共资料" value={sourceId} onValueChange={sourceId => setDraft(previous => ({ ...previous, sourceId }))} disabled={disabled} options={[{ value: 'none', label: '不引用资料' }, ...sources.map(source => ({ value: source.id, label: source.title }))]} /></div>
    <p className="text-xs text-muted-foreground">发布后本课程师生可见。作业请使用“提交作业”，提交内容仅你和本课程教师可见。</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {storageError && <p role="status" className="text-sm text-destructive">无法保存本地草稿，请先复制内容再关闭。</p>}
    <div className="flex flex-wrap items-center justify-end gap-2"><span className="me-auto text-xs text-muted-foreground">草稿保存在此设备，保留 7 天</span>
      <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="ghost" disabled={disabled}>丢弃草稿</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>丢弃这份草稿？</AlertDialogTitle><AlertDialogDescription>尚未发布的正文与附件引用将被清除。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>继续编辑</AlertDialogCancel><AlertDialogAction onClick={() => { discard(); onCancel() }}>丢弃草稿</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <Button type="button" variant="outline" disabled={disabled} onClick={onCancel}>稍后继续</Button><Button type="submit" disabled={disabled || !title.trim()}>{uploading ? '上传中…' : busy ? '发布中…' : '发布'}</Button></div>
  </form>
}
