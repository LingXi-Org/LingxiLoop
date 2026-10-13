// Adapted from usememos/memos MemoView/MemoHeader/constants (MIT). See README.md and LICENSE.
import { type ReactNode, useRef } from 'react'
import { cn } from '@/lib/utils'
import MemoPinnedMark from './MemoPinnedMark'
import RelativeTime from './RelativeTime'
import { useSearchMatchHighlight } from './useSearchMatchHighlight'
import './memos.css'

const MEMO_CARD_BASE_CLASSES = 'relative group flex flex-col justify-start items-start bg-card w-full px-4 py-3 mb-2 gap-2 text-card-foreground rounded-lg border border-border/70 transition-colors motion-reduce:transition-none'

export function MemoCard({ author, createdAt, pinned, children, actions, label, search = '' }: {
  author: string; createdAt: string; pinned?: boolean; children: ReactNode; actions?: ReactNode; label: string; search?: string
}) {
  const root = useRef<HTMLElement>(null)
  useSearchMatchHighlight(root, search.trim() ? [search] : [])
  return <article ref={root} data-memo-card aria-label={label} className={cn(MEMO_CARD_BASE_CLASSES, 'group/memo min-w-0 [overflow-wrap:anywhere]')}>
    {pinned && <MemoPinnedMark />}
    <div className="flex min-h-6 w-full flex-wrap items-center justify-between gap-2 pe-3">
      <div data-slot="memo-header-meta" className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-[13px]">
        <span className="flex min-w-0 shrink items-center gap-1.5 font-medium text-foreground"><span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px]">{author.slice(0,1)}</span><span className="min-w-0 truncate">{author}</span></span>
        <span aria-hidden="true" className="shrink-0 text-muted-foreground/40">·</span>
        <RelativeTime date={new Date(createdAt)} />
      </div>
      <div data-slot="memo-header-actions" className="flex shrink-0 flex-wrap items-center gap-1">{actions}</div>
    </div>
    {children}
  </article>
}
