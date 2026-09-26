import { type Dispatch, type SetStateAction, useMemo, useState } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { LearningActivitiesSection } from '../components/LearningActivitiesSection'
import { LearningEvidenceSection } from '../components/LearningEvidenceSection'
import { LearningObjectivesSection } from '../components/LearningObjectivesSection'
import type { LearnerLearningOverview, LearningActivity, LearningCourse, LearningDashboard, LearningEvidence, LearningMission, LearningObjective } from '../contracts'
import { LearnerAttemptChart, LearnerLearningInsights, LearnerNextSteps, type LearnerOverviewSection } from './LearnerDashboardSummary'
import { buildLearnerDashboardModel } from './learnerDashboardModel'
import { LearningGrowthVine } from './LearningGrowthVine'
import { MissionSection } from './MissionSection'
import { OverviewBarChart, OverviewChartCard, OverviewDonutChart } from './OverviewChartCard'

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
  const [detail, setDetail] = useState<LearnerOverviewSection | null>(null)
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

  const ready = model.activities.filter((item) => item.stage === 'ready').length
  const activityDistribution = [
    { label: '待完成', count: ready },
    { label: '已提交', count: model.activities.filter((item) => item.stage === 'submitted').length },
    { label: '已结束', count: model.activities.filter((item) => item.stage === 'closed').length },
  ]
  const missionDistribution = [
    { label: '进行中', count: model.missions.filter((item) => item.mission.status === 'ACTIVE').length },
    { label: '规划中', count: model.missions.filter((item) => item.mission.status === 'PLANNING').length },
    { label: '已暂停', count: model.missions.filter((item) => item.mission.status === 'PAUSED').length },
    { label: '已完成', count: model.missions.filter((item) => item.mission.status === 'COMPLETED').length },
    { label: '已取消', count: model.missions.filter((item) => item.mission.status === 'CANCELLED').length },
  ]

  return (
    <div className="space-y-4 @min-[48rem]/learning-grid:space-y-6" data-testid="learner-overview-dashboard" aria-busy={loading}>
      <div className="grid gap-4 @min-[48rem]/learning-grid:grid-cols-12">
        <OverviewChartCard
          title="课程活动" value={ready + ' 项待完成'} description="查看活动要求，提交你的作答"
          className="@min-[48rem]/learning-grid:col-span-5"
          open={detail === 'activities'} onOpenChange={(open) => setDetail(open ? 'activities' : null)}
          chart={<OverviewDonutChart data={activityDistribution} value={String(model.activities.length)} />}
        >
          <LearningActivitiesSection course={course} activities={model.activities.map((item) => item.activity)} evidence={model.evidence.map((item) => item.evidence)} objectiveTitlesById={objectiveTitlesById} perspective="learner" answers={answers} setAnswers={setAnswers} onChanged={onChanged} onError={onError} />
        </OverviewChartCard>
        <OverviewChartCard
          title="学习任务" value={overview ? overview.summary.activeMissions + ' 项进行中' : '暂不可用'} description="查看任务步骤与完成进展"
          className="@min-[48rem]/learning-grid:col-span-7"
          open={detail === 'missions'} onOpenChange={(open) => setDetail(open ? 'missions' : null)}
          chart={<OverviewBarChart data={missionDistribution} />}
        >
          <MissionSection missions={model.missions.map((item) => item.mission)} showStepEvidence />
        </OverviewChartCard>
        <OverviewChartCard
          title="目标掌握" value={overview ? overview.summary.verifiedObjectives + ' 项已验证' : '暂不可用'} description={overview ? overview.summary.dueReviews + ' 项待复习 · 查看成功标准与关联证据' : '查看成功标准与关联证据'}
          className="@min-[48rem]/learning-grid:col-span-5"
          open={detail === 'objectives'} onOpenChange={(open) => setDetail(open ? 'objectives' : null)}
          chart={<OverviewBarChart layout="vertical" data={overview?.masteryDistribution.map((item) => ({ label: '等级 ' + item.level, count: item.count })) ?? []} />}
        >
          <LearningObjectivesSection course={course} objectives={model.objectives.map((item) => item.objective)} perspective="learner" mastery={mastery} learnerDetailsById={learnerDetailsById} onChanged={onChanged} onError={onError} />
        </OverviewChartCard>
        <OverviewChartCard
          title="学习记录" value={overview ? overview.summary.evidenceAttempts + ' 次学习提交' : '暂不可用'} description={overview ? '近 ' + overview.windowDays + ' 天 · 回顾学习证据与反馈' : '回顾学习证据与反馈'}
          className="@min-[48rem]/learning-grid:col-span-7"
          open={detail === 'evidence'} onOpenChange={(open) => setDetail(open ? 'evidence' : null)}
          chart={<LearnerAttemptChart overview={overview} />}
        >
          <div className="space-y-6">
            <LearningEvidenceSection evidence={model.evidence.map((item) => item.evidence)} contextByEvidenceId={evidenceContext} />
            <Accordion type="single" collapsible>
              <AccordionItem value="analysis">
                <AccordionTrigger>查看学习分析</AccordionTrigger>
                <AccordionContent><LearnerLearningInsights overview={overview} /></AccordionContent>
              </AccordionItem>
              <AccordionItem value="mastery-policy">
                <AccordionTrigger>学习证据如何推进掌握等级？</AccordionTrigger>
                <AccordionContent>
                  <ul className="list-disc space-y-2 ps-4 text-muted-foreground">
                    <li>使用提示或引导完成的证据，最高推进到掌握等级 2。</li>
                    <li>掌握等级 3 通常需要两个不同来源的独立证据。</li>
                    <li>最高掌握等级需教师确认项目或考核证据。</li>
                    <li>较弱的新证据不会直接抹去已有掌握，而会进入待复核状态。</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </OverviewChartCard>
      </div>
      <div className="grid items-start gap-4 @min-[64rem]/learning-grid:grid-cols-12">
        <div className="min-w-0 @min-[64rem]/learning-grid:col-span-8"><LearningGrowthVine key={course.projectId} projectId={course.projectId} /></div>
        <div className="h-full min-w-0 @min-[64rem]/learning-grid:col-span-4"><LearnerNextSteps overview={overview} model={model} canSubmit={Boolean(course.canSubmit)} onOpenSection={setDetail} /></div>
      </div>
    </div>
  )
}
