import { Skeleton } from '@/components/ui/skeleton'
import { CalendarSkeleton } from '@/features/calendar/components/CalendarSkeleton'
import { SourceFoldersSkeleton } from '@/features/knowledge/components/SourceSkeletons'
import { CourseSettingsSkeleton, OverviewSkeleton } from '@/features/learning/dashboard/LearningSkeletons'
import type { ViewKey } from '@/types'

export function DashboardSkeleton({ view, perspective }: { view: ViewKey['view']; perspective?: 'teacher' | 'learner' }) {
  return <div className="@container/calendar flex h-full min-h-0 flex-col overflow-hidden">
    <div aria-hidden="true" className="flex h-14 shrink-0 items-center gap-4 border-b px-5"><Skeleton className="h-5 w-32" /><Skeleton className="ms-auto h-8 w-24" /></div>
    {view === 'calendar' ? <CalendarSkeleton /> : <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      {view === 'library' ? <SourceFoldersSkeleton /> : view === 'learning' ? <OverviewSkeleton perspective={perspective} /> : <CourseSettingsSkeleton section={view} />}
    </div>}
  </div>
}
