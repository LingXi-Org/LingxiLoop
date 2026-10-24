import { criteriaSource } from '@/features/content-editor/document'
import type { ContentDocument } from '@/features/content-editor'
import { type ToolCallMessagePartProps, useAuiState } from '@assistant-ui/react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { z } from 'zod'
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
import { HomeworkValidation } from './HomeworkValidation'

const resultSchema = z.object({ value: z.object({ result: z.object({ homeworkId: z.string().min(1), courseId: z.string().min(1) }) }) })

export function HomeworkDraftTool({ result, status, isError, readOnly = false }: ToolCallMessagePartProps & { readOnly?: boolean }) {
  const preparing = useAuiState(state => {
    const run = state.message.metadata.custom.harness as RunDisplayState | undefined
    return state.thread.isRunning || run?.lifecycle === 'queued' || run?.lifecycle === 'leased' || run?.lifecycle === 'waiting'
  })
  const parsed = resultSchema.safeParse(result)
  if (!parsed.success) return <p role="status" className="text-sm text-muted-foreground">{isError || status.type === 'incomplete' ? '作业草稿未能准备好，请让助手重试。' : status.type === 'running' ? '正在整理作业草稿…' : '作业草稿暂时无法查看。'}</p>
  return <HomeworkDraftCard key={parsed.data.value.result.homeworkId} {...parsed.data.value.result} readOnly={readOnly} preparing={preparing} />
}

export function HomeworkDraftCard({ courseId, homeworkId, readOnly, preparing, onViewForum }: { courseId: string; homeworkId: string; readOnly: boolean; preparing: boolean; onViewForum?(): void }) {
  const id = useId()
  const [editorDocument,setEditorDocument]=useState<ContentDocument | null>(null)
  const [criteriaItems,setCriteriaItems]=useState<string[]>([])
  const [criteriaDocument,setCriteriaDocument]=useState<ContentDocument | null>(null)
  const [homework, setHomework] = useState<Homework | null>(null)
  const [title, setTitle] = useState(''), [instructions, setInstructions] = useState(''), [criteria, setCriteria] = useState(''), [dueAt, setDueAt] = useState('')
  const [links, setLinks] = useState(''), [attachments, setAttachments] = useState<Homework['attachments']>([])
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState('')
  const pending = useRef<{ revision: number; key: string } | null>(null)
  const epoch = useRef(0), dirtyRef = useRef(false)
  const install = useCallback((next: Homework) => {
    epoch.current++; dirtyRef.current = false
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
  const disabled = busy || uploading || preparing || readOnly || !homework?.canEditDraft
  const edited = (change: () => void) => { epoch.current++; dirtyRef.current = true; change(); setDirty(true) }
  return <Card aria-label="作业草稿" data-homework-id={homeworkId} className="w-full min-w-0 max-w-2xl [overflow-wrap:anywhere]">
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
          <ForumContentFields label="验收标准" body={criteria} editorDocument={criteriaDocument} legacyParagraphs={criteriaItems} setBody={(value,document,sections) => edited(() => {setCriteria(value);setCriteriaDocument(document ?? null);setCriteriaItems(sections ?? value.split('\n').filter(Boolean))})} links={links} setLinks={value => edited(() => setLinks(value))} attachments={attachments} setAttachments={value => edited(() => setAttachments(value))} disabled={disabled} onUploading={setUploading} nativeOnly maxLength={10000}/>
          <p className="text-xs text-muted-foreground">每段一条标准，最多 20 条；保存后按标准核验作答。</p>
        </section>
        <div className="space-y-2"><Label htmlFor={`${id}-due`}>截止时间</Label><Input id={`${id}-due`} className="max-w-xs" type="datetime-local" value={dueAt} disabled={disabled} onChange={event => edited(() => setDueAt(event.target.value))} /></div>
        <HomeworkValidation validation={homework.validation} dirty={dirty} busy={disabled} onRetry={async () => {
          if (disabled || dirtyRef.current) return
          epoch.current++; setBusy(true); setError('')
          try { install((await homeworkApi.validate(courseId, homeworkId, homework.revision)).homework) }
          catch (reason) { setError(`${userFacingError(reason, '检查未能开始，请重试。')} 当前输入和附件已保留。`) }
          finally { setBusy(false) }
        }} />
        {!homework.canEditDraft && <p className="text-sm text-muted-foreground">请由发起这份作业的教师确认发布。</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="outline" disabled={disabled || !dirty || !title.trim() || !instructions.trim() || !criteria.trim()}>保存修改</Button>
          <Button type="button" disabled={disabled || !canPublishHomeworkDraft(homework, dirty)} onClick={async () => {
            if (disabled || !canPublishHomeworkDraft(homework, dirtyRef.current)) return
            if (pending.current?.revision !== homework.revision) pending.current = { revision: homework.revision, key: crypto.randomUUID() }
            epoch.current++; setBusy(true); setError('')
            try { install((await homeworkApi.publish(courseId, homeworkId, { expectedRevision: homework.revision, visibleHash: homework.visibleHash, idempotencyKey: pending.current.key })).homework) }
            catch (reason) { setError(userFacingError(reason, '作业未能发布，请核对最新草稿后重试。')) }
            finally { setBusy(false) }
          }}>{busy ? '处理中…' : '确认发布'}</Button>
        </div>
      </form>}
    </CardContent>
  </Card>
}
