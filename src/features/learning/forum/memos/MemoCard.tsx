// Adapted from usememos/memos MemoView/MemoHeader/constants (MIT). See README.md and LICENSE.
import { type ReactNode, type Ref, useRef } from 'react'
import { ChevronRightIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import MemoPinnedMark from './MemoPinnedMark'
import RelativeTime from './RelativeTime'
import { useSearchMatchHighlight } from './useSearchMatchHighlight'
import './memos.css'

const MEMO_CARD_BASE_CLASSES = 'relative group flex flex-col justify-start items-start bg-card w-full px-4 py-3 mb-2 gap-2 text-card-foreground rounded-lg border border-border/70 transition-colors motion-reduce:transition-none'

export function MemoCard({ author, authorDetail, createdAt, pinned, children, actions, label, search = '', disclosure }: {
  author: string; authorDetail?: string; createdAt?: string; pinned?: boolean; children: ReactNode; actions?: ReactNode; label: string; search?: string
  disclosure?: { expanded: boolean; controls: string; onToggle(): void; ref?: Ref<HTMLButtonElement> }
}) {
  const root = useRef<HTMLElement>(null)
  useSearchMatchHighlight(root, search.trim() ? [search] : [])
  return <article ref={root} data-memo-card aria-label={label} className={cn(MEMO_CARD_BASE_CLASSES, 'group/memo min-w-0 [overflow-wrap:anywhere]')}>
    {pinned && <MemoPinnedMark />}
    <div className="flex min-h-6 w-full flex-wrap items-center justify-between gap-2 pe-3">
      <div data-slot="memo-header-meta" className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-[13px]">
        {disclosure ? <button ref={disclosure.ref} type="button" aria-expanded={disclosure.expanded} aria-controls={disclosure.controls} onClick={disclosure.onToggle} className="flex min-w-0 items-center gap-1.5 rounded-sm text-start font-medium focus-visible:outline-2 focus-visible:outline-ring">
          <ChevronRightIcon aria-hidden="true" className={cn('size-4 shrink-0 text-muted-foreground',disclosure.expanded && 'rotate-90')}/>
          <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px]">{author.slice(0,1)}</span><span className="truncate">{author}</span>
          {authorDetail && <span className="max-w-32 truncate text-xs font-normal text-muted-foreground" title={authorDetail}>{authorDetail}</span>}
        </button> : <span className="flex min-w-0 shrink items-center gap-1.5 font-medium text-foreground"><span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px]">{author.slice(0,1)}</span><span className="min-w-0 truncate">{author}</span></span>}
        {createdAt && <><span aria-hidden="true" className="shrink-0 text-muted-foreground/40">·</span><RelativeTime date={new Date(createdAt)} /></>}
      </div>
      <div data-slot="memo-header-actions" className="flex shrink-0 flex-wrap items-center gap-1">{actions}</div>
    </div>
    {children}
  </article>
}
