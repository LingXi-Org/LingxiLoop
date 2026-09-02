import {
  Activity01Icon,
  ArrowUpRight01Icon,
  File01Icon,
  GoalIcon,
  Task01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type Dispatch, type ReactNode, type SetStateAction, useMemo } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Progress, ProgressLabel } from '@/components/ui/progress'
import { LearningActivitiesSection } from '../components/LearningActivitiesSection'
import { LearningEvidenceSection } from '../components/LearningEvidenceSection'
import { LearningObjectivesSection } from '../components/LearningObjectivesSection'
import { MasteryBadge } from '../components/learningDisplay'
import type {
  LearnerLearningOverview,
  LearningActivity,
  LearningCourse,
  LearningDashboard,
  LearningEvidence,
  LearningMission,
  LearningObjective,
} from '../contracts'
import { formatLearningDateTime, LearnerDashboardSummary } from './LearnerDashboardSummary'
import { buildLearnerDashboardModel } from './learnerDashboardModel'
import { MissionSection } from './MissionSection'

interface LearnerOverviewDashboardProps {
  course: LearningCourse
  overview: LearnerLearningOverview | null
  objectives: LearningObjective[]
  activities: LearningActivity[]
  evidence: LearningEvidence[]
  missions: LearningMission[]
  states: LearningDashboard['states']
  loading: boolean
  answers: Record<string, string>
  setAnswers: Dispatch<SetStateAction<Record<string, string>>>
  onChanged(): Promise<void>
  onError(error: unknown): void
}


function DetailCard({
  title,
  description,
  count,
  icon,
  dialogDescription,
  className,
  preview,
  children,
}: {
  title: string
  description: string
  count: number
  icon: typeof Task01Icon
  dialogDescription: string
  className?: string
  preview: ReactNode
  children: ReactNode
}) {
  return (
    <Dialog>
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <HugeiconsIcon icon={icon} strokeWidth={2} className="size-5" />
            </span>
            <div className="min-w-0">
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          <CardAction className="flex items-center gap-3">
            <Badge variant="secondary" className="tabular-nums">
              {count}
            </Badge>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="@max-[32rem]/learning-grid:size-9 @max-[32rem]/learning-grid:p-0" aria-label={`查看全部${title}`}>
                <span className="@max-[32rem]/learning-grid:sr-only">查看全部</span>
                <ArrowIcon />
              </Button>
            </DialogTrigger>
          </CardAction>
        </CardHeader>
        <CardContent>{preview}</CardContent>
      </Card>
      <DialogContent className="h-[min(52rem,calc(100dvh-2rem))] max-w-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden bg-card p-0 sm:max-w-4xl">
        <DialogHeader className="px-6 pb-4 pe-16 pt-6">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="@container/learning-grid min-h-0 overflow-y-auto px-6 pb-6">{children}</div>
      </DialogContent>
    </Dialog>
  )
}

function ArrowIcon() {
  return <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={2} data-icon="inline-end" />
}

function EmptyPreview({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

export function LearnerOverviewDashboard({
  course,
  overview,
  objectives,
  activities,
  evidence,
  missions,
  states,
  loading,
  answers,
  setAnswers,
  onChanged,
  onError,
}: LearnerOverviewDashboardProps) {
  const model = useMemo(
    () =>
      buildLearnerDashboardModel({
        projectId: course.projectId,
        objectives,
        activities,
        evidence,
        missions,
        states,
      }),
    [activities, course.projectId, evidence, missions, objectives, states],
  )
  const mastery = useMemo(
    () => new Map(model.objectives.map((item) => [item.objective.id, item.state?.level ?? 0])),
    [model.objectives],
  )
  const evidenceContext = useMemo(
    () =>
      new Map(
        model.evidence.map((item) => [
          item.evidence.id,
          {
            sourceLabel: item.sourceLabel,
            objectiveTitles: item.objectiveTitles,
          },
        ]),
      ),
    [model.evidence],
  )
  const objectiveTitlesById = useMemo(
    () => new Map(model.objectives.map((item) => [item.objective.id, item.objective.title])),
    [model.objectives],
  )
  const learnerDetailsById = useMemo(
    () =>
      new Map(
        model.objectives.map((item) => [
          item.objective.id,
          {
            nextReviewAt: item.state?.nextReviewAt ?? null,
            activityTitles: item.sources
              .filter((source) => source.sourceKind === 'activity')
              .map((source) => source.sourceLabel),
            missionStepTitles: item.sources
              .filter((source) => source.sourceKind === 'missionStep')
              .map((source) => source.sourceLabel),
            evidenceCount: item.evidenceCount,
          },
        ]),
      ),
    [model.objectives],
  )

  if (
    loading &&
    !overview &&
    objectives.length + activities.length + evidence.length + missions.length === 0
  ) {
    return <ResourceSkeleton variant="cards" count={8} label="正在汇总学习证据看板" />
  }

  const personal = course.projectKind === 'PERSONAL_LEARNING'
  const missionLabel = personal ? '学习计划' : '学习任务'

  return (
    <div className="grid gap-3 @min-[48rem]/learning-grid:gap-6 @min-[64rem]/learning-grid:grid-cols-12">
      <LearnerDashboardSummary overview={overview} model={model} missionLabel={missionLabel} />

      <DetailCard
        title={missionLabel}
        description="真实步骤、完成产出与进展"
        count={model.missions.length}
        icon={Task01Icon}
        dialogDescription={`查看全部${missionLabel}、成功标准、步骤状态和已经记录的完成证据。`}
        className="@min-[64rem]/learning-grid:col-span-6"
        preview={
          model.missions.length > 0 ? (
            <div className="space-y-4">
              {model.missions.slice(0, 3).map((item) => (
                <div key={item.mission.id} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{item.mission.goal}</p>
                    <span className="text-xs text-muted-foreground">
                      {item.completedSteps}/{item.totalSteps} 步
                    </span>
                  </div>
                  <Progress
                    value={item.progress}
                    aria-label={`${item.mission.goal} 已完成 ${item.completedSteps}/${item.totalSteps} 步`}
                  >
                    <ProgressLabel className="sr-only">{item.mission.goal}</ProgressLabel>
                  </Progress>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPreview>还没有{missionLabel}。</EmptyPreview>
          )
        }
      >
        <MissionSection
          missions={model.missions.map((item) => item.mission)}
          personal={personal}
          showStepEvidence
        />
      </DetailCard>

      <DetailCard
        title="目标掌握"
        description="成功标准、证据来源与复习状态"
        count={model.objectives.length}
        icon={GoalIcon}
        dialogDescription="查看每个目标的成功标准、前置关系、掌握等级和关联证据。"
        className="@min-[64rem]/learning-grid:col-span-6"
        preview={
          model.objectives.length > 0 ? (
            <div className="space-y-3">
              {model.objectives.slice(0, 3).map((item) => (
                <div
                  key={item.objective.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl bg-muted/60 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.objective.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.evidenceCount} 条关联证据
                      {item.state?.nextReviewAt
                        ? ` · ${formatLearningDateTime(item.state.nextReviewAt)}复习`
                        : ''}
                    </p>
                  </div>
                  <MasteryBadge level={item.state?.level ?? 0} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyPreview>还没有已发布的学习目标。</EmptyPreview>
          )
        }
      >
        <LearningObjectivesSection
          course={course}
          objectives={model.objectives.map((item) => item.objective)}
          perspective="learner"
          mastery={mastery}
          learnerDetailsById={learnerDetailsById}
          onChanged={onChanged}
          onError={onError}
        />
      </DetailCard>

      <DetailCard
        title="课程活动"
        description="待开始、已提交与已结束活动"
        count={model.activities.length}
        icon={Activity01Icon}
        dialogDescription="查看活动说明、关联目标、截止时间和评价方式，并提交仍开放的活动作为学习证据。"
        className="@min-[64rem]/learning-grid:col-span-5"
        preview={
          model.activities.length > 0 ? (
            <div className="space-y-3">
              {model.activities.slice(0, 3).map((item) => (
                <div
                  key={item.activity.id}
                  className="flex items-start gap-3 rounded-2xl bg-muted/60 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.activity.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatLearningDateTime(item.activity.dueAt)} ·{' '}
                      {item.objectiveTitles.join('、') || '未关联目标'}
                    </p>
                  </div>
                  <Badge variant={item.stage === 'ready' ? 'default' : 'secondary'}>
                    {item.stage === 'ready'
                      ? '待开始'
                      : item.stage === 'submitted'
                        ? '已提交'
                        : '已结束'}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPreview>
              {personal ? '个人学习区当前没有课程活动。' : '课程还没有已发布的活动。'}
            </EmptyPreview>
          )
        }
      >
        <LearningActivitiesSection
          course={course}
          activities={model.activities.map((item) => item.activity)}
          evidence={model.evidence.map((item) => item.evidence)}
          objectiveTitlesById={objectiveTitlesById}
          perspective="learner"
          answers={answers}
          setAnswers={setAnswers}
          onChanged={onChanged}
          onError={onError}
        />
      </DetailCard>

      <DetailCard
        title="学习证据"
        description="尝试来源、评价、rubric 与反馈"
        count={model.evidence.length}
        icon={File01Icon}
        dialogDescription="查看每次真实尝试来自哪个活动或任务步骤，以及它关联的目标、评价标准和反馈。"
        className="@min-[64rem]/learning-grid:col-span-7"
        preview={
          model.evidence.length > 0 ? (
            <div className="space-y-3">
              {model.evidence.slice(0, 4).map((item) => (
                <div
                  key={item.evidence.id}
                  className="flex items-start gap-3 rounded-2xl bg-muted/60 p-3"
                >
                  <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{item.sourceLabel}</p>
                      <span className="text-xs text-muted-foreground">
                        {formatLearningDateTime(item.evidence.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.objectiveTitles.join('、') || '尚未关联具体目标'} ·{' '}
                      {item.evidence.demonstrated_level === null
                        ? '等待评价'
                        : `掌握等级 ${item.evidence.demonstrated_level}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPreview>提交活动或完成任务后，证据会显示在这里。</EmptyPreview>
          )
        }
      >
        <div className="space-y-6">
          <LearningEvidenceSection
            evidence={model.evidence.map((item) => item.evidence)}
            contextByEvidenceId={evidenceContext}
          />
          <Accordion type="single" collapsible>
            <AccordionItem value="mastery-policy">
              <AccordionTrigger>证据如何推进掌握等级？</AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2 text-muted-foreground">
                  <li>使用提示或引导完成的证据，最高推进到掌握等级 2。</li>
                  <li>掌握等级 3 通常需要两个不同来源的独立证据。</li>
                  <li>掌握等级 4 需要课程创建者确认的项目或考核证据。</li>
                  <li>较弱的新证据不会直接抹去已有掌握，而会进入待复核状态。</li>
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </DetailCard>
    </div>
  )
}
