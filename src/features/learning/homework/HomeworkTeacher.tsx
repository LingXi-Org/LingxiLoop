import { openReference } from '../forum/ConversationReferences'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { MemoCard } from '../forum/memos/MemoCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ContentDocument } from '@/features/content-editor'
import { userFacingError } from '@/lib/userFacingError'
import { homeworkApi } from './api'
import { type Homework, type HomeworkDetail, type HomeworkLearner, homeworkStatus, localDeadline } from './contracts'
import { ForumContentFields, contentLinks } from '../forum/ForumContentFields'
import type { ForumAttachment } from '../forum/contracts'
import { HomeworkSubmissionView } from './HomeworkReport'

export function HomeworkTeacher({ homework, canReview, canEdit, onUpdated }: { homework: Homework; canReview: boolean; canEdit: boolean; onUpdated(detail: HomeworkDetail): void }) {
  const id = useId()
  const [search,setSearch]=useState(''),epoch=useRef(0)
  const [learners, setLearners] = useState<HomeworkLearner[]>([]), [nextOffset, setNextOffset] = useState<number | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [closing, setClosing] = useState(false)
  const [dueAt, setDueAt] = useState(localDeadline(homework.dueAt))
  const load = useCallback(async (offset = 0) => {
    const request=++epoch.current
    setBusy(true); setError('')
    try {
      const result = await homeworkApi.learners(homework.courseId, homework.id, offset,search)
      if(request!==epoch.current)return
      setLearners(previous => offset ? [...previous, ...result.items] : result.items); setNextOffset(result.nextOffset)
    } catch (reason) { if(request===epoch.current)setError(userFacingError(reason, '学生进度暂时无法加载，请重试。')) }
    finally { if(request===epoch.current)setBusy(false) }
  }, [homework.courseId, homework.id,search])
  useEffect(() => {setLearners([]);setNextOffset(null);const timer=setTimeout(()=>void load(),200);return ()=>{clearTimeout(timer);epoch.current++}}, [load])
  return <div className="space-y-6">
    {canEdit && <details className="space-y-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground focus-visible:outline-2">作业安排</summary>
      {homework.dueAt && <form className="flex flex-wrap items-end gap-2" onSubmit={async event => {
        event.preventDefault(); if (busy || !dueAt) return
        setBusy(true); setError('')
        try { onUpdated(await homeworkApi.deadline(homework.courseId, homework.id, { expectedRevision: homework.revision, dueAt: new Date(dueAt).toISOString() })) }
        catch (reason) { setError(userFacingError(reason, '截止时间未能更新，请重试。')) }
        finally { setBusy(false) }
      }}>
        <div className="min-w-0 space-y-2"><Label htmlFor={`${id}-deadline`}>截止时间</Label><Input id={`${id}-deadline`} type="datetime-local" value={dueAt} min={localDeadline(homework.dueAt)} disabled={busy} onChange={event => setDueAt(event.target.value)} /></div>
        <Button type="submit" variant="outline" disabled={busy || !dueAt || dueAt === localDeadline(homework.dueAt)}>延长截止时间</Button>
      </form>}
      {homework.status !== 'CLOSED' && (!closing ? <Button variant="outline" disabled={busy} onClick={() => setClosing(true)}>关闭作业</Button> : <div className="space-y-3">
        <p className="text-sm">关闭后停止接收提交。被教师退回的学生仍可按意见补交一次修订；已有记录会保留。</p>
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => setClosing(false)}>暂不关闭</Button><Button disabled={busy} onClick={async () => {
          setBusy(true); setError('')
          try { onUpdated(await homeworkApi.close(homework.courseId, homework.id, homework.revision)); setClosing(false) }
          catch (reason) { setError(userFacingError(reason, '作业未能关闭，请重试。')) }
          finally { setBusy(false) }
        }}>确认关闭</Button></div>
      </div>)}
    </details>}
    <section aria-label="学生进度与验收" className="space-y-4" aria-busy={busy}>
      <h3 className="text-sm font-medium">学生作答</h3>
      <div className="flex gap-2"><Input type="search" aria-label="按学生姓名检索" placeholder="搜索学生姓名或身份编号" value={search} maxLength={200} onChange={event=>setSearch(event.target.value)}/>{search&&<Button variant="ghost" onClick={()=>setSearch('')}>清空检索</Button>}</div>
      {error && <p role="alert" className="text-sm text-destructive">{error}<Button variant="link" onClick={()=>void load()}>重试</Button></p>}
      {!learners.length && !busy && !error && <p className="text-sm text-muted-foreground">{search?'没有符合检索条件的学生。':'还没有学生进度。'}</p>}
      {learners.map(learner => <Learner key={learner.learnerId} learner={learner} homework={homework} canReview={canReview} onChanged={load} />)}
      {nextOffset !== null && <Button variant="outline" disabled={busy} onClick={() => void load(nextOffset)}>更多学生</Button>}
    </section>
  </div>
}

function Learner({ learner, homework, canReview, onChanged }: { learner: HomeworkLearner; homework: Homework; canReview: boolean; onChanged(): Promise<void> }) {
  const id = useId()
  const [reasonFiles,setReasonFiles]=useState<ForumAttachment[]>([]), [reasonLinks,setReasonLinks]=useState(''), [uploading,setUploading]=useState(false)
  const [reasonDocument,setReasonDocument] = useState<ContentDocument | null>(null)
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const trigger=useRef<HTMLButtonElement>(null)
  const scroll=useRef(0)
  const expand=()=>{if(!open)scroll.current=trigger.current?.closest('[data-forum-scroll]')?.scrollTop??0;setOpen(true)}
  const collapse=()=>{setOpen(false);requestAnimationFrame(()=>{const container=trigger.current?.closest('[data-forum-scroll]');if(container)container.scrollTop=scroll.current;trigger.current?.focus({preventScroll:true})})}
  const [open,setOpen]=useState(false),[reference,setReference]=useState(false)
  const submission = learner.latestSubmission
  useEffect(()=>{if(open&&reference&&submission){openReference(submission.id);setReference(false)}},[open,reference,submission])
  const act = async (work: () => Promise<unknown>) => {
    if (busy || !canReview) return
    setBusy(true); setError('')
    try { await work(); setReason(''); setReasonDocument(null); setReasonFiles([]); setReasonLinks(''); await onChanged() }
    catch (cause) { setError(userFacingError(cause, '验收未能保存，请刷新进度后重试。')) }
    finally { setBusy(false) }
  }
  return <MemoCard label={learner.learnerName} author={learner.learnerName} authorId={learner.learnerId} authorAvatarUrl={learner.learnerAvatarUrl} authorDetail={learner.learnerId} createdAt={submission?.submittedAt}
    disclosure={{ref:trigger,expanded:open,controls:`${id}-answer`,onToggle:()=>open?collapse():expand()}} actions={<span className="text-xs text-muted-foreground">{submission?`第 ${submission.version} 版`:'尚未提交'}</span>}>
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
    <span>{submission?(submission.report.verification==='unverified'?'证据不足 / 无法判断':submission.report.criteria.some(c=>c.reviewRequired)?'待教师判断':submission.report.criteria.length>0&&submission.report.criteria.every(c=>c.met&&c.independent)?'已掌握':'尚需巩固'):homeworkStatus[learner.status]}</span>
    {submission?.conversationReferences?.length?<a className="underline focus-visible:outline-2" href={`#${submission.id}-reference-0`} onClick={event=>{event.preventDefault();expand();setReference(true)}}>引用对话</a>:<span>未关联对话</span>}</div>
    {open&&<div id={`${id}-answer`} className="w-full space-y-3 pt-2">
    {learner.missingCriteria.length > 0 && <div className="space-y-1 text-sm"><p className="font-medium">待核实或待巩固</p><ul className="list-disc space-y-1 ps-5 text-muted-foreground">{learner.missingCriteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul></div>}
    {submission && <HomeworkSubmissionView submission={submission} framed={false} />}
    {submission && canReview && <form className="space-y-3" onSubmit={event => event.preventDefault()}>
      <ForumContentFields label="验收意见" body={reason} editorDocument={reasonDocument} setBody={(value,document)=>{setReason(value);setReasonDocument(document ?? null)}} attachments={reasonFiles} setAttachments={setReasonFiles} links={reasonLinks} setLinks={setReasonLinks} onUploading={setUploading} disabled={busy || uploading} maxLength={4000} focusCanvas/>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy || uploading || reason.length > 4000 || !reason.trim() || submission.reviewStatus === 'RETURNED'} onClick={() => void act(() => homeworkApi.review(homework.courseId, homework.id, { learnerId: learner.learnerId, expectedSubmissionId: submission.id, decision: 'RETURNED', reason: reason.trim(), editorDocument:reasonDocument, attachments:reasonFiles, links:contentLinks(reasonLinks) }))}>退回</Button>
        <Button type="button" disabled={busy || uploading || reason.length > 4000 || !reason.trim() || submission.reviewStatus !== 'PENDING'} onClick={() => void act(() => homeworkApi.review(homework.courseId, homework.id, { learnerId: learner.learnerId, expectedSubmissionId: submission.id, decision: 'PASSED', reason: reason.trim(), editorDocument:reasonDocument, attachments:reasonFiles, links:contentLinks(reasonLinks) }))}>通过</Button>
      </div>
    </form>}
    {learner.manualReview && <details className="space-y-3"><summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">已分享的复核证据</summary>
      <p className="text-xs text-muted-foreground">学生分享于 {new Date(learner.manualReview.sharedAt).toLocaleString('zh-CN')}</p>
      {learner.manualReview.evidence.map((text, index) => <blockquote key={index} className="whitespace-pre-wrap border-s-2 ps-3 text-sm">{text}</blockquote>)}
    </details>}
    {submission && <LearnerHistory homework={homework} learnerId={learner.learnerId} latestId={submission.id}/>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button variant="ghost" size="sm" onClick={collapse}>收起作答</Button></div>}
  </MemoCard>
}

function LearnerHistory({homework,learnerId,latestId}:{homework:Homework;learnerId:string;latestId:string}) {
  const [items,setItems]=useState<import('./contracts').HomeworkSubmission[]>([]),[next,setNext]=useState<number|null>(0),[error,setError]=useState('')
  const load=async()=>{try{const page=await homeworkApi.submissions(homework.courseId,homework.id,next??0,learnerId);setItems(old=>[...old,...page.items.filter(s=>s.id!==latestId)]);setNext(page.nextOffset)}catch(reason){setError(userFacingError(reason,'历史版本加载失败。'))}}
  return <div className="space-y-3">{items.map(s=><details key={s.id}><summary className="cursor-pointer text-sm focus-visible:outline-2">历史版本 · 第 {s.version} 次提交 · {new Date(s.submittedAt).toLocaleString()}</summary><HomeworkSubmissionView submission={s} framed={false}/></details>)}{next!==null&&<Button variant="ghost" size="sm" onClick={()=>void load()}>查看历史版本</Button>}{error&&<p role="alert">{error}</p>}</div>
}
