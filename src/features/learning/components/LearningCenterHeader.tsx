import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { LearningCourse, LearningRole } from '../contracts'
import { CourseAvatar } from './CourseAvatar'
import type { LearningSection } from './learningDisplay'

interface LearningCenterHeaderProps {
  course: LearningCourse
  courses: LearningCourse[]
  projectId: string
  perspective: LearningRole
  section: LearningSection
  reviewCount: number
  onProjectChange(projectId: string): void
  onSectionChange(section: LearningSection): void
  onOpenTrust(): void
}

export function LearningCenterHeader({
  course, courses, projectId, perspective, section, reviewCount, onProjectChange, onSectionChange, onOpenTrust,
}: LearningCenterHeaderProps) {
  const sections: Array<[LearningSection, string]> = perspective === 'teacher'
    ? [
        ['today', '总览'], ['objectives', '目标与内容'], ['activities', '发布管理'],
        ['reviews', `评价审核${reviewCount ? ` · ${reviewCount}` : ''}`], ['notifications', '提醒'],
      ]
    : [
        ['today', '今日'], ['objectives', '目标图'], ['activities', '活动'],
        ['evidence', '掌握证据'], ['notifications', '提醒'],
      ]

  return (
    <header className="shrink-0 bg-card">
      <div className="flex h-12 items-center gap-3 border-b border-[var(--im-divider-weak)] px-4 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <CourseAvatar courseId={course.courseId ?? course.projectId} title={course.title} />
          <h1 className="truncate font-heading text-sm font-medium">{course.title}</h1>
        </div>
        <Badge variant="secondary">{perspective === 'teacher' ? '教师' : '学习者'}</Badge>
        {perspective === 'teacher' && <Button type="button" size="sm" variant="secondary" onClick={onOpenTrust}>Trust Board</Button>}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--im-divider-weak)] px-4 py-2 md:px-6">
        <Select value={projectId} onValueChange={onProjectChange}>
          <SelectTrigger aria-label="选择课程" className="min-w-44 flex-1 md:max-w-52 md:flex-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {courses.map((item) => (
              <SelectItem key={item.projectId} value={item.projectId}>
                <span className="flex items-center gap-2">
                  <CourseAvatar courseId={item.courseId ?? item.projectId} title={item.title} size="sm" />
                  <span>{item.title}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tabs value={section} onValueChange={(value) => onSectionChange(value as LearningSection)} className="min-w-0 flex-1">
          <TabsList variant="line" aria-label="学习中心分区" className="max-w-full justify-start overflow-x-auto">
            {sections.map(([key, label]) => <TabsTrigger key={key} value={key}>{label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      </div>
    </header>
  )
}
