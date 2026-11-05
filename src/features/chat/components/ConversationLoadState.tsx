import { userFacingError } from '@/lib/userFacingError'
import { ConversationSkeleton } from './ConversationSkeleton'

/** Product history state is independent of the assistant runtime's Empty guard. */
export function ConversationLoadState({ loading, empty, running, error, recovering = false, thread = false, onRetry }: {
  loading: boolean
  recovering?: boolean
  empty: boolean
  running: boolean
  error: string | null
  thread?: boolean
  onRetry: () => void
}) {
  if (loading && empty && !error) return <ConversationSkeleton />
  if (error) return <div role="alert" className="flex w-full items-center gap-2.5 py-6">
    <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-border" />
    <span className="inline-flex h-8 min-w-0 items-center gap-2 rounded-full bg-card ps-1.5 pe-1 shadow-[0_0_0_1px_rgb(200_70_59/18%),0_1px_2px_rgb(20_20_18/4%)]">
      <span aria-hidden="true" className="grid size-[22px] shrink-0 place-items-center rounded-[7px] bg-[rgb(200_70_59/12%)] text-[#C8463B]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3"><path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01" /><path d="m3 3 18 18" /></svg>
      </span>
      <span className="min-w-0 truncate text-[12.5px] text-foreground">{userFacingError(error, '消息没加载出来')}</span>
      <button type="button" onClick={onRetry} className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-[rgb(200_70_59/10%)] ps-2 pe-2.5 text-xs font-semibold text-[#C8463B] hover:bg-[rgb(200_70_59/16%)] focus-visible:outline-2 focus-visible:outline-ring max-md:min-h-11 dark:text-[#E58A80]">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3"><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" /><path d="M21 3v5h-5" /></svg>重试
      </button>
    </span>
    <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-border" />
  </div>
  if (recovering) return <p role="status" className="px-6 py-4 text-center text-sm text-muted-foreground">正在同步任务状态…</p>
  if (running) return <span role="status" className="sr-only">正在回复</span>
  if (empty) return <div role="status" className="grid flex-1 place-items-center px-8 py-20 text-center text-sm text-muted-foreground">{thread ? '尚无回复' : '开始一段新对话'}</div>
  return null
}
