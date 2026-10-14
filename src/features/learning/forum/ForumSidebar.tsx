import { useState } from 'react'
import { BookOpenIcon, CalendarDaysIcon, ChevronDownIcon, ClipboardListIcon, MessageCircleIcon, SparklesIcon } from 'lucide-react'
import { zhCN } from 'react-day-picker/locale'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import type { ForumFilter } from './contracts'

export const forumSections = [
  { kind: 'all', label: '自由论坛', icon: MessageCircleIcon },
  { kind: 'assignment', label: '作业', icon: ClipboardListIcon },
  { kind: 'resource', label: '资料', icon: BookOpenIcon },
  { kind: 'case', label: '作品案例', icon: SparklesIcon },
] satisfies Array<{ kind: ForumFilter; label: string; icon: typeof MessageCircleIcon }>

export function ForumSidebar({ kind, onSelect }: { kind: ForumFilter; onSelect(kind: ForumFilter): void }) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  return <aside aria-label="论坛侧栏" className="min-w-0 space-y-5 @min-[56rem]/learning-grid:sticky @min-[56rem]/learning-grid:top-0 @min-[56rem]/learning-grid:self-start">
    <nav aria-label="论坛版块" className="space-y-2">
      <h2 className="px-3 text-xs font-medium text-muted-foreground">版块</h2>
      <div className="flex flex-wrap gap-1 @min-[56rem]/learning-grid:flex-col">
        {forumSections.map(({ kind: value, label, icon: Icon }) => <Button key={value} variant={kind === value ? 'secondary' : 'ghost'} aria-pressed={kind === value} className="h-10 justify-start gap-2.5 @min-[56rem]/learning-grid:w-full" onClick={() => onSelect(value)}><Icon aria-hidden="true" />{label}</Button>)}
      </div>
    </nav>
    <section aria-label="日历" className="rounded-xl border border-border/60 bg-background">
      <Button variant="ghost" className="h-11 w-full justify-between @min-[56rem]/learning-grid:hidden" aria-expanded={calendarOpen} aria-controls="forum-calendar" onClick={() => setCalendarOpen(value => !value)}><span className="flex items-center gap-2"><CalendarDaysIcon aria-hidden="true" />日历</span><ChevronDownIcon aria-hidden="true" className={calendarOpen ? 'rotate-180' : ''} /></Button>
      <div id="forum-calendar" className={`${calendarOpen ? 'block' : 'hidden'} @min-[56rem]/learning-grid:block`}>
        <Calendar locale={zhCN} className="mx-auto rounded-xl bg-transparent [--cell-size:--spacing(8)]" classNames={{ day: 'flex size-8 items-center justify-center text-sm font-normal' }} labels={{ labelNext: () => '下个月', labelPrevious: () => '上个月' }} />
      </div>
    </section>
  </aside>
}
