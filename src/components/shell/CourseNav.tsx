import {
  Archive02Icon,
  BookOpen01Icon,
  ChartHistogramIcon,
  FolderLibraryIcon,
  MessageMultiple01Icon,
  Settings02Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { CourseAvatar } from '@/features/learning/components/CourseAvatar'
import type { LearningSpace } from '@/features/learning/contracts'
import { isLearningDashboardSectionAvailable } from '@/features/learning/dashboard/navigation'
import { forumSections } from '@/features/learning/forum/ForumSidebar'
import { useForumSection } from '@/features/learning/forum/forumSection'
import { useApp } from '@/stores/app'
import type { ViewKey } from '@/types'
import { SecondaryGroup, SecondaryItem, SecondaryPane, SecondaryTitle } from './SecondaryPane'

/** Nested sidebar for the course module: overview, forum, materials, cases and,
 * for course managers, the settings pages. */
export function CourseNav({ space, onNavigate }: { space?: LearningSpace; onNavigate?: () => void }) {
  const view = useApp((state) => state.view)
  const forumKind = useForumSection((state) => state.kind)
  const go = (next: ViewKey['view']) => { useApp.getState().setView(next); onNavigate?.() }
  const can = (section: Parameters<typeof isLearningDashboardSectionAvailable>[0]) => Boolean(space && isLearningDashboardSectionAvailable(section, space))

  const header = space
    ? <SecondaryTitle
        title={space.title}
        description={space.perspective === 'teacher' ? '教学工作台' : '我的学习'}
        media={<CourseAvatar avatarUrl={space.avatarUrl} courseId={space.courseId ?? space.projectId} title={space.title} size="sm" />}
        action={<Badge variant="secondary" className="shrink-0">{space.perspective === 'teacher' ? '教师' : '学生'}</Badge>}
      />
    : <SecondaryTitle title="课程" description="案例与课程资源" />

  return (
    <SecondaryPane label="课程导航" header={header}>
      <SecondaryGroup label="课程">
        {space ? <SecondaryItem label="概览" icon={ChartHistogramIcon} selected={view === 'learning'} onSelect={() => go('learning')} /> : null}
        {can('forum') ? <SecondaryItem label="论坛" icon={MessageMultiple01Icon} selected={view === 'forum'} onSelect={() => go('forum')} /> : null}
        {view === 'forum' && can('forum') ? forumSections.map((section) => (
          <SecondaryItem key={section.kind} depth={1} label={section.label} selected={forumKind === section.kind}
            onSelect={() => { useForumSection.getState().setKind(section.kind); onNavigate?.() }} />
        )) : null}
        {can('materials') ? <SecondaryItem label="课程资料" icon={FolderLibraryIcon} selected={view === 'course-materials'} onSelect={() => go('course-materials')} /> : null}
        <SecondaryItem label="案例库" icon={BookOpen01Icon} selected={view === 'cases'} onSelect={() => go('cases')} />
      </SecondaryGroup>
      {can('settings') ? (
        <SecondaryGroup label="管理">
          <SecondaryItem label="基本资料" icon={Settings02Icon} selected={view === 'courses'} onSelect={() => go('courses')} />
          <SecondaryItem label="成员与邀请" icon={UserGroupIcon} selected={view === 'course-members'} onSelect={() => go('course-members')} />
          <SecondaryItem label="课程状态" icon={Archive02Icon} selected={view === 'course-status'} onSelect={() => go('course-status')} />
        </SecondaryGroup>
      ) : null}
    </SecondaryPane>
  )
}
