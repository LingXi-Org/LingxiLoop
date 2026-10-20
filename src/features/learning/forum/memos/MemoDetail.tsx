// Adapted from usememos/memos web/src/pages/MemoDetail.tsx at
// 8120a6cee03003ee7968b49b2109f816fa4d96a4 (MIT; see ./LICENSE).
// Preserve upstream's full-page section, max-w-2xl content column, MemoView,
// then MemoCommentSection. Host adapters supply course submissions and routing.
import { ArrowUpLeftFromCircleIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { LearningSpace } from '../../contracts'
import type { ForumItem } from '../contracts'
import { ForumFiles } from '../ForumContentFields'
import { ForumDiscussion } from '../ForumDiscussion'
import { ForumSubmission } from '../ForumSubmission'
import { HomeworkDetail } from '../../homework/HomeworkDetail'
import { MemoCard } from './MemoCard'
import { ForumBody } from '../ForumBody'

export function MemoDetail({space,item,from,onBack,onChanged}:{space:LearningSpace;item:ForumItem;from:string;onBack():void;onChanged():void}) {
  const title=useRef<HTMLHeadingElement>(null)
  useEffect(()=>{title.current?.focus({preventScroll:true})},[item.id])
  return <section data-memo-detail className="@container flex min-h-full w-full flex-col items-center pb-6 pt-3">
    <div className="w-full max-w-3xl">
      <div className="w-full">
        <a href={from} onClick={event=>{if(!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&event.button===0){event.preventDefault();onBack()}}}
          className="mb-2 inline-flex w-auto max-w-xs flex-row flex-nowrap items-center justify-start rounded-sm px-1 py-2 text-sm text-muted-foreground hover:opacity-80 focus-visible:outline-2 focus-visible:outline-ring">
          <ArrowUpLeftFromCircleIcon className="mr-2 h-auto w-4 shrink-0 opacity-60"/>返回学习论坛
        </a>
        <MemoCard label={item.title} author={item.authorName} authorId={item.authorId} authorAvatarUrl={item.authorAvatarUrl} createdAt={item.createdAt} pinned={item.pinned}>
          <h2 ref={title} tabIndex={-1} className="text-base font-semibold leading-6 focus-visible:outline-2 focus-visible:outline-ring">{item.title}</h2>
          <ForumBody content={item.body} document={item.editorDocument}/><ForumFiles links={item.links} attachments={item.attachments}/>
        </MemoCard>
        {item.kind==='assignment' && (item.targetType==='homework'
          ? <HomeworkDetail space={space} item={item} onChanged={onChanged}/>
          : <ForumSubmission space={space} item={item}/>)}
        <ForumDiscussion courseId={space.courseId!} item={item} canWrite={(space.canSubmit||space.canEditContent)&&!item.archived} canManage={space.canEditContent} onComment={onChanged}/>
      </div>
    </div>
  </section>
}
