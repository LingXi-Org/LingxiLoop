// Full-page forum document; existing submission and discussion workflows stay below it.
import { ArrowLeftIcon, CalendarIcon } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef } from 'react'
import { Button } from '@/components/ui/button'
import type { LearningSpace } from '../../contracts'
import type { ForumItem } from '../contracts'
import { ForumFiles } from '../ForumContentFields'
import { ForumDiscussion } from '../ForumDiscussion'
import { ForumSubmission } from '../ForumSubmission'
import { HomeworkDetail } from '../../homework/HomeworkDetail'
import { ForumBody } from '../ForumBody'

export function MemoDetail({space,item,from,onBack,onChanged,actions,editor}:{space:LearningSpace;item:ForumItem;from:string;onBack():void;onChanged():void;actions?:ReactNode;editor?:ReactNode}) {
  const title=useRef<HTMLHeadingElement>(null)
  const workflow=useRef<HTMLDivElement>(null)
  const workflowId=useId()
  const assignment=item.kind==='assignment'
  const workflowLabel=space.canReview ? item.targetType==='homework' ? '查看进度与验收' : '查看提交' : item.status==='CLOSED' ? '查看提交记录' : '前往提交区'
  useEffect(()=>{title.current?.focus({preventScroll:true})},[item.id])
  return <section data-memo-detail>
    <header className="forum-detail-toolbar">
      <a href={from} onClick={event=>{if(!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&event.button===0){event.preventDefault();onBack()}}} className="inline-flex items-center gap-3 rounded-sm py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"><ArrowLeftIcon className="size-4"/>返回学习论坛</a>
      <div className="ms-auto flex items-center gap-3">
        {assignment && <Button asChild><a href={'#'+workflowId} onClick={event=>{event.preventDefault();workflow.current?.scrollIntoView({block:'start'});workflow.current?.focus({preventScroll:true})}}>{workflowLabel}</a></Button>}
        {actions}
      </div>
    </header>
    <div data-forum-document className="forum-document">
      {editor ?? <article aria-label={item.title}>
        <h1 ref={title} tabIndex={-1} className="forum-document-title focus-visible:outline-2 focus-visible:outline-ring">{item.title}</h1>
        <div className="forum-document-meta"><span>{item.authorName}</span><span aria-hidden="true">·</span><span>{assignment?'作业':'自由讨论'}</span>{item.status==='CLOSED' && <span>已关闭</span>}</div>
        {item.dueAt && <p className="forum-deadline"><CalendarIcon aria-hidden="true" className="size-5"/>截止时间 <time dateTime={item.dueAt}>{new Date(item.dueAt).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})}</time></p>}
        <div className="forum-document-body"><ForumBody content={item.body} document={item.editorDocument}/><ForumFiles links={item.links} attachments={item.attachments}/></div>
      </article>}
      {assignment && <div ref={workflow} id={workflowId} tabIndex={-1} className="forum-workflow focus-visible:outline-2 focus-visible:outline-ring">
        {item.targetType==='homework' ? <HomeworkDetail space={space} item={item} onChanged={onChanged}/> : <ForumSubmission space={space} item={item}/>}
      </div>}
      <div className="forum-document-discussion"><ForumDiscussion courseId={space.courseId!} item={item} canWrite={(space.canSubmit||space.canEditContent)&&!item.archived} canManage={space.canEditContent} onComment={onChanged}/></div>
    </div>
  </section>
}
