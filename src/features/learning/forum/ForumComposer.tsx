import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { knowledgeApi } from '@/features/knowledge/api'
import type { KnowledgeSource } from '@/features/knowledge/contracts'
import { userFacingError } from '@/lib/userFacingError'
import type { LearningSpace } from '../contracts'
import { forumApi } from './api'
import type { ForumAttachment } from './contracts'
import { contentLinks, ForumContentFields } from './ForumContentFields'

export function ForumComposer({ space, onCreated, onCancel }: { space: LearningSpace; onCreated(): void; onCancel(): void }) {
  const [kind, setKind] = useState<'share' | 'resource' | 'case'>('share')
  const [title, setTitle] = useState(''), [body, setBody] = useState(''), [tags, setTags] = useState(''), [links, setLinks] = useState('')
  const [attachments, setAttachments] = useState<ForumAttachment[]>([])
  const [sourceId, setSourceId] = useState('none'), [sources, setSources] = useState<KnowledgeSource[]>([])
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
      onCreated()
    } catch (reason) { setError(userFacingError(reason, '内容发布失败，请重试。')) }
    finally { setBusy(false) }
  }}>
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="forum-post-title">内容标题</Label><Input autoFocus id="forum-post-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} required disabled={disabled} /></div>
      <div className="space-y-2"><Label htmlFor="forum-post-kind">内容类型</Label><Select value={kind} onValueChange={value => setKind(value as typeof kind)} disabled={disabled}><SelectTrigger id="forum-post-kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="share">普通分享</SelectItem><SelectItem value="resource">资料</SelectItem><SelectItem value="case">作品案例</SelectItem></SelectContent></Select></div>
    </div>
    <ForumContentFields body={body} setBody={setBody} links={links} setLinks={setLinks} attachments={attachments} setAttachments={setAttachments} disabled={disabled} onUploading={setUploading} />
    <div className="space-y-2"><Label htmlFor="forum-post-tags">标签</Label><Input id="forum-post-tags" value={tags} onChange={event => setTags(event.target.value)} placeholder="用逗号分隔，最多 10 个" disabled={disabled} /></div>
    <div className="space-y-2"><Label htmlFor="forum-post-source">引用课程公共资料</Label><Select value={sourceId} onValueChange={setSourceId} disabled={disabled}><SelectTrigger id="forum-post-source" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">不引用资料</SelectItem>{sources.map(source => <SelectItem key={source.id} value={source.id}>{source.title}</SelectItem>)}</SelectContent></Select></div>
    <p className="text-xs text-muted-foreground">发布后本课程师生可见。作业请使用“提交作业”，提交内容仅你和本课程教师可见。</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={disabled} onClick={onCancel}>取消</Button><Button type="submit" disabled={disabled || !title.trim()}>{uploading ? '上传中…' : busy ? '发布中…' : '发布'}</Button></div>
  </form>
}
