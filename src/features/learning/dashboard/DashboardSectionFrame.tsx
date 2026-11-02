import { BubbleChatIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactNode } from 'react'
import { PageBody, PageHeader, PageLayout, type PageHeaderCrumb } from '@/components/shell/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConversations } from '@/features/conversations/store'
import { useApp } from '@/stores/app'
import { statusLabel } from '../components/learningDisplay'
import type { LearningSpace } from '../contracts'
import type { LearningDashboardSection } from './navigation'

export const LEARNING_SECTION_COPY: Record<
  LearningDashboardSection,
  { title: string }
> = {
  overview: { title: '概览' },
  members: { title: '成员与邀请' },
  forum: { title: '论坛' },
  materials: { title: '课程资料' },
  settings: { title: '基本资料' },
  status: { title: '课程状态' },
}

/** A course page: the shared PageHeader (course / section) over a 1200px body. */
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
  const copy = LEARNING_SECTION_COPY[section]
  const conversations = useConversations((state) => state.list)
  const conversationProjectId = useConversations((state) => state.projectId)
  const selectedConversationId = useApp((state) => state.selectedConversationId)
  const learningConversationId = conversationProjectId !== space.projectId ? null :
    conversations.find((conversation) => conversation.id === space.studyRoomId)?.id ??
    conversations.find((conversation) => conversation.id === selectedConversationId)?.id ??
    conversations[0]?.id ??
    null
  const conversationAction = section === 'overview' && space.perspective === 'learner' && (
    <Button
      type="button"
      variant="outline"
      disabled={!learningConversationId}
      title={learningConversationId ? '进入当前学习区的课程对话' : '课程对话尚未准备好'}
      className="max-md:size-11 max-md:p-0"
      onClick={() => {
        const current = useConversations.getState()
        if (learningConversationId && current.projectId === space.projectId && current.list.some((conversation) => conversation.id === learningConversationId))
          useApp.getState().selectConversation(learningConversationId)
      }}
    >
      <HugeiconsIcon icon={BubbleChatIcon} strokeWidth={2} data-icon="inline-start" />
      <span className="max-md:sr-only">{learningConversationId ? '继续学习对话' : '课程对话准备中'}</span>
    </Button>
  )

  const crumbs: PageHeaderCrumb[] = [{ label: space.title }]
  if (breadcrumb) crumbs.push({ label: breadcrumb.root, onSelect: breadcrumb.onBack })
  const title = breadcrumb ? breadcrumb.current : copy.title

  return (
    <PageLayout
      scrollProps={{ 'data-forum-scroll': section === 'forum' ? '' : undefined }}
      header={<PageHeader
        title={title}
        crumbs={crumbs}
        actions={<>
          {section === 'overview' ? <Badge variant="outline" className="max-sm:hidden">{statusLabel(space.status)}</Badge> : null}
          {headerActions}
          {conversationAction}
        </>}
      />}
    >
      <PageBody className="@container/learning-grid">{children}</PageBody>
    </PageLayout>
  )
}
