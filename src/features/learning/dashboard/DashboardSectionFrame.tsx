import type { ReactNode } from 'react'
import { CourseAvatar } from '../components/CourseAvatar'
import type { LearningSpace } from '../contracts'
import type { LearningDashboardSection } from './navigation'
export const LEARNING_SECTION_COPY = { forum: { title: '学习论坛' } }
export function DashboardSectionFrame({ space, children }: { space: LearningSpace; section: LearningDashboardSection; children: ReactNode }) {
  return <section className="@container/learning-grid flex h-full min-h-0 flex-col bg-background">
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-6"><CourseAvatar courseId={space.courseId ?? space.projectId} avatarUrl={space.avatarUrl} title={space.title} size="sm" /><h1 className="truncate text-sm font-semibold">{space.title} · 学习论坛</h1></header>
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
  </section>
}
