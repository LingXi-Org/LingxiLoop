import { BubbleChatIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { useConversations } from '@/features/conversations/store'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApp } from '@/stores/app'
import { CourseAvatar } from '../components/CourseAvatar'
import { statusLabel } from '../components/learningDisplay'
import type { LearningSpace } from '../contracts'
import type { LearningDashboardSection } from './navigation'

export const LEARNING_SECTION_COPY: Record<
  LearningDashboardSection,
  { title: string; description: string }
> = {
  overview: { title: '学习概览', description: '基于当前学习记录汇总' },
  activities: { title: '学习活动', description: '课程活动与证据提交' },
  learners: { title: '学习者', description: '课程学习者的学习记录' },
  content: { title: '课程内容', description: '课程目标与成功标准' },
  reviews: { title: '评价审核', description: '核对评价与学习证据' },
  members: { title: '成员与邀请', description: '管理课程访问与邀请' },
  calendar: { title: '日历', description: '课程与个人安排' },
  resources: { title: '资料', description: '按工作区管理个人资料' },
  settings: { title: '基本资料', description: '这些信息会显示给所有课程成员' },
  status: { title: '课程状态', description: '管理课程生命周期' },
}

export function DashboardSectionFrame({
  space,
  section,
  breadcrumb,
  headerActions,
  description,
  children,
}: {
  space: LearningSpace
  section: LearningDashboardSection
  breadcrumb?: { root: string; current: ReactNode; onBack(): void }
  description?: string
  headerActions?: ReactNode
  children: ReactNode
}) {
  const isMobile = useIsMobile()
  const copy = LEARNING_SECTION_COPY[section]
  const conversations = useConversations((state) => state.list)
  const selectedConversationId = useApp((state) => state.selectedConversationId)
  const learningConversationId =
    space.studyRoomId ??
    conversations.find((conversation) => conversation.id === selectedConversationId)?.id ??
    conversations[0]?.id ??
    null
  const spaceKindLabel = space.perspective === 'teacher' ? '教师' : '学生'
  const conversationAction = section === 'overview' && space.perspective === 'learner' && (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!learningConversationId}
      title={learningConversationId ? '进入当前学习区的课程对话' : '课程对话尚未准备好'}
      className={isMobile ? 'size-10 shrink-0 rounded-full p-0' : '@max-[32rem]/learning-grid:size-8 @max-[32rem]/learning-grid:p-0'}
      onClick={() => {
        if (learningConversationId)
          useApp.getState().selectConversation(learningConversationId)
      }}
    >
      <HugeiconsIcon icon={BubbleChatIcon} strokeWidth={2} />
      <span className={isMobile ? 'sr-only' : '@max-[32rem]/learning-grid:sr-only'}>{learningConversationId ? '继续学习对话' : '课程对话准备中'}</span>
    </Button>
  )

  const content = section === 'overview' ? (
    <div className="@container/learning-grid space-y-4 @min-[48rem]/learning-grid:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{space.perspective === 'teacher' ? '教学工作台' : '我的学习'}</p>
          <h2 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">{space.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{space.perspective === 'teacher' ? '了解班级进展，及时回应每一份学习成果。' : '从眼前的一步开始，让每一次学习都有收获。'}</p>
        </div>
        <Badge variant="outline" className="mt-1 bg-card">{statusLabel(space.status)}</Badge>
      </div>
      {children}
    </div>
  ) : children

  if (isMobile) return (
    <div className="@container/learning-grid flex h-full min-h-0 flex-col bg-muted/20 text-card-foreground">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-3">
        <div className="mx-auto max-w-7xl">
          <header className="mb-3 flex flex-wrap items-start gap-3 px-1">
            <CourseAvatar avatarUrl={space.avatarUrl} courseId={space.courseId ?? space.projectId} title={space.title} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {breadcrumb ? <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink asChild><Button type="button" variant="link" className="h-auto p-0 text-base" onClick={breadcrumb.onBack}>{breadcrumb.root}</Button></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem>{typeof breadcrumb.current === 'string' ? <BreadcrumbPage>{breadcrumb.current}</BreadcrumbPage> : breadcrumb.current}</BreadcrumbItem></BreadcrumbList></Breadcrumb> : <h1 className="font-heading text-lg font-medium text-foreground">{copy.title}</h1>}
                <Badge variant="secondary" className="h-5 px-2 text-[10px]">{spaceKindLabel}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{description ?? copy.description}</p>
            </div>
            {conversationAction}
            {headerActions ? <div className="order-last w-full min-w-0">{headerActions}</div> : null}
          </header>
          <div className="mobile-learning-dashboard [&_.gap-6]:gap-3 [&_.space-y-6]:space-y-3 [&_[data-slot=card]]:gap-4 [&_[data-slot=card]]:rounded-2xl [&_[data-slot=card]]:py-4 [&_[data-slot=card]]:shadow-sm [&_[data-slot=card]]:[--card-spacing:1rem]">
            {content}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="@container/learning-grid flex h-full min-h-0 flex-col bg-card text-card-foreground">
      <header className="flex min-h-14 shrink-0 items-center gap-2 py-1 border-b border-[var(--im-divider-weak)] px-3 @min-[48rem]/learning-grid:gap-3 @min-[48rem]/learning-grid:px-6">
        <CourseAvatar avatarUrl={space.avatarUrl} courseId={space.courseId ?? space.projectId} title={space.title} size="sm" />
        <div className="min-w-0 flex-1">
          {breadcrumb ? <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink asChild><Button type="button" variant="link" className="h-auto p-0 text-sm" onClick={breadcrumb.onBack}>{breadcrumb.root}</Button></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem>{typeof breadcrumb.current === 'string' ? <BreadcrumbPage>{breadcrumb.current}</BreadcrumbPage> : breadcrumb.current}</BreadcrumbItem></BreadcrumbList></Breadcrumb> : <h1 className="truncate font-heading text-sm font-medium">{copy.title}</h1>}
          <p className="text-xs text-muted-foreground">{description ?? copy.description}</p>
        </div>
        {headerActions ? <div className="min-w-0 flex-[2] overflow-hidden">{headerActions}</div> : null}
        {conversationAction}
        <Badge variant="secondary" className="@max-[36rem]/learning-grid:hidden">
          {spaceKindLabel}
        </Badge>
      </header>
      <div className={`min-h-0 flex-1 overflow-y-auto p-4 @min-[48rem]/learning-grid:p-6 ${section === 'overview' ? 'bg-muted/25' : ''}`}>
        <div className="mx-auto max-w-7xl">{content}</div>
      </div>
    </div>
  )
}
