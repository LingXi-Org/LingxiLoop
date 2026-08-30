import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { LearningCourse, LearningRole } from '../contracts'
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
    <header className="shrink-0 border-b border-border bg-card px-4 py-3 md:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        <div className="min-w-0 basis-full md:basis-auto md:flex-1">
          <p className="text-xs font-medium text-primary">学习</p>
          <h1 className="truncate font-heading text-lg font-medium">{course.title}</h1>
        </div>
        <Select value={projectId} onValueChange={onProjectChange}>
          <SelectTrigger aria-label="选择课程" className="min-w-0 flex-1 md:max-w-52 md:flex-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {courses.map((item) => <SelectItem key={item.projectId} value={item.projectId}>{item.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Badge variant="secondary">{perspective === 'teacher' ? '教师' : '学习者'}</Badge>
        {perspective === 'teacher' && <Button type="button" variant="secondary" onClick={onOpenTrust}>Trust Board</Button>}
      </div>
      <nav aria-label="学习中心分区" className="mx-auto mt-3 flex max-w-6xl gap-1 overflow-x-auto">
        {sections.map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={section === key ? 'default' : 'ghost'}
            aria-current={section === key ? 'page' : undefined}
            onClick={() => onSectionChange(key)}
          >
            {label}
          </Button>
        ))}
      </nav>
    </header>
  )
}
