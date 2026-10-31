import { criteriaSource } from '@/features/content-editor/document'
import type { ContentDocument, ContentEditorHandle } from '@/features/content-editor'
import { type ToolCallMessagePartProps, useAuiState } from '@assistant-ui/react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { z } from 'zod'
import { CollapsibleRoot, CollapsibleTrigger, CollapsibleContent } from '@/components/assistant-ui/elements/collapsible-root'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { RunDisplayState } from '@/lib/agentRunSnapshot'
import { userFacingError } from '@/lib/userFacingError'
import { useApp } from '@/stores/app'
import { contentLinks, ForumContentFields, ForumFiles } from '../forum/ForumContentFields'
import { ForumBody } from '../forum/ForumBody'
import { homeworkApi } from './api'
import { canPublishHomeworkDraft, localDeadline, type Homework } from './contracts'
import { HomeworkSuggestions } from './HomeworkSuggestions'
import { HomeworkValidation } from './HomeworkValidation'

const resultSchema = z.object({ value: z.object({ result: z.object({ homeworkId: z.string().min(1), courseId: z.string().min(1) }) }) })

export function HomeworkDraftTool({ result, status, isError, readOnly = false }: ToolCallMessagePartProps & { readOnly?: boolean }) {
  const preparing = useAuiState(state => {
    const run = state.message.metadata.custom.harness as RunDisplayState | undefined
    return state.thread.isRunning || run?.lifecycle === 'queued' || run?.lifecycle === 'leased' || run?.lifecycle === 'waiting'
  })
  const parsed = resultSchema.safeParse(result)
  if (!parsed.success) return <p role="status" className="text-sm text-muted-foreground">{isError || status.type === 'incomplete' ? '作业草稿未能准备好，请让助手重试。' : status.type === 'running' ? '正在整理作业草稿…' : '作业草稿暂时无法查看。'}</p>
  return <HomeworkDraftCard key={parsed.data.value.result.homeworkId} {...parsed.data.value.result} readOnly={readOnly} preparing={preparing} collapsePublished />
}

export function HomeworkDraftCard({ courseId, homeworkId, readOnly, preparing, onViewForum, collapsePublished = false }: { courseId: string; homeworkId: string; readOnly: boolean; preparing: boolean; onViewForum?(): void; collapsePublished?: boolean }) {
  const id = useId()
  const criteriaEditor = useRef<ContentEditorHandle>(null)
  const focusPublished = useRef(false)
  const [publishedExpanded, setPublishedExpanded] = useState(false)
  const [teacherReviewConfirmed, setTeacherReviewConfirmed] = useState(false)
  const [editorDocument,setEditorDocument]=useState<ContentDocument | null>(null)
  const [criteriaItems,setCriteriaItems]=useState<string[]>([])
  const [criteriaDocument,setCriteriaDocument]=useState<ContentDocument | null>(null)
  const [homework, setHomework] = useState<Homework | null>(null)
  const [title, setTitle] = useState(''), [instructions, setInstructions] = useState(''), [criteria, setCriteria] = useState(''), [dueAt, setDueAt] = useState('')
  const [links, setLinks] = useState(''), [attachments, setAttachments] = useState<Homework['attachments']>([])
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState('')
  const pending = useRef<{ revision: number; key: string } | null>(null)
  const rechecking = useRef(false)
  const epoch = useRef(0), dirtyRef = useRef(false)
  const install = useCallback((next: Homework) => {
    epoch.current++; dirtyRef.current = false; setTeacherReviewConfirmed(false)
    setPublishedExpanded(false)
    setHomework(next); setTitle(next.title); setInstructions(next.instructions); setEditorDocument(next.editorDocument ?? null); setCriteria(criteriaSource(next.criteria,next.criteriaDocument)); setCriteriaItems(next.criteria); setCriteriaDocument(next.criteriaDocument ?? null); setDueAt(localDeadline(next.dueAt))
    setLinks(next.links.join('\n')); setAttachments(next.attachments); setDirty(false)
  }, [])
  const load = useCallback(async () => {
    if (dirtyRef.current) return
    const request = ++epoch.current
    try {
      const next = await homeworkApi.detail(courseId, homeworkId)
      if (request === epoch.current) { install(next.homework); setError('') }
    } catch (reason) { if (request === epoch.current) setError(userFacingError(reason, '草稿暂时无法加载，请重试。')) }
  }, [courseId, homeworkId, install])
  useEffect(() => { void load(); return () => { epoch.current++ } }, [load])
  useEffect(() => {
    if (dirty || busy || homework?.validation.status !== 'PENDING') return
    const timer = setInterval(() => { void load() }, 3000)
    return () => clearInterval(timer)
  }, [dirty, busy, homework?.validation.status, load])
  const editingDisabled = uploading || preparing || readOnly || !homework?.canEditDraft
  const disabled = busy || editingDisabled
  const edited = (change: () => void) => { epoch.current++; dirtyRef.current = true; setTeacherReviewConfirmed(false); change(); setDirty(true) }
  const publishedSummary = collapsePublished && homework?.status !== 'DRAFT' ? homework : null
  return <Card aria-label={publishedSummary ? '已发布作业' : '作业草稿'} data-homework-id={homeworkId} size={publishedSummary ? 'sm' : 'default'} className="w-full min-w-0 max-w-2xl [overflow-wrap:anywhere]">
    {publishedSummary ? <CollapsibleRoot open={publishedExpanded} onOpenChange={setPublishedExpanded} className="min-w-0 space-y-4">
      <CardHeader className="min-w-0">
        <Badge variant="secondary">{publishedSummary.status === 'CLOSED' ? '已关闭' : '已发布'}</Badge>
        <CardTitle className="min-w-0">{publishedSummary.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <CollapsibleTrigger aria-expanded={publishedExpanded} aria-controls={`${id}-published`} render={<Button type="button" variant="outline" className="h-auto max-w-full whitespace-normal py-2" ref={node => {
            if (!node || !focusPublished.current) return
            focusPublished.current = false
            // The chat viewport also scrolls focused controls into view. Hand off
            // only within its visible focus area so collapse cannot move a reader.
            const viewport = node.closest('[data-chat-viewport]')
            if (viewport) {
              const area = viewport.getBoundingClientRect(), bounds = node.getBoundingClientRect()
              if (bounds.top < area.top + 28 || bounds.bottom > area.bottom - 28) return
            }
            node.focus({ preventScroll: true })
          }} />}>{publishedExpanded ? '收起已发布作业' : '展开已发布作业'}</CollapsibleTrigger>
          <Button type="button" variant="outline" className="h-auto max-w-full whitespace-normal py-2" onClick={() => onViewForum ? onViewForum() : useApp.getState().setView('forum')}>在论坛查看作业</Button>
        </div>
        <CollapsibleContent id={`${id}-published`} className="min-w-0 space-y-4">
          <section className="space-y-2"><h4 className="text-sm font-medium">作业要求</h4><ForumBody content={publishedSummary.instructions} document={publishedSummary.editorDocument} /></section>
          <section className="space-y-2"><h4 className="text-sm font-medium">验收标准</h4>{publishedSummary.criteriaDocument ? <ForumBody content={criteriaSource(publishedSummary.criteria, publishedSummary.criteriaDocument)} document={publishedSummary.criteriaDocument} /> : <ul className="list-disc space-y-1 ps-5 text-sm">{publishedSummary.criteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul>}</section>
          <ForumFiles links={publishedSummary.links} attachments={publishedSummary.attachments} />
        </CollapsibleContent>
      </CardContent>
    </CollapsibleRoot> : <>
    <CardHeader><CardTitle>作业草稿</CardTitle><CardDescription>确认下面的内容后，作业才会发布到课程论坛。</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {!homework && !error && <p role="status">正在加载草稿…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}{!dirty && <Button variant="link" disabled={busy || uploading} onClick={() => void load()}>重新加载草稿</Button>}</p>}
      {homework && homework.status !== 'DRAFT' ? <>
        <Badge variant="secondary">{homework.status === 'CLOSED' ? '已关闭' : '已发布'}</Badge><h3 className="font-medium">{homework.title}</h3>
        <ForumBody content={homework.instructions} document={homework.editorDocument} />{homework.criteriaDocument ? <ForumBody content={criteriaSource(homework.criteria,homework.criteriaDocument)} document={homework.criteriaDocument}/> : <ul className="list-disc space-y-1 ps-5 text-sm">{homework.criteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul>}
        <ForumFiles links={homework.links} attachments={homework.attachments} /><Button variant="outline" onClick={() => onViewForum ? onViewForum() : useApp.getState().setView('forum')}>在论坛查看作业</Button>
      </> : homework && <form className="space-y-4" onSubmit={async event => {
        event.preventDefault()
        if (disabled || !dirty) return
        epoch.current++; setBusy(true); setError('')
        try { install((await homeworkApi.saveDraft(courseId, homeworkId, { expectedRevision: homework.revision, title, instructions, editorDocument, criteriaDocument, criteria: criteriaItems, links: contentLinks(links), attachments, dueAt: dueAt ? new Date(dueAt).toISOString() : null })).homework) }
        catch (reason) { setError(`${userFacingError(reason, '修改未能保存，请重试。')} 当前输入和附件已保留。`) }
        finally { setBusy(false) }
      }}>
        {preparing && <p role="status" className="text-sm text-muted-foreground">助手正在整理草稿，回复结束后可以编辑并确认发布。</p>}
        <div className="space-y-2"><Label htmlFor={`${id}-title`}>作业标题</Label><Input id={`${id}-title`} value={title} maxLength={200} required disabled={disabled} onChange={event => edited(() => setTitle(event.target.value))} /></div>
        <ForumContentFields label="作业要求" body={instructions} editorDocument={editorDocument} setBody={(value,document) => edited(() => {setInstructions(value);setEditorDocument(document ?? null)})} links={links} setLinks={value => edited(() => setLinks(value))} attachments={attachments} setAttachments={value => edited(() => setAttachments(value))} disabled={disabled} onUploading={setUploading} />
        <section className="space-y-2"><h4 className="text-sm font-medium">验收标准</h4>
          <ForumContentFields editorRef={criteriaEditor} label="验收标准" body={criteria} editorDocument={criteriaDocument} legacyParagraphs={criteriaItems} setBody={(value,document,sections) => edited(() => {setCriteria(value);setCriteriaDocument(document ?? null);setCriteriaItems(sections ?? value.split('\n').filter(Boolean))})} links={links} setLinks={value => edited(() => setLinks(value))} attachments={attachments} setAttachments={value => edited(() => setAttachments(value))} disabled={disabled} onUploading={setUploading} nativeOnly maxLength={10000}/>
          <p className="text-xs text-muted-foreground">每段一条标准，最多 20 条；保存后按标准核验作答。</p>
        </section>
        <div className="space-y-2"><Label htmlFor={`${id}-due`}>截止时间</Label><Input id={`${id}-due`} className="max-w-xs" type="datetime-local" value={dueAt} disabled={disabled} onChange={event => edited(() => setDueAt(event.target.value))} /></div>
        <HomeworkSuggestions key={homework.revision} findings={homework.validation.findings ?? []} criteria={criteriaItems} busy={disabled}
          onApply={(finding, replacement) => {
            if (disabled || finding.criterionIndex === null || criteriaItems[finding.criterionIndex] !== finding.original) return
            if (!criteriaEditor.current?.replaceSection(finding.criterionIndex, finding.original, replacement)) setError('标准已变化，请核对编辑器中的最新内容后手动修改。')
          }} />
        <HomeworkValidation validation={homework.validation} dirty={dirty} busy={disabled} onRetry={async () => {
          if (disabled || dirtyRef.current || rechecking.current || homework.validation.status === 'PENDING') return
          rechecking.current = true; epoch.current++; setBusy(true); setError('')
          try { install((await homeworkApi.validate(courseId, homeworkId, homework.revision)).homework) }
          catch (reason) { setError(`${userFacingError(reason, '检查未能开始，请重试。')} 当前输入和附件已保留。`) }
          finally { rechecking.current = false; setBusy(false) }
        }} />
        {!dirty && homework.validation.status === 'READY' && homework.validation.findings?.some(item => item.severity === 'teacher_review') && <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 focus-visible:outline-2" checked={teacherReviewConfirmed} disabled={disabled} onChange={event => setTeacherReviewConfirmed(event.target.checked)} />
          我保留上述需教师复核的标准，并确认由教师判断；AI 仅辅助整理证据。
        </label>}
        {!homework.canEditDraft && <p className="text-sm text-muted-foreground">请由发起这份作业的教师确认发布。</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="outline" disabled={disabled || !dirty || !title.trim() || !instructions.trim() || !criteria.trim()}>保存修改</Button>
          <Button type="button" aria-disabled={busy || undefined} className="aria-disabled:opacity-50" disabled={(collapsePublished ? editingDisabled : disabled) || !canPublishHomeworkDraft(homework, dirty) || Boolean(homework.validation.findings?.some(item => item.severity === 'teacher_review') && !teacherReviewConfirmed)} onClick={async event => {
            if (disabled || !canPublishHomeworkDraft(homework, dirtyRef.current) || homework.validation.findings?.some(item => item.severity === 'teacher_review') && !teacherReviewConfirmed) return
            if (pending.current?.revision !== homework.revision) pending.current = { revision: homework.revision, key: crypto.randomUUID() }
            const publishButton = event.currentTarget
            epoch.current++; setBusy(true); setError('')
            try {
              const next = (await homeworkApi.publish(courseId, homeworkId, { expectedRevision: homework.revision, visibleHash: homework.visibleHash, idempotencyKey: pending.current.key, teacherReviewConfirmed })).homework
              focusPublished.current = collapsePublished && next.status !== 'DRAFT' && document.activeElement === publishButton
              install(next)
            }
            catch (reason) { setError(userFacingError(reason, '作业未能发布，请核对最新草稿后重试。')) }
            finally { setBusy(false) }
          }}>{busy ? '处理中…' : '确认发布'}</Button>
        </div>
      </form>}
    </CardContent>
    </>}
  </Card>
}
