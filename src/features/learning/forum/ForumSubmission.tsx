import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ConversationReferencePicker, ConversationReferences, openReference } from './ConversationReferences'
import { userFacingError } from '@/lib/userFacingError'
import type { LearningSpace } from '../contracts'
import { forumApi } from './api'
import type { ConversationReference, ForumItem, SubmissionAssessment, SubmissionStudent, SubmissionVersion } from './contracts'
import { contentLinks, ForumContentFields, ForumFiles } from './ForumContentFields'
import { MemoCard } from './memos/MemoCard'
import { MemoContent } from './memos/MemoContent'
import { contentDraftSchema, emptyContent, useForumDraft } from './useForumDraft'

const sourceLabels = { STUDENT_ORIGINAL: '学生原创',AGENT_RELAY: 'Agent 代交',AGENT_GENERATED: 'Agent 生成' }
export function Version({ submission }: { submission: SubmissionVersion }) {
  return <MemoCard label={`第 ${submission.version} 版提交`} author={submission.learnerName} createdAt={submission.submittedAt}
    actions={<span className="text-xs text-muted-foreground">第 {submission.version} 版</span>}>
    <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{sourceLabels[submission.source]}</Badge>{submission.late && <Badge variant="outline">迟交</Badge>}</div>
    <MemoContent content={submission.answer} />
    <p className="text-sm">学习评价：{assessmentLabel(submission.assessment)}</p>
    {submission.assessment?.reason && <MemoContent content={submission.assessment.reason}/>}
    {submission.assessment?.evidence?.map((quote,index)=><a key={index} className="text-sm underline" href={`#${submission.id}-reference-${quote.reference}`} onClick={event=>{event.preventDefault();openReference(submission.id,quote.reference)}}>依据：{quote.excerpt}</a>)}
    <ConversationReferences references={submission.conversationReferences} id={submission.id}/>
    <p className="text-xs text-muted-foreground">学习评价供教师参考，不等同于正式成绩。</p>
    <ForumFiles links={submission.links} attachments={submission.attachments} />
    {submission.source === 'AGENT_GENERATED' && <p className="text-xs text-muted-foreground">此版本由 Agent 生成，已保留来源标记。</p>}
    {submission.feedback?.map(feedback => <div key={feedback.id} className="w-full rounded border p-3"><p className="mb-2 text-xs text-muted-foreground">{feedback.kind === 'TEACHER' ? '教师反馈' : '历史 Agent 评价'}{feedback.status !== 'ACCEPTED' ? ` · ${feedback.status === 'PENDING' ? '待审核' : '未采纳'}` : ''} · {new Date(feedback.createdAt).toLocaleString()}</p><MemoContent content={feedback.body} /></div>)}
  </MemoCard>
}

export function assessmentLabel(assessment:SubmissionAssessment|null) {
  if(!assessment)return '暂无评价'
  if(assessment.status==='PENDING')return '评价生成中'
  if(assessment.status==='FAILED')return '评价失败 · 自动重试中'
  return assessment.mastery==='MASTERED'?'已掌握':assessment.mastery==='DEVELOPING'?'尚需巩固':'证据不足 / 无法判断'
}

export function ForumSubmission({ space, item }: { space: LearningSpace; item: ForumItem }) {
  const [versions,setVersions]=useState<SubmissionVersion[]>([]),[nextOffset,setNextOffset]=useState<number|null>(null)
  const {draft,setDraft,discard,storageError}=useForumDraft(`submission:${space.courseId}:${item.id}`,contentDraftSchema,emptyContent,space.canSubmit&&item.status!=='CLOSED')
  const {body:answer,links,attachments}=draft
  const [references,setReferences]=useState<ConversationReference[]>([])
  const [busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false)
  const pending=useRef<{fingerprint:string;key:string}|null>(null)
  const load=useCallback(async(offset=0)=>{
    if(space.canReview)return
    setBusy(true)
    try {const page=await forumApi.submissions(space.courseId!,item.id,offset);setVersions(old=>offset?[...old,...page.items]:page.items);setNextOffset(page.nextOffset)}
    catch(reason){setError(userFacingError(reason,'提交记录加载失败。'))}finally{setBusy(false)}
  },[space.courseId,space.canReview,item.id])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{
    if(!versions.some(v=>v.assessment?.status==='PENDING'||v.assessment?.status==='FAILED'))return
    const timer=setInterval(()=>void load(),5000);return ()=>clearInterval(timer)
  },[versions,load])
  const disabled=busy||uploading
  return <section aria-label="作业提交" className="space-y-4 pt-6">
    {item.dueAt && <p className="text-xs text-muted-foreground">截止：{new Date(item.dueAt).toLocaleString()}；截止后提交将标记为迟交。</p>}
    {item.status==='CLOSED'?<p role="status" className="text-sm">作业已关闭，停止接收提交。</p>:space.canSubmit&&<form className="space-y-4" onSubmit={async event=>{
      event.preventDefault();if(disabled||!references.length)return
      const content={answer,links:contentLinks(links),attachments,conversationReferences:references},fingerprint=JSON.stringify(content)
      if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,key:crypto.randomUUID()}
      setBusy(true);setError('');setSaved(false)
      try {await forumApi.submit(space.courseId!,item.id,{...content,idempotencyKey:pending.current.key});pending.current=null;setDraft(emptyContent);discard();setReferences([]);setSaved(true);await load()}
      catch(reason){setError(userFacingError(reason,'提交失败，请检查对话引用和作业状态后重试。'))}finally{setBusy(false)}
    }}>
      <ForumContentFields body={answer} setBody={body=>setDraft(old=>({...old,body}))} label="作业内容" links={links} setLinks={links=>setDraft(old=>({...old,links}))} attachments={attachments} setAttachments={attachments=>setDraft(old=>({...old,attachments}))} disabled={disabled} onUploading={setUploading}/>
      <ConversationReferencePicker courseId={space.courseId!} value={references} onChange={setReferences} disabled={disabled}/>
      {storageError&&<p role="status">无法保存本地草稿，请先复制内容。</p>}
      <Button type="submit" disabled={disabled||!references.length||!answer.trim()&&!links.trim()&&!attachments.length}>{busy?'提交中…':'提交作业'}</Button>
    </form>}
    {saved&&<p role="status" className="text-sm">作业已提交，正在生成学习评价。</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}<Button variant="link" onClick={()=>void load()}>重新加载记录</Button></p>}
    {space.canReview?<SubmissionStudents space={space} item={item}/>:<section aria-label="提交记录" className="space-y-3">
      <h3 className="text-sm font-medium">我的提交记录</h3>
      {versions.map(version=><details key={version.id}><summary className="cursor-pointer text-sm focus-visible:outline-2">第 {version.version} 版 · {new Date(version.submittedAt).toLocaleString()} · {assessmentLabel(version.assessment)}</summary><Version submission={version}/></details>)}
      {!versions.length&&!busy&&<p className="text-sm text-muted-foreground">还没有提交记录。</p>}
      {nextOffset!==null&&<Button variant="outline" onClick={()=>void load(nextOffset)}>更多提交记录</Button>}
    </section>}
  </section>
}

function SubmissionStudents({space,item}:{space:LearningSpace;item:ForumItem}) {
  const [students,setStudents]=useState<SubmissionStudent[]>([]),[next,setNext]=useState<number|null>(null),[search,setSearch]=useState('')
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),epoch=useRef(0)
  const load=useCallback(async(offset=0)=>{
    const request=++epoch.current;setBusy(true)
    try {const page=await forumApi.students(space.courseId!,item.id,offset,search);if(request===epoch.current){setStudents(old=>offset?[...old,...page.items]:page.items);setNext(page.nextOffset);setError('')}}
    catch(reason){if(request===epoch.current)setError(userFacingError(reason,'学生列表加载失败。'))}finally{if(request===epoch.current)setBusy(false)}
  },[space.courseId,item.id,search])
  useEffect(()=>{setStudents([]);setNext(null);const timer=setTimeout(()=>void load(),200);return ()=>{clearTimeout(timer);epoch.current++}},[load])
  return <section aria-label="提交学生列表" className="space-y-3" aria-busy={busy}>
    <h3 className="text-sm font-medium">学生作答</h3>
    <div className="flex gap-2"><Input type="search" aria-label="按学生姓名检索" placeholder="检索全部提交学生的姓名或身份编号" value={search} onChange={event=>setSearch(event.target.value)} maxLength={200}/>{search&&<Button variant="ghost" onClick={()=>setSearch('')}>清空检索</Button>}<Button variant="ghost" disabled={busy} onClick={()=>void load()}>刷新</Button></div>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {!students.length&&!busy&&!error&&<p role="status" className="text-sm text-muted-foreground">{search?'没有符合检索条件的学生。':'还没有提交记录。'}</p>}
    {students.map(student=><StudentRow key={student.learnerId} student={student} space={space} item={item}/>)}
    {next!==null&&<Button variant="outline" disabled={busy} onClick={()=>void load(next)}>更多学生</Button>}
  </section>
}

function StudentRow({student,space,item}:{student:SubmissionStudent;space:LearningSpace;item:ForumItem}) {
  const trigger=useRef<HTMLButtonElement>(null)
  const collapse=()=>{setOpen(false);requestAnimationFrame(()=>trigger.current?.focus({preventScroll:true}))}
  const [open,setOpen]=useState(false),[versions,setVersions]=useState<SubmissionVersion[]>([]),[next,setNext]=useState<number|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[reference,setReference]=useState<number|null>(null)
  const load=useCallback(async(offset=0)=>{
    setBusy(true)
    try{const page=await forumApi.studentVersions(space.courseId!,item.id,student.learnerId,offset);setVersions(old=>offset?[...old,...page.items]:page.items);setNext(page.nextOffset);setError('')}
    catch(reason){setError(userFacingError(reason,'作答加载失败。'))}finally{setBusy(false)}
  },[space.courseId,item.id,student.learnerId])
  useEffect(()=>{if(open)void load()},[open,load,student.id])
  useEffect(()=>{if(reference!==null&&versions.length){openReference(student.id,reference);setReference(null)}},[reference,versions,student.id])
  return <div className="w-full rounded-lg border border-border bg-card text-card-foreground">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      <button ref={trigger} type="button" aria-expanded={open} aria-controls={`submission-${student.id}`} onClick={()=>setOpen(!open)} className="min-w-0 flex-1 rounded-sm text-start focus-visible:outline-2 focus-visible:outline-ring">
        <span className="block truncate text-sm font-medium">{open?'▾':'▸'} {student.learnerName}</span>
        <span className="block truncate text-xs text-muted-foreground" title={student.learnerId}>{student.learnerId}</span>
        <span className="block text-xs text-muted-foreground">{new Date(student.submittedAt).toLocaleString()} · 第 {student.version} 版</span>
      </button>
      <Badge variant="secondary">{assessmentLabel(student.assessment)}</Badge>
      <div className="flex flex-wrap gap-2 text-xs">{student.conversationReferences.length?student.conversationReferences.map((ref,index)=><a key={index} title={ref.title} className="underline focus-visible:outline-2" href={`#${student.id}-reference-${index}`} onClick={event=>{event.preventDefault();setOpen(true);setReference(index)}}>对话 {index+1}</a>):<span className="text-muted-foreground">未关联对话</span>}</div>
    </div>
    {open&&<div id={`submission-${student.id}`} className="space-y-3 border-t p-3">
      {busy&&!versions.length&&<p role="status">正在加载作答…</p>}
      {error&&<p role="alert">{error}<Button onClick={()=>void load()}>重试</Button></p>}
      {versions[0]&&<Version submission={versions[0]}/>}
      {versions[0]&&<form className="flex gap-2" onSubmit={async event=>{
        event.preventDefault();const form=event.currentTarget,body=String(new FormData(form).get('feedback')??'').trim();if(!body||busy)return
        setBusy(true);try{await forumApi.feedback(space.courseId!,item,versions[0].id,body);form.reset();await load()}catch(reason){setError(userFacingError(reason,'反馈保存失败。'))}finally{setBusy(false)}
      }}><Input name="feedback" aria-label={`反馈：${student.learnerName}`} placeholder="给这次提交留下反馈" required maxLength={10000}/><Button disabled={busy}>保存反馈</Button></form>}
      {versions.slice(1).map(version=><details key={version.id}><summary className="cursor-pointer text-sm focus-visible:outline-2">历史版本 · 第 {version.version} 版</summary><Version submission={version}/></details>)}
      {next!==null&&<Button variant="outline" disabled={busy} onClick={()=>void load(next)}>更多历史版本</Button>}
      <Button variant="ghost" size="sm" onClick={collapse}>收起作答</Button>
    </div>}
  </div>
}
