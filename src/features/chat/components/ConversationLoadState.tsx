import { Button } from '@/components/ui/button'
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
  if (error) return <div role="alert" className="mx-auto grid w-full max-w-xl gap-3 px-6 py-8 text-center text-sm text-muted-foreground">
    <span>{userFacingError(error, '消息加载失败，请稍后重试。')}</span>
    <Button size="sm" variant="outline" className="justify-self-center" onClick={onRetry}>重试</Button>
  </div>
  if (recovering) return <p role="status" className="px-6 py-4 text-center text-sm text-muted-foreground">正在同步任务状态…</p>
  if (running) return <span role="status" className="sr-only">正在回复</span>
  if (empty) return <div role="status" className="grid flex-1 place-items-center px-8 py-20 text-center text-sm text-muted-foreground">{thread ? '尚无回复' : '开始一段新对话'}</div>
  return null
}
