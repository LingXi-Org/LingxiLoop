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
  members: { title: '分享与成员', description: '管理课程访问与邀请' },
  calendar: { title: '日历', description: '课程与个人安排' },
  resources: { title: '资料', description: '按工作区管理个人资料' },
  settings: { title: '课程设置', description: '课程资料与生命周期' },
}

export function DashboardSectionFrame({
  space,
  section,
  breadcrumb,
  headerActions,
  children,
}: {
  space: LearningSpace
  section: LearningDashboardSection
  breadcrumb?: { root: string; current: string; onBack(): void }
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
  const spaceKindLabel = space.projectKind === 'PERSONAL_LEARNING'
    ? '个人学习区'
    : space.perspective === 'teacher'
      ? '课程创建者'
      : '学习者'
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

  if (isMobile) return (
    <div className="@container/learning-grid flex h-full min-h-0 flex-col bg-muted/20 text-card-foreground">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-3">
        <div className="mx-auto max-w-7xl">
          <header className="mb-3 flex flex-wrap items-start gap-3 px-1">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {breadcrumb ? <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink asChild><Button type="button" variant="link" className="h-auto p-0 text-base" onClick={breadcrumb.onBack}>{breadcrumb.root}</Button></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage className="text-base">{breadcrumb.current}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb> : <h1 className="font-heading text-lg font-medium text-foreground">{copy.title}</h1>}
                <Badge variant="secondary" className="h-5 px-2 text-[10px]">{spaceKindLabel}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{copy.description}</p>
            </div>
            {conversationAction}
            {headerActions ? <div className="order-last w-full min-w-0">{headerActions}</div> : null}
          </header>
          <div className="mobile-learning-dashboard [&_.gap-6]:gap-3 [&_.space-y-6]:space-y-3 [&_[data-slot=card]]:gap-4 [&_[data-slot=card]]:rounded-2xl [&_[data-slot=card]]:py-4 [&_[data-slot=card]]:shadow-sm [&_[data-slot=card]]:[--card-spacing:1rem]">
            {children}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="@container/learning-grid flex h-full min-h-0 flex-col bg-card text-card-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--im-divider-weak)] px-3 @min-[48rem]/learning-grid:gap-3 @min-[48rem]/learning-grid:px-6">
        <CourseAvatar courseId={space.courseId ?? space.projectId} title={space.title} size="sm" />
        <div className="min-w-0 flex-1">
          {breadcrumb ? <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink asChild><Button type="button" variant="link" className="h-auto p-0 text-sm" onClick={breadcrumb.onBack}>{breadcrumb.root}</Button></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage className="max-w-72 truncate text-sm">{breadcrumb.current}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb> : <h1 className="truncate font-heading text-sm font-medium">{copy.title}</h1>}
          <p className="sr-only">{copy.description}</p>
        </div>
        {headerActions ? <div className="min-w-0 flex-[2] overflow-hidden">{headerActions}</div> : null}
        {conversationAction}
        <Badge variant="secondary" className="@max-[36rem]/learning-grid:hidden">
          {spaceKindLabel}
        </Badge>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 @min-[48rem]/learning-grid:p-6">
        <div className="mx-auto max-w-7xl">{children}</div>
      </div>
    </div>
  )
}
