// Adapted from usememos/memos MemoView/MemoHeader/constants (MIT). See README.md and LICENSE.
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import MemoPinnedMark from './MemoPinnedMark'

const MEMO_CARD_BASE_CLASSES = 'relative group flex flex-col justify-start items-start bg-card w-full px-4 py-3 mb-2 gap-2 text-card-foreground rounded-lg border border-border/70 transition-colors motion-reduce:transition-none'

export function MemoCard({ author, createdAt, pinned, children, actions, label }: {
  author: string; createdAt: string; pinned?: boolean; children: ReactNode; actions?: ReactNode; label: string
}) {
  return <article aria-label={label} className={cn(MEMO_CARD_BASE_CLASSES, 'group/memo min-w-0 [overflow-wrap:anywhere]')}>
    {pinned && <MemoPinnedMark />}
    <div className="flex min-h-6 w-full flex-wrap items-center justify-between gap-2 pe-3">
      <div data-slot="memo-header-meta" className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
        <span className="font-medium text-foreground">{author}</span>
        <span aria-hidden="true" className="shrink-0 text-muted-foreground/40">·</span>
        <time dateTime={createdAt} className="text-muted-foreground">{new Date(createdAt).toLocaleString()}</time>
      </div>
      <div data-slot="memo-header-actions" className="flex shrink-0 flex-wrap items-center gap-1">{actions}</div>
    </div>
    {children}
  </article>
}
