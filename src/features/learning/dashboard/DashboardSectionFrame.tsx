import { BubbleChatIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConversations } from '@/features/conversations/store'
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
  children,
}: {
  space: LearningSpace
  section: LearningDashboardSection
  children: ReactNode
}) {
  const copy = LEARNING_SECTION_COPY[section]
  const conversations = useConversations((state) => state.list)
  const selectedConversationId = useApp((state) => state.selectedConversationId)
  const learningConversationId =
    space.studyRoomId ??
    conversations.find((conversation) => conversation.id === selectedConversationId)?.id ??
    conversations[0]?.id ??
    null
  return (
    <div className="@container/learning-grid flex h-full min-h-0 flex-col bg-card text-card-foreground">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--im-divider-weak)] px-4 @min-[48rem]/learning-grid:px-6">
        <CourseAvatar courseId={space.courseId ?? space.projectId} title={space.title} size="sm" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-sm font-medium">{copy.title}</h1>
          <p className="sr-only">{copy.description}</p>
        </div>
        {section === 'overview' && space.perspective === 'learner' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!learningConversationId}
            title={learningConversationId ? '进入当前学习区的课程对话' : '课程对话尚未准备好'}
            onClick={() => {
              if (learningConversationId)
                useApp.getState().selectConversation(learningConversationId)
            }}
          >
            <HugeiconsIcon icon={BubbleChatIcon} strokeWidth={2} />
            {learningConversationId ? '继续学习对话' : '课程对话准备中'}
          </Button>
        )}
        <Badge variant="secondary">
          {space.projectKind === 'PERSONAL_LEARNING'
            ? '个人学习区'
            : space.perspective === 'teacher'
              ? '课程创建者'
              : '学习者'}
        </Badge>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 @min-[48rem]/learning-grid:p-6">
        <div className="mx-auto max-w-7xl">{children}</div>
      </div>
    </div>
  )
}
