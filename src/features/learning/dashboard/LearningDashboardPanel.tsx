import { BubbleChatIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CalendarView } from '@/features/calendar/components/CalendarView'
import { useConversations } from '@/features/conversations/store'
import { CourseSourceDrive } from '@/features/knowledge/components/CourseSourceDrive'
import { PersonalSourceDrive } from '@/features/knowledge/components/PersonalSourceDrive'
import { userFacingError } from '@/lib/userFacingError'
import { useApp } from '@/stores/app'
import { CourseAvatar } from '../components/CourseAvatar'
import { LearningActivitiesSection } from '../components/LearningActivitiesSection'
import { LearningEvidenceSection } from '../components/LearningEvidenceSection'
import { LearningObjectivesSection } from '../components/LearningObjectivesSection'
import { LearningReviewsSection } from '../components/LearningReviewsSection'
import type { LearningCourse, LearningSpace } from '../contracts'
import { CourseMembersSection } from './CourseMembersSection'
import { CourseSettingsSection } from './CourseSettingsSection'
import { MissionSection } from './MissionSection'
import type { LearningDashboardSection } from './navigation'
import { OverviewSection } from './OverviewSection'
import { TeacherLearnersSection } from './TeacherLearnersSection'
import { useLearningDashboardData } from './useLearningDashboardData'

const SECTION_COPY: Record<LearningDashboardSection, { title: string; description: string }> = {
  overview: { title: '学习概览', description: '基于当前学习记录汇总' },
  plan: { title: '学习计划', description: '持续任务与真实步骤进展' },
  objectives: { title: '学习目标', description: '目标、成功标准与掌握状态' },
  missions: { title: '学习任务', description: '课程中的持续学习任务' },
  activities: { title: '学习活动', description: '课程活动与证据提交' },
  evidence: { title: '学习证据', description: '尝试、评价与反馈记录' },
  learners: { title: '学习者', description: '课程学习者的学习记录' },
  content: { title: '课程内容', description: '课程目标与成功标准' },
  reviews: { title: '评价审核', description: '核对评价与学习证据' },
  members: { title: '分享与成员', description: '管理课程访问与邀请' },
  calendar: { title: '日历', description: '课程与个人安排' },
  resources: { title: '资料', description: '按工作区管理个人资料' },
  settings: { title: '课程设置', description: '课程资料与生命周期' },
}

function DashboardSectionFrame({ space, section, children }: {
  space: LearningSpace
  section: LearningDashboardSection
  children: React.ReactNode
}) {
  const copy = section === 'resources'
    ? { ...SECTION_COPY.resources, title: space.projectKind === 'PERSONAL_LEARNING' ? '个人学习资料' : '班级资料' }
    : SECTION_COPY[section]
  const conversations = useConversations((state) => state.list)
  const selectedConversationId = useApp((state) => state.selectedConversationId)
  const learningConversationId = space.studyRoomId
    ?? conversations.find((conversation) => conversation.id === selectedConversationId)?.id
    ?? conversations[0]?.id
    ?? null
  return (
    <div className="@container/learning-grid flex h-full min-h-0 flex-col bg-card text-card-foreground">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--im-divider-weak)] px-4 @min-[48rem]/learning-grid:px-6">
        <CourseAvatar courseId={space.courseId ?? space.projectId} title={space.title} size="sm" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-sm font-medium">{copy.title}</h1>
          {section !== 'resources' ? <p className="sr-only">{copy.description}</p> : null}
        </div>
        {section === 'overview' && space.perspective === 'learner' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!learningConversationId}
            title={learningConversationId ? '进入当前学习区的课程对话' : '课程对话尚未准备好'}
            onClick={() => {
              if (learningConversationId) useApp.getState().selectConversation(learningConversationId)
            }}
          >
            <HugeiconsIcon icon={BubbleChatIcon} strokeWidth={2} />
            {learningConversationId ? '继续学习对话' : '课程对话准备中'}
          </Button>
        )}
        <Badge variant="secondary">
          {space.projectKind === 'PERSONAL_LEARNING' ? '个人学习区' : space.perspective === 'teacher' ? '课程创建者' : '学习者'}
        </Badge>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 @min-[48rem]/learning-grid:p-6">
        <div className="mx-auto max-w-7xl">{children}</div>
      </div>
    </div>
  )
}

export function LearningDashboardPanel({ space, spaces, section, onOpenLearningSpace }: {
  space: LearningSpace
  spaces: LearningSpace[]
  section: LearningDashboardSection
  onOpenLearningSpace(projectId: string): void
}) {
  if (section === 'calendar') return <CalendarView />
  if (section === 'resources') {
    return <DashboardSectionFrame space={space} section={section}>
      {space.projectKind === 'PERSONAL_LEARNING'
        ? <PersonalSourceDrive spaces={spaces} onOpenLearningSpace={onOpenLearningSpace} />
        : <CourseSourceDrive space={space} />}
    </DashboardSectionFrame>
  }
  if (section === 'learners') return <DashboardSectionFrame space={space} section={section}>{space.canReview ? <TeacherLearnersSection projectId={space.projectId} /> : <CapabilityNotice message="当前课程状态下无法查看学习者审核资料。" />}</DashboardSectionFrame>
  if (section === 'members') return <DashboardSectionFrame space={space} section={section}><CourseMembersSection space={space} /></DashboardSectionFrame>
  if (section === 'settings') return <DashboardSectionFrame space={space} section={section}><CourseSettingsSection space={space} /></DashboardSectionFrame>
  return <LearningDataSection space={space} section={section} />
}

function LearningDataSection({ space, section }: { space: LearningSpace; section: LearningDashboardSection }) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [mutationError, setMutationError] = useState('')
  const {
    overview,
    resources,
    overviewLoading,
    resourcesLoading,
    overviewError,
    resourcesError,
    refreshResources,
  } = useLearningDashboardData(space.projectId, space.perspective, space.canReview)
  const course: LearningCourse = {
    projectId: space.projectId,
    courseId: space.courseId ?? undefined,
    projectKind: space.projectKind,
    title: space.title,
    description: space.description,
    status: space.status,
    perspective: space.perspective,
    canManage: space.canManage,
    canEditContent: space.canEditContent,
    canSubmit: space.canSubmit,
    canReview: space.canReview,
  }

  const error = section === 'overview' ? overviewError : resourcesError || mutationError
  const loading = section === 'overview' ? overviewLoading && !overview : resourcesLoading

  let content: React.ReactNode
  if (loading) {
    content = section === 'overview'
      ? <ResourceSkeleton variant="cards" count={6} label="正在加载学习概览" />
      : <ResourceSkeleton variant={section === 'reviews' ? 'table' : 'list'} count={5} label={`正在加载${SECTION_COPY[section].title}`} />
  } else if (section === 'overview') {
    content = overview
      ? <OverviewSection overview={overview} />
      : <RetryState message="学习概览暂时不可用。" onRetry={() => window.dispatchEvent(new Event('lingxiloop:learning-updated'))} />
  } else if (section === 'plan' || section === 'missions') {
    content = <MissionSection missions={resources.missions} personal={space.projectKind === 'PERSONAL_LEARNING'} />
  } else if (section === 'objectives' || section === 'content') {
    content = <LearningObjectivesSection course={course} objectives={resources.objectives} perspective={space.perspective} mastery={new Map()} onChanged={refreshResources} onError={(reason) => setMutationError(userFacingError(reason, '学习目标操作未完成，请稍后重试。'))} />
  } else if (section === 'activities') {
    content = <LearningActivitiesSection course={course} activities={resources.activities} evidence={resources.evidence} perspective={space.perspective} answers={answers} setAnswers={setAnswers} onChanged={refreshResources} onError={(reason) => setMutationError(userFacingError(reason, '学习活动操作未完成，请稍后重试。'))} />
  } else if (section === 'evidence') {
    content = <LearningEvidenceSection evidence={resources.evidence} />
  } else if (section === 'reviews') {
    content = <LearningReviewsSection course={course} reviews={resources.reviews} progress={[]} onChanged={refreshResources} onError={(reason) => setMutationError(userFacingError(reason, '评价审核操作未完成，请稍后重试。'))} />
  } else {
    content = <RetryState message="当前页面暂不可用。" onRetry={() => window.dispatchEvent(new Event('lingxiloop:learning-updated'))} />
  }

  return (
    <DashboardSectionFrame space={space} section={section}>
      <div className="space-y-4">
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {space.perspective === 'teacher' && !space.canEditContent && ['content', 'activities'].includes(section) && (
          <Alert><AlertDescription>你可以查看本课程，但当前状态下不能修改或发布内容。</AlertDescription></Alert>
        )}
        {space.perspective === 'teacher' && !space.canReview && section === 'reviews' && (
          <Alert><AlertDescription>当前课程状态下不能处理评价审核。</AlertDescription></Alert>
        )}
        {content}
      </div>
    </DashboardSectionFrame>
  )
}

function RetryState({ message, onRetry }: { message: string; onRetry(): void }) {
  return <div className="grid min-h-64 place-items-center rounded-3xl border border-dashed p-6 text-center"><div><p className="text-sm text-muted-foreground">{message}</p><Button type="button" variant="outline" className="mt-4" onClick={onRetry}>重新加载</Button></div></div>
}

function CapabilityNotice({ message }: { message: string }) {
  return <Alert><AlertDescription>{message}</AlertDescription></Alert>
}
