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
import { MemoContent } from './MemoContent'

export function MemoDetail({space,item,from,onBack,onChanged}:{space:LearningSpace;item:ForumItem;from:string;onBack():void;onChanged():void}) {
  const title=useRef<HTMLHeadingElement>(null)
  useEffect(()=>{title.current?.focus({preventScroll:true})},[item.id])
  return <section data-memo-detail className="@container flex min-h-full w-full flex-col items-center pb-8 pt-3 md:pt-6">
    <div className="w-full max-w-2xl px-4 sm:px-6">
      <div className="w-full">
        <a href={from} onClick={event=>{if(!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&event.button===0){event.preventDefault();onBack()}}}
          className="mb-2 inline-flex w-auto max-w-xs flex-row flex-nowrap items-center justify-start rounded-lg border border-border px-3 py-1 text-sm text-muted-foreground hover:opacity-80 hover:shadow focus-visible:outline-2 focus-visible:outline-ring">
          <ArrowUpLeftFromCircleIcon className="mr-2 h-auto w-4 shrink-0 opacity-60"/>返回学习论坛
        </a>
        <MemoCard label={item.title} author={item.authorName} createdAt={item.createdAt} pinned={item.pinned}>
          <h2 ref={title} tabIndex={-1} className="text-base font-semibold leading-6 outline-none">{item.title}</h2>
          <MemoContent content={item.body}/><ForumFiles links={item.links} attachments={item.attachments}/>
        </MemoCard>
        {item.kind==='assignment' && (item.targetType==='homework'
          ? <HomeworkDetail space={space} item={item} onClose={onBack} onChanged={onChanged}/>
          : <ForumSubmission space={space} item={item}/>)}
        <ForumDiscussion courseId={space.courseId!} item={item} canWrite={(space.canSubmit||space.canEditContent)&&!item.archived} canManage={space.canEditContent} onComment={onChanged}/>
      </div>
    </div>
  </section>
}
