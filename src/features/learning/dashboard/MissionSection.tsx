import { Task01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Progress, ProgressLabel } from '@/components/ui/progress'
import { MISSION_KIND_LABELS, STEP_TYPE_LABELS, statusLabel } from '../components/learningDisplay'
import type { LearningMission } from '../contracts'

export function MissionSection({
  missions, personal, showStepEvidence = false,
}: {
  missions: LearningMission[]
  personal: boolean
  showStepEvidence?: boolean
}) {
  if (missions.length === 0) {
    return (
      <Empty className="min-h-72 border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><HugeiconsIcon icon={Task01Icon} strokeWidth={2} /></EmptyMedia>
          <EmptyTitle>{personal ? '还没有学习计划' : '还没有学习任务'}</EmptyTitle>
          <EmptyDescription>在课程对话中建立持续任务后，真实步骤与进展会显示在这里。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="space-y-4">
      {missions.map((mission) => {
        const completedSteps = mission.steps.filter((step) => step.status === 'COMPLETED').length
        const progress = mission.steps.length > 0 ? completedSteps / mission.steps.length * 100 : 0
        return (
          <Card key={mission.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle>{mission.goal}</CardTitle>
                  <CardDescription className="mt-1">成功标准：{mission.successCriteria}</CardDescription>
                </div>
                <Badge variant="secondary">{statusLabel(mission.status)}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>{MISSION_KIND_LABELS[mission.kind] ?? '学习任务'}</span>
                  <span className="tabular-nums">{completedSteps}/{mission.steps.length} 步</span>
                </div>
                <Progress value={progress} aria-label={`${mission.goal} 已完成 ${completedSteps}/${mission.steps.length} 步`}>
                  <ProgressLabel className="sr-only">{mission.goal}</ProgressLabel>
                </Progress>
              </div>
              <div className="space-y-2">
                {mission.steps.map((step) => (
                  <div key={step.id} className="flex items-start gap-3 rounded-2xl bg-muted p-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-card text-xs font-medium shadow-sm">
                      {step.status === 'COMPLETED' ? '✓' : step.position + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{step.description}</p>
                        <span className="text-xs text-muted-foreground">{statusLabel(step.status)}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {STEP_TYPE_LABELS[step.kind] ?? '学习步骤'} · {step.successCriteria}
                      </p>
                      {showStepEvidence && step.outcome && (
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">产出：{step.outcome}</p>
                      )}
                      {showStepEvidence && step.completionAttemptId && (
                        <p className="mt-2 text-xs font-medium text-muted-foreground">完成证据已记录</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
