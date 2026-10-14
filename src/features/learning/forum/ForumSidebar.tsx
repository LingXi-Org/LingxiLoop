import { useState } from 'react'
import { ArrowLeftIcon, ClipboardListIcon, MenuIcon, MessageCircleIcon, SparklesIcon } from 'lucide-react'
import { zhCN } from 'react-day-picker/locale'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApp } from '@/stores/app'
import type { ForumFilter } from './contracts'

export const forumSections = [
  { kind: 'all', label: '自由论坛', icon: MessageCircleIcon },
  { kind: 'assignment', label: '作业', icon: ClipboardListIcon },
  { kind: 'case', label: '作品案例', icon: SparklesIcon },
] satisfies Array<{ kind: ForumFilter; label: string; icon: typeof MessageCircleIcon }>

export function ForumSidebar({ kind, onSelect }: { kind: ForumFilter; onSelect(kind: ForumFilter): void }) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState<Date | undefined>(new Date())
  const content = <div className="space-y-5">
    <nav aria-label="论坛版块" className="space-y-2">
      <h2 className="px-3 text-xs font-medium text-muted-foreground">版块</h2>
      <div className="flex flex-col gap-1">
        {forumSections.map(({ kind: value, label, icon: Icon }) => <Button key={value} variant={kind === value ? 'secondary' : 'ghost'} aria-pressed={kind === value} className="h-11 w-full justify-start gap-2.5" onClick={() => { onSelect(value); setOpen(false) }}><Icon aria-hidden="true" />{label}</Button>)}
      </div>
    </nav>
    <section aria-label="日历">
      <Calendar mode="single" selected={date} onSelect={setDate} locale={zhCN} className="rounded-lg border" labels={{ labelNext: () => '下个月', labelPrevious: () => '上个月' }} />
    </section>
  </div>
  if (isMobile) return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild><Button variant="ghost" size="icon" className="size-11" aria-label="打开论坛导航"><MenuIcon aria-hidden="true" /></Button></SheetTrigger>
    <SheetContent side="left" className="gap-0 p-0 data-[side=left]:w-[min(18rem,calc(100vw-2rem))] motion-reduce:animate-none motion-reduce:transition-none">
      <SheetHeader className="px-4 py-5"><SheetTitle>论坛导航</SheetTitle><SheetDescription className="sr-only">切换版块或查看日历。</SheetDescription></SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{content}</div>
      <div className="border-t p-4"><Button variant="ghost" className="h-11 w-full justify-start gap-2" onClick={() => { setOpen(false); useApp.getState().setView('learning') }}><ArrowLeftIcon aria-hidden="true" />返回课程工作台</Button></div>
    </SheetContent>
  </Sheet>
  return <aside aria-label="论坛侧栏" className="sticky top-0 min-w-0 self-start">{content}</aside>
}
