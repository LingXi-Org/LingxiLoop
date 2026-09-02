import { HugeiconsIcon } from '@hugeicons/react'
import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AppThemeProvider } from '@/components/AppThemeProvider'
import { GlobalInteractionProvider } from '@/components/GlobalInteractionProvider'
import { NavUser } from '@/components/nav-user'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { WorkspaceRail } from '@/desktop/WorkspaceRail'
import type {
  LearnerLearningOverview,
  LearningActivity,
  LearningCourse,
  LearningDashboard,
  LearningEvidence,
  LearningMission,
  LearningObjective,
  LearningSpace,
} from '@/features/learning/contracts'
import { CourseSettingsSection } from '@/features/learning/dashboard/CourseSettingsSection'
import { LearnerOverviewDashboard } from '@/features/learning/dashboard/LearnerOverviewDashboard'
import { getLearningDashboardMenu, type LearningDashboardSection } from '@/features/learning/dashboard/navigation'
import { TeacherOverviewDashboard } from '@/features/learning/dashboard/TeacherOverviewDashboard'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { useSettingsDialog } from '@/features/settings/store'
import { useWorkspace } from '@/features/knowledge/workspace'
import { useAuth } from '@/stores/auth'
import '@/styles/globals.css'
import './settings-dashboard.css'

type Scenario = 'personal' | 'learner' | 'teacher'

const params = new URLSearchParams(window.location.search)
const requestedTheme = params.get('theme') === 'light' ? 'light' : 'dark'
const readOnly = params.get('readonly') === 'true'
const requestedScenario = params.get('scenario')
const initialScenario: Scenario = requestedScenario === 'learner' || requestedScenario === 'teacher'
  ? requestedScenario
  : 'personal'
localStorage.setItem('lingxiloop-theme', requestedTheme)

const fixtureUser = {
  id: 'fixture-user',
  name: '林小溪',
  email: 'xiaoxi@example.cn',
  emailVerified: true,
  providers: ['lingxi'],
}

useAuth.setState({
  token: 'fixture-token',
  user: fixtureUser,
  companies: [{ id: 'fixture-company', name: '我的学习', slug: 'my-learning', role: 'owner', status: 'ACTIVE' }],
  activeCompanyId: 'fixture-company',
  personalCompanyId: 'fixture-company',
  ready: true,
  serverCapabilities: { invitationEmail: false },
})

useWorkspace.setState({
  companyId: 'fixture-company',
  selectedId: 'fixture-personal',
  loaded: true,
  loading: false,
  error: null,
  list: [
    {
      id: 'fixture-personal',
      companyId: 'fixture-company',
      kind: 'PERSONAL_LEARNING',
      planId: null,
      name: '我的学习',
      description: '个人学习区',
      color: null,
      status: 'ACTIVE',
      createdBy: fixtureUser.id,
      isDefault: true,
      createdAt: '2026-08-01T08:00:00.000Z',
      updatedAt: '2026-08-31T08:00:00.000Z',
      archivedAt: null,
      lastVisitedAt: '2026-08-31T08:00:00.000Z',
      sourceCount: 3,
      conversationCount: 1,
      documentCount: 2,
      calendarEventCount: 1,
      canvasCount: 0,
      canManage: true,
    },
  ],
})

useSettingsDialog.setState({ open: false, activeSection: 'account' })

const learnerOverview: LearnerLearningOverview = {
  perspective: 'learner',
  windowDays: 30,
  summary: {
    dueReviews: 2,
    verifiedObjectives: 7,
    activeMissions: 3,
    evidenceAttempts: 18,
  },
  masteryDistribution: [
    { level: 0, count: 2 },
    { level: 1, count: 3 },
    { level: 2, count: 5 },
    { level: 3, count: 4 },
    { level: 4, count: 2 },
  ],
  attemptTrend: [
    { date: '2026-08-05', count: 1 },
    { date: '2026-08-12', count: 3 },
    { date: '2026-08-19', count: 2 },
    { date: '2026-08-26', count: 5 },
  ],
  assistanceDistribution: [
    { assistance: 'NONE', count: 10 },
    { assistance: 'HINT', count: 5 },
    { assistance: 'GUIDED', count: 3 },
  ],
  dueReviews: [
    {
      knowledgeUnitId: 'review-1',
      title: '用证据说明设计选择',
      level: 2,
      status: 'DUE',
      nextReviewAt: '2026-09-01T10:00:00.000Z',
    },
    {
      knowledgeUnitId: 'review-2',
      title: '梳理用户研究结论',
      level: 3,
      status: 'DUE',
      nextReviewAt: '2026-09-03T10:00:00.000Z',
    },
  ],
  missionProgress: [
    {
      missionId: 'mission-1',
      goal: '完成一份可验证的研究报告',
      status: 'ACTIVE',
      completedSteps: 3,
      totalSteps: 5,
      updatedAt: '2026-08-30T10:00:00.000Z',
    },
  ],
}

const learnerObjectives: LearningObjective[] = [
  {
    id: 'objective-research',
    projectId: 'fixture-project',
    title: '形成可验证的研究判断',
    successCriteria: '每个判断都能关联访谈或测试证据',
    targetLevel: 3,
    position: 0,
    status: 'PUBLISHED',
    prerequisiteIds: [],
  },
  {
    id: 'objective-prototype',
    projectId: 'fixture-project',
    title: '用原型验证关键假设',
    successCriteria: '完成至少一轮不同场景的可用性验证',
    targetLevel: 4,
    position: 1,
    status: 'PUBLISHED',
    prerequisiteIds: ['objective-research'],
  },
]

const learnerActivities: LearningActivity[] = [
  {
    id: 'activity-open',
    projectId: 'fixture-project',
    title: '整理访谈证据卡',
    instructions: '选择一个关键判断，提交原始观察、推理过程和结论。',
    kind: 'PRACTICE',
    status: 'PUBLISHED',
    evaluationMode: 'AGENT_FORMATIVE',
    targetLevel: 3,
    rubric: [{ criterion: '结论可追溯到原始观察' }, { criterion: '区分事实与推断' }],
    knowledgeUnitIds: ['objective-research'],
    dueAt: '2026-09-05T10:00:00.000Z',
  },
  {
    id: 'activity-closed',
    projectId: 'fixture-project',
    title: '第一轮假设复盘',
    instructions: '回看第一轮测试并记录尚未解决的问题。',
    kind: 'REVIEW',
    status: 'CLOSED',
    evaluationMode: 'TEACHER_REQUIRED',
    targetLevel: 2,
    rubric: [{ criterion: '明确记录未验证假设' }],
    knowledgeUnitIds: ['objective-prototype'],
    dueAt: '2026-08-20T10:00:00.000Z',
  },
  {
    id: 'activity-submitted',
    projectId: 'fixture-project',
    title: '提交可用性测试记录',
    instructions: '提交观察记录与迭代说明。',
    kind: 'ASSESSMENT',
    status: 'PUBLISHED',
    evaluationMode: 'TEACHER_REQUIRED',
    targetLevel: 4,
    rubric: [{ criterion: '观察与迭代选择相互对应' }],
    knowledgeUnitIds: ['objective-prototype'],
    dueAt: '2026-09-02T10:00:00.000Z',
  },
]

const learnerMissions: LearningMission[] = [
  {
    id: 'mission-1',
    projectId: 'fixture-project',
    courseId: 'fixture-course',
    learnerId: fixtureUser.id,
    conversationId: 'fixture-conversation',
    triggerClientMsgNo: 'fixture-message',
    goal: '完成一份可验证的研究报告',
    successCriteria: '报告中的核心判断均有证据来源和验证记录',
    kind: 'PROJECT',
    coordinatorAgentId: 'fixture-agent',
    status: 'ACTIVE',
    steps: [
      {
        id: 'step-complete',
        kind: 'LEARN',
        description: '归纳访谈中的关键模式',
        successCriteria: '至少形成三个带出处的模式',
        knowledgeUnitId: 'objective-research',
        status: 'COMPLETED',
        position: 0,
        outcome: '整理了三类高频障碍，并保留原始访谈索引。',
        completionAttemptId: 'evidence-step',
      },
      {
        id: 'step-open',
        kind: 'CHECK',
        description: '用第二轮原型验证判断',
        successCriteria: '记录验证结果与下一轮修改',
        knowledgeUnitId: 'objective-prototype',
        status: 'OPEN',
        position: 1,
      },
    ],
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-31T08:00:00.000Z',
  },
]

const learnerEvidence: LearningEvidence[] = [
  {
    id: 'evidence-activity',
    activity_id: 'activity-submitted',
    mission_step_id: null,
    assistance: 'NONE',
    status: 'ACCEPTED',
    evidence: { answer: '记录了五名参与者的关键路径与失败点。' },
    created_at: '2026-09-01T08:00:00.000Z',
    evaluation_id: 'evaluation-activity',
    demonstrated_level: 3,
    confidence: 0.88,
    rubric_results: [{ criterion: '观察与迭代选择相互对应', met: true }],
    feedback: '证据链清楚；下一次可以补充边界场景。',
    evaluation_status: 'ACCEPTED',
  },
  {
    id: 'evidence-step',
    activity_id: null,
    mission_step_id: 'step-complete',
    assistance: 'HINT',
    status: 'ACCEPTED',
    evidence: { summary: '归纳了三个模式并附上访谈索引。' },
    created_at: '2026-08-30T08:00:00.000Z',
    evaluation_id: 'evaluation-step',
    demonstrated_level: 2,
    confidence: 0.81,
    rubric_results: [{ criterion: '模式保留原始出处', score: 4 }],
    feedback: '模式与原始记录关联完整。',
    evaluation_status: 'ACCEPTED',
  },
]

const learnerStates: LearningDashboard['states'] = [
  {
    projectId: 'fixture-project',
    knowledgeUnitId: 'objective-research',
    title: '形成可验证的研究判断',
    level: 3,
    status: 'VERIFIED',
    nextReviewAt: '2026-09-08T10:00:00.000Z',
    reviewIntervalDays: 7,
  },
  {
    projectId: 'fixture-project',
    knowledgeUnitId: 'objective-prototype',
    title: '用原型验证关键假设',
    level: 2,
    status: 'LEARNING',
    nextReviewAt: '2026-09-04T10:00:00.000Z',
    reviewIntervalDays: 3,
  },
]

const teacherSpace: LearningSpace = {
  companyId: 'fixture-company',
  projectId: 'fixture-teacher',
  projectKind: 'TEACHING',
  courseId: 'fixture-course',
  title: '产品设计基础',
  description: '从真实学习证据出发，建立可验证的产品设计能力。',
  color: '#5266d6',
  status: 'ACTIVE',
  perspective: 'teacher',
  canManage: true,
  canEditContent: true,
  canUpdateCourse: true,
  canInviteMembers: true,
  canRevokeInvitations: true,
  canUpdateMembers: true,
  canRemoveMembers: true,
  canSubmit: false,
  canReview: true,
  lifecycleAction: 'END',
  studyRoomId: 'fixture-room',
  isDefault: false,
  lastVisitedAt: '2026-08-31T08:00:00.000Z',
}

const scenarioCopy: Record<Scenario, { title: string; scope: string; personal: boolean; perspective: 'learner' | 'teacher' }> = {
  personal: { title: '我的学习', scope: '个人学习区', personal: true, perspective: 'learner' },
  learner: { title: '产品设计基础', scope: '课程学习区', personal: false, perspective: 'learner' },
  teacher: { title: '产品设计基础', scope: '课程创建者', personal: false, perspective: 'teacher' },
}

function DashboardFixture() {
  const [dashboardOpen, setDashboardOpen] = useState(params.get('dashboard') !== 'closed')
  const [scenario, setScenario] = useState<Scenario>(initialScenario)
  const [section, setSection] = useState<LearningDashboardSection>('overview')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const copy = scenarioCopy[scenario]
  const menu = useMemo(
    () => getLearningDashboardMenu({ personal: copy.personal, perspective: copy.perspective }),
    [copy.personal, copy.perspective],
  )
  const learnerCourse: LearningCourse = {
    projectId: 'fixture-project',
    courseId: copy.personal ? undefined : 'fixture-course',
    projectKind: copy.personal ? 'PERSONAL_LEARNING' : 'INSTITUTIONAL_COURSE',
    title: copy.title,
    description: copy.personal ? '个人学习区' : '产品设计基础课程',
    status: 'ACTIVE',
    perspective: 'learner',
    canSubmit: !readOnly,
  }

  const changeScenario = (next: Scenario) => {
    setScenario(next)
    setSection('overview')
    setDashboardOpen(true)
  }

  return (
    <div className="desktop-openmaus relative flex h-screen w-screen min-h-0 overflow-hidden bg-accent" data-testid="desktop-shell">
      <WorkspaceRail
        dashboardActive={dashboardOpen}
        onOpenDashboard={() => setDashboardOpen(true)}
        onOpenWorkspace={() => setDashboardOpen(false)}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-accent">
        <div className="flex h-5 shrink-0 items-center justify-center gap-1 px-2 text-accent-foreground">
          <Avatar size="sm" className="!size-3 rounded-sm">
            <AvatarFallback className="rounded-sm bg-sidebar-primary text-[5px] font-semibold text-sidebar-primary-foreground">学</AvatarFallback>
          </Avatar>
          <span className="max-w-56 truncate text-[11px] font-medium leading-none">{copy.title}</span>
        </div>
        <main
          data-testid="shared-main"
          className="me-2 mb-2 min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl bg-card text-card-foreground shadow-sm"
        >
          {dashboardOpen ? (
            <SidebarProvider className="h-full min-h-0 bg-card" style={{ '--sidebar-width': '19rem' } as React.CSSProperties}>
              <Sidebar collapsible="none" className="w-[19rem] shrink-0 border-r border-[var(--im-divider-weak)] bg-card text-card-foreground">
                <SidebarHeader className="h-12 shrink-0 justify-center p-2">
                  <div className="grid grid-cols-3 gap-1" role="group" aria-label="切换验收身份">
                    {(['personal', 'learner', 'teacher'] as const).map((item) => (
                      <SidebarMenuButton
                        key={item}
                        type="button"
                        size="sm"
                        isActive={scenario === item}
                        onClick={() => changeScenario(item)}
                      >
                        <span>{scenarioCopy[item].scope}</span>
                      </SidebarMenuButton>
                    ))}
                  </div>
                </SidebarHeader>
                <SidebarContent className="gap-1 px-2 pb-2 pt-0.5">
                  <SidebarGroup className="p-0">
                    <SidebarGroupLabel>{copy.scope}</SidebarGroupLabel>
                    <SidebarGroupContent>
                      <SidebarMenu aria-label="学习看板菜单">
                        {menu.map((item) => (
                          <SidebarMenuItem key={item.section}>
                            <SidebarMenuButton
                              type="button"
                              isActive={section === item.section}
                              aria-current={section === item.section ? 'page' : undefined}
                              onClick={() => setSection(item.section)}
                            >
                              <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                              <span>{item.label}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                </SidebarContent>
                <SidebarFooter className="shrink-0 border-t border-[var(--im-divider-weak)] bg-card p-2">
                  <NavUser user={{ name: fixtureUser.name, email: fixtureUser.email }} />
                </SidebarFooter>
              </Sidebar>
              <SidebarInset className="h-full min-h-0 min-w-0 overflow-hidden bg-card text-card-foreground">
                <header className="flex h-12 shrink-0 items-center border-b border-[var(--im-divider-weak)] px-5">
                  <div>
                    <p className="font-heading text-sm font-medium">{section === 'overview' ? menu[0].label : menu.find((item) => item.section === section)?.label}</p>
                    <p className="text-xs text-muted-foreground">{copy.title}</p>
                  </div>
                </header>
                <section
                  data-testid="dashboard-overview"
                  aria-label={`${copy.scope}数据概览`}
                  className="@container/learning-grid h-[calc(100%-3rem)] overflow-y-auto p-4 sm:p-6"
                >
                  {scenario === 'teacher' && section === 'overview' ? (
                    <TeacherOverviewDashboard space={teacherSpace} />
                  ) : scenario === 'teacher' && section === 'settings' ? (
                    <CourseSettingsSection space={teacherSpace} />
                  ) : section === 'overview' ? (
                    <LearnerOverviewDashboard
                      course={learnerCourse}
                      overview={learnerOverview}
                      objectives={learnerObjectives}
                      activities={learnerActivities}
                      evidence={learnerEvidence}
                      missions={learnerMissions}
                      states={learnerStates}
                      loading={false}
                      answers={answers}
                      setAnswers={setAnswers}
                      onChanged={() => Promise.resolve()}
                      onError={() => undefined}
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-muted-foreground">
                      <p>{menu.find((item) => item.section === section)?.label}页面</p>
                    </div>
                  )}
                </section>
              </SidebarInset>
            </SidebarProvider>
          ) : (
            <div className="grid h-full place-items-center text-center">
              <div>
                <p className="font-heading text-base font-medium">课程对话</p>
                <p className="mt-1 text-sm text-muted-foreground">点击左上角品牌头像打开学习看板。</p>
              </div>
            </div>
          )}
        </main>
      </div>
      <SettingsDialog />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <AppThemeProvider>
    <GlobalInteractionProvider>
      <TooltipProvider delayDuration={0}>
        <DashboardFixture />
      </TooltipProvider>
    </GlobalInteractionProvider>
  </AppThemeProvider>,
)
