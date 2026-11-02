// Full-page forum document; existing submission and discussion workflows stay below it.
// Layout: article column plus a properties aside, after issue pages built on shadcn/ui.
import { ArrowLeftIcon } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { LearningSpace } from '../../contracts'
import type { ForumItem } from '../contracts'
import { ForumAvatar } from '../ForumAvatar'
import { ForumFiles } from '../ForumContentFields'
import { ForumDiscussion } from '../ForumDiscussion'
import { ForumSubmission } from '../ForumSubmission'
import { HomeworkDetail } from '../../homework/HomeworkDetail'
import { ForumBody } from '../ForumBody'

const dateTime = (value: string) => new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })

function Property({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-start gap-3 py-2 text-sm">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
  </div>
}

export function MemoDetail({space,item,from,onBack,onChanged,actions,editor}:{space:LearningSpace;item:ForumItem;from:string;onBack():void;onChanged():void;actions?:ReactNode;editor?:ReactNode}) {
  const title=useRef<HTMLHeadingElement>(null)
  const workflow=useRef<HTMLDivElement>(null)
  const workflowId=useId()
  const assignment=item.kind==='assignment'
  const workflowLabel=space.canReview ? item.targetType==='homework' ? '查看进度与验收' : '查看提交' : item.status==='CLOSED' ? '查看提交记录' : '前往提交区'
  const overdue=Boolean(item.dueAt && item.status!=='CLOSED' && Date.parse(item.dueAt)<Date.now())
  useEffect(()=>{title.current?.focus({preventScroll:true})},[item.id])
  const jumpToWorkflow=()=>{workflow.current?.scrollIntoView({block:'start'});workflow.current?.focus({preventScroll:true})}
  return <section data-memo-detail>
    <header className="forum-detail-toolbar">
      <Button variant="ghost" size="sm" asChild className="-ms-2"><a href={from} onClick={event=>{if(!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&event.button===0){event.preventDefault();onBack()}}}><ArrowLeftIcon/>返回论坛</a></Button>
      <div className="ms-auto flex items-center gap-2">
        {actions}
        {assignment && <Button asChild><a href={'#'+workflowId} onClick={event=>{event.preventDefault();jumpToWorkflow()}}>{workflowLabel}</a></Button>}
      </div>
    </header>
    <div data-forum-document className="forum-document">
      <div className="min-w-0">
        {editor ?? <article aria-label={item.title}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-normal text-muted-foreground">{assignment?'作业':'自由讨论'}</Badge>
            {item.pinned && <Badge variant="secondary" className="font-normal">已置顶</Badge>}
            {item.status==='CLOSED' && <Badge variant="outline" className="font-normal">已关闭</Badge>}
            {item.archived && <Badge variant="outline" className="font-normal">已归档</Badge>}
          </div>
          <h1 ref={title} tabIndex={-1} className="forum-document-title focus-visible:outline-2 focus-visible:outline-ring">{item.title}</h1>
          <div className="forum-document-meta">
            <span className="inline-flex items-center gap-2 text-foreground"><ForumAvatar userId={item.authorId} name={item.authorName} url={item.authorAvatarUrl}/>{item.authorName}</span>
            <span aria-hidden="true">·</span><time dateTime={item.createdAt} className="tabular-nums">{dateTime(item.createdAt)}</time>
          </div>
          <div className="forum-document-body"><ForumBody content={item.body} document={item.editorDocument}/><ForumFiles links={item.links} attachments={item.attachments}/></div>
        </article>}
        {assignment && <div ref={workflow} id={workflowId} tabIndex={-1} className="forum-workflow focus-visible:outline-2 focus-visible:outline-ring">
          <h2 className="forum-section-title">{space.canReview ? '提交与验收' : '我的提交'}</h2>
          {item.targetType==='homework' ? <HomeworkDetail space={space} item={item} onChanged={onChanged}/> : <ForumSubmission space={space} item={item}/>}
        </div>}
        <div className="forum-document-discussion">
          <h2 className="forum-section-title">讨论<span className="ms-2 font-normal tabular-nums text-muted-foreground">{item.commentCount}</span></h2>
          <ForumDiscussion courseId={space.courseId!} item={item} canWrite={(space.canSubmit||space.canEditContent)&&!item.archived} canManage={space.canEditContent} onComment={onChanged}/>
        </div>
      </div>
      <aside aria-label="内容属性" className="forum-document-aside">
        <dl className="divide-y divide-[var(--im-divider-weak)]">
          <Property label="作者"><span className="inline-flex items-center gap-2"><ForumAvatar userId={item.authorId} name={item.authorName} url={item.authorAvatarUrl}/>{item.authorName}</span></Property>
          <Property label="版块">{assignment?'作业':'自由讨论'}</Property>
          <Property label="发布"><time dateTime={item.createdAt} className="tabular-nums">{dateTime(item.createdAt)}</time></Property>
          {item.updatedAt!==item.createdAt && <Property label="更新"><time dateTime={item.updatedAt} className="tabular-nums">{dateTime(item.updatedAt)}</time></Property>}
          {item.dueAt && <Property label="截止"><time dateTime={item.dueAt} className={overdue?'tabular-nums text-destructive':'tabular-nums'}>{dateTime(item.dueAt)}</time></Property>}
          {assignment && <Property label="状态">{item.status==='CLOSED'?'已关闭':'进行中'}</Property>}
          {item.tags.length>0 && <Property label="标签"><span className="flex flex-wrap gap-1">{item.tags.map(tag=><Badge key={tag} variant="secondary" className="font-normal">#{tag}</Badge>)}</span></Property>}
          <Property label="评论"><span className="tabular-nums">{item.commentCount}</span></Property>
        </dl>
        {assignment && <Button variant="outline" className="mt-4 w-full" onClick={jumpToWorkflow}>{workflowLabel}</Button>}
      </aside>
    </div>
  </section>
}
