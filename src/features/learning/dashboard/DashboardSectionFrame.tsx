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
  { title: string }
> = {
  overview: { title: '学习概览' },
  activities: { title: '学习活动' },
  learners: { title: '学习者' },
  content: { title: '课程内容' },
  reviews: { title: '评价审核' },
  members: { title: '成员与邀请' },
  calendar: { title: '日历' },
  resources: { title: '课程资料' },
  settings: { title: '基本资料' },
  status: { title: '课程状态' },
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
  breadcrumb?: { root: string; current: ReactNode; onBack(): void }
  headerActions?: ReactNode
  children: ReactNode
}) {
  const isMobile = useIsMobile()
  const copy = LEARNING_SECTION_COPY[section]
  const conversations = useConversations((state) => state.list)
  const conversationProjectId = useConversations((state) => state.projectId)
  const selectedConversationId = useApp((state) => state.selectedConversationId)
  const learningConversationId = conversationProjectId !== space.projectId ? null :
    conversations.find((conversation) => conversation.id === space.studyRoomId)?.id ??
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
      className={isMobile ? 'size-11 shrink-0 p-0' : '@max-[32rem]/learning-grid:size-9 @max-[32rem]/learning-grid:p-0'}
      onClick={() => {
        const current = useConversations.getState()
        if (learningConversationId && current.projectId === space.projectId && current.list.some((conversation) => conversation.id === learningConversationId))
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
          <h2 className="text-base font-semibold [overflow-wrap:anywhere]">{space.title}</h2>
        </div>
        <Badge variant="outline" className="mt-1 bg-card">{statusLabel(space.status)}</Badge>
      </div>
      {children}
    </div>
  ) : children

  if (isMobile) return (
    <div className="@container/learning-grid flex h-full min-h-0 flex-col bg-muted/20 text-card-foreground">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-[1200px]">
          <header className="mb-4 flex min-h-11 flex-wrap items-center gap-3">
            <CourseAvatar avatarUrl={space.avatarUrl} courseId={space.courseId ?? space.projectId} title={space.title} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {breadcrumb ? <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink asChild><Button type="button" variant="link" className="h-auto p-0 text-base" onClick={breadcrumb.onBack}>{breadcrumb.root}</Button></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem>{typeof breadcrumb.current === 'string' ? <BreadcrumbPage>{breadcrumb.current}</BreadcrumbPage> : breadcrumb.current}</BreadcrumbItem></BreadcrumbList></Breadcrumb> : <h1 className="font-heading text-xl font-semibold text-foreground">{copy.title}</h1>}
                <Badge variant="secondary" className="h-5 px-2 text-xs">{spaceKindLabel}</Badge>
              </div>
            </div>
            {conversationAction}
            {headerActions ? <div className="order-last w-full min-w-0">{headerActions}</div> : null}
          </header>
          <div className="mobile-learning-dashboard">
            {content}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="@container/learning-grid flex h-full min-h-0 flex-col bg-card text-card-foreground">
      <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b border-[var(--im-divider-weak)] px-6 py-3">
        <CourseAvatar avatarUrl={space.avatarUrl} courseId={space.courseId ?? space.projectId} title={space.title} size="sm" />
        <div className="min-w-0 flex-1">
          {breadcrumb ? <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink asChild><Button type="button" variant="link" className="h-auto p-0 text-sm" onClick={breadcrumb.onBack}>{breadcrumb.root}</Button></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem>{typeof breadcrumb.current === 'string' ? <BreadcrumbPage>{breadcrumb.current}</BreadcrumbPage> : breadcrumb.current}</BreadcrumbItem></BreadcrumbList></Breadcrumb> : <h1 className="font-heading text-xl font-semibold [overflow-wrap:anywhere]">{copy.title}</h1>}
        </div>
        {headerActions ? <div className="min-w-0 flex-[2] @max-[40rem]/learning-grid:order-last @max-[40rem]/learning-grid:basis-full">{headerActions}</div> : null}
        {conversationAction}
        <Badge variant="secondary" className="@max-[36rem]/learning-grid:hidden">
          {spaceKindLabel}
        </Badge>
      </header>
      <div className={`min-h-0 flex-1 overflow-y-auto p-6 ${section === 'overview' ? 'bg-muted/25' : ''}`}>
        <div className="mx-auto max-w-[1200px]">{content}</div>
      </div>
    </div>
  )
}
