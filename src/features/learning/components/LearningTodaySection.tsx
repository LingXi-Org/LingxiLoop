import { useMemo } from 'react'
import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useParticipants } from '@/features/agents/state'
import { useConversations } from '@/features/conversations/store'
import { useApp } from '@/stores/app'
import { learningApi } from '../api'
import type {
  LearningActivity, LearningCourse, LearningDashboard, LearningMission, LearningObjective,
  LearningProgress, LearningReview, TeacherAgentSummary,
} from '../contracts'
import { TeacherComposer } from './LearningSetup'
import { MasteryBadge, MISSION_KIND_LABELS, STEP_TYPE_LABELS, WEEKDAY_LABELS, statusLabel } from './learningDisplay'

interface LearningTodaySectionProps {
  course: LearningCourse
  dashboard: LearningDashboard
  objectives: LearningObjective[]
  activities: LearningActivity[]
  missions: LearningMission[]
  reviews: LearningReview[]
  progress: LearningProgress[]
  teacherAgent: TeacherAgentSummary | null
  onChanged(): Promise<void>
  onError(error: unknown): void
}

export function LearningTodaySection(props: LearningTodaySectionProps) {
  return props.course.perspective === 'teacher'
    ? <TeacherToday {...props} />
    : <LearnerToday {...props} />
}

function LearnerToday({ course, dashboard, objectives, activities, missions }: LearningTodaySectionProps) {
  const due = dashboard.due.filter((item) => item.projectId === course.projectId)
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="到期复习" value={due.length} />
        <StatCard label="目标" value={objectives.length} />
        <StatCard label="已发布活动" value={activities.filter((item) => item.status === 'PUBLISHED').length} />
      </div>
      {missions.map((mission) => {
        const completed = mission.steps.filter((step) => step.status === 'COMPLETED').length
        return (
          <Card key={mission.id} size="sm">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-primary">学习任务板</p>
                  <CardTitle>{mission.goal}</CardTitle>
                  <CardDescription>成功标准：{mission.successCriteria}</CardDescription>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {MISSION_KIND_LABELS[mission.kind] ?? mission.kind} · 负责人 {mission.coordinatorName ?? mission.coordinatorAgentId}
                  </p>
                </div>
                <Badge variant="secondary">{statusLabel(mission.status)} · 已完成 {completed}/{mission.steps.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {mission.steps.map((step) => (
                <div key={step.id} className="flex items-start gap-3 rounded-3xl bg-muted px-3 py-2.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
                    {step.status === 'COMPLETED' ? '✓' : step.position + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{step.description}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{STEP_TYPE_LABELS[step.kind] ?? step.kind} · {step.successCriteria}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )
      })}
      {due.map((item) => (
        <Card key={item.knowledgeUnitId} size="sm">
          <CardContent className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-heading text-sm font-medium">{item.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">今天安排一次短复习；失败会在明天重新进入队列。</p>
            </div>
            <MasteryBadge level={item.level} />
          </CardContent>
        </Card>
      ))}
      {due.length === 0 && (
        <Card size="sm"><CardHeader><CardTitle>今天没有到期复习</CardTitle><CardDescription>你可以继续一个活动，或在学习室里请 Nova 建立持续学习任务。</CardDescription></CardHeader></Card>
      )}
    </div>
  )
}

function TeacherToday({
  course, objectives, missions, reviews, progress, teacherAgent, onChanged, onError,
}: LearningTodaySectionProps) {
  const setView = useApp((state) => state.setView)
  const selectConversation = useApp((state) => state.selectConversation)
  const participantsById = useParticipants((state) => state.byId)
  const coordinators = useMemo(
    () => Object.values(participantsById).filter((participant) => participant.kind === 'agent'
      && participant.capabilities?.includes('learning') && participant.capabilities?.includes('canvas')),
    [participantsById],
  )
  const teacherParticipant = teacherAgent ? participantsById[teacherAgent.agentId] : undefined

  return (
    <div className="space-y-4">
      {teacherAgent && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-4">
            {teacherParticipant && <Avatar p={teacherParticipant} size={48} animated={false} />}
            <div className="min-w-0 flex-1 basis-56 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-heading text-base font-medium">{teacherAgent.displayName}</h3>
                <Badge variant="secondary">教师专用 · 项目内复用</Badge>
              </div>
              <p className="text-sm text-muted-foreground">教学运营与学情汇总 · 仅本课程教师可见，关键变更必须由教师确认</p>
              <p className="text-xs text-muted-foreground">
                定时摘要：{digestLabel(teacherAgent)} · 待审批 {teacherAgent.pendingApprovals} 项
              </p>
            </div>
            <Button
              className="w-full md:w-auto"
              onClick={() => void useConversations.getState().reload().then(() => {
                setView('conversations')
                selectConversation(teacherAgent.roomId)
              }).catch(onError)}
            >
              打开共享教师室
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="学习者" value={course.learnerCount} />
        <StatCard label="待审核" value={reviews.length} />
        <StatCard label="课程状态" value={statusLabel(course.status)} />
      </div>
      {progress.length > 0 && (
        <Card size="sm">
          <CardHeader><CardTitle>成员进度</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border">
            {progress.map((item) => (
              <div key={item.user_id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{item.display_name ?? item.email ?? item.user_id}</p>
                  <p className="text-xs text-muted-foreground">{item.attempts} 次尝试 · {item.due_knowledge_units} 项到期</p>
                </div>
                <MasteryBadge level={Math.round(item.average_level)} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {missions.length > 0 && (
        <Card size="sm">
          <CardHeader><CardTitle>学习任务负责人</CardTitle><CardDescription>每项持续学习任务由一名教学智能体负责协调，专业角色仍可在协作画布中分工。</CardDescription></CardHeader>
          <CardContent className="divide-y divide-border">
            {missions.map((mission) => (
              <div key={mission.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{mission.goal}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{MISSION_KIND_LABELS[mission.kind] ?? mission.kind} · 当前负责人 {mission.coordinatorName ?? mission.coordinatorAgentId}</p>
                </div>
                <Select
                  value={mission.coordinatorAgentId}
                  onValueChange={(agentId) => course.courseId && void learningApi.setMissionCoordinator(course.courseId, mission.id, agentId).then(onChanged).catch(onError)}
                >
                  <SelectTrigger aria-label={`调整“${mission.goal}”的负责人`} size="sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{coordinators.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <TeacherComposer course={course} objectives={objectives} onChanged={onChanged} />
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return <Card size="sm"><CardContent><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 font-heading text-3xl font-medium">{value}</p></CardContent></Card>
}

function digestLabel(summary: TeacherAgentSummary): string {
  const { digest } = summary
  const schedule = digest.frequency === 'off'
    ? '未开启'
    : `${digest.frequency === 'daily' ? '每日' : `每${WEEKDAY_LABELS[digest.weekday ?? ''] ?? '周'}`} ${digest.localTime ?? ''} · ${digest.timezone}`
  return `${schedule}${digest.nextRunAt ? ` · 下次发送 ${new Date(digest.nextRunAt).toLocaleString('zh-CN')}` : ''}`
}
