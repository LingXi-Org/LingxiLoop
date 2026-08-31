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
import type { LearnerLearningOverview, LearningOverview, TeacherLearningOverview } from '@/features/learning/contracts'
import { getLearningDashboardMenu, type LearningDashboardSection } from '@/features/learning/dashboard/navigation'
import { OverviewSection } from '@/features/learning/dashboard/OverviewSection'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { useSettingsDialog } from '@/features/settings/store'
import { useWorkspace } from '@/features/knowledge/workspace'
import { useAuth } from '@/stores/auth'
import '@/styles/globals.css'
import './settings-dashboard.css'

type Scenario = 'personal' | 'learner' | 'teacher'

const params = new URLSearchParams(window.location.search)
const requestedTheme = params.get('theme') === 'light' ? 'light' : 'dark'
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

const teacherOverview: TeacherLearningOverview = {
  perspective: 'teacher',
  windowDays: 30,
  summary: {
    learnerCount: 24,
    pendingReviews: 5,
    attempts: 68,
    learnersWithEvidence: 19,
    dueReviews: 7,
  },
  masteryDistribution: [
    { level: 0, count: 8 },
    { level: 1, count: 11 },
    { level: 2, count: 18 },
    { level: 3, count: 15 },
    { level: 4, count: 6 },
  ],
  missionDistribution: [
    { status: 'ACTIVE', count: 14 },
    { status: 'PAUSED', count: 3 },
    { status: 'COMPLETED', count: 9 },
  ],
  evaluationDistribution: [
    { status: 'PENDING', count: 5 },
    { status: 'VERIFIED', count: 31 },
    { status: 'REVISE', count: 8 },
  ],
  attention: [
    { learnerId: 'learner-1', displayName: '陈晓雨', reasons: ['due_reviews'] },
    { learnerId: 'learner-2', displayName: '周一帆', reasons: ['pending_reviews', 'paused_mission'] },
  ],
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
  const copy = scenarioCopy[scenario]
  const menu = useMemo(
    () => getLearningDashboardMenu({ personal: copy.personal, perspective: copy.perspective }),
    [copy.personal, copy.perspective],
  )
  const overview: LearningOverview = copy.perspective === 'teacher' ? teacherOverview : learnerOverview

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
                  {section === 'overview' ? <OverviewSection overview={overview} /> : (
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
