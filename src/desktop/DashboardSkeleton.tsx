import { Skeleton } from '@/components/ui/skeleton'
import type { ViewKey } from '@/types'
export function DashboardSkeleton(_props: { view: ViewKey['view']; perspective?: 'teacher' | 'learner' }) {
  return <div role="status" className="space-y-4 p-6"><span className="sr-only">正在加载课程页面…</span>{[0,1,2].map(id => <Skeleton key={id} className="h-36 w-full motion-reduce:animate-none" />)}</div>
}
