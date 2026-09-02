import type {
  LearningActivity,
  LearningDashboard,
  LearningEvidence,
  LearningMission,
  LearningMissionStep,
  LearningObjective,
} from '../contracts'

type LearnerState = LearningDashboard['states'][number]

export type LearnerActivityStage = 'ready' | 'closed' | 'submitted'
export type LearnerEvidenceSourceKind = 'activity' | 'missionStep' | 'unknown'

export interface LearnerObjectiveSourceView {
  sourceKind: Exclude<LearnerEvidenceSourceKind, 'unknown'>
  sourceId: string
  sourceLabel: string
  evidenceIds: string[]
  evidenceCount: number
}

export interface LearnerObjectiveView {
  objective: LearningObjective
  state: LearnerState | null
  prerequisiteTitles: string[]
  activityIds: string[]
  missionStepIds: string[]
  evidenceIds: string[]
  evidenceCount: number
  sources: LearnerObjectiveSourceView[]
}

export interface LearnerMissionStepView {
  step: LearningMissionStep
  objectiveIds: string[]
  objectiveTitles: string[]
  evidenceIds: string[]
  evidenceCount: number
}

export interface LearnerMissionView {
  mission: LearningMission
  steps: LearnerMissionStepView[]
  objectiveIds: string[]
  objectiveTitles: string[]
  completedSteps: number
  totalSteps: number
  progress: number
  evidenceIds: string[]
  evidenceCount: number
}

export interface LearnerActivityView {
  activity: LearningActivity
  stage: LearnerActivityStage
  objectiveIds: string[]
  objectiveTitles: string[]
  evidenceIds: string[]
  evidenceCount: number
}

export interface LearnerEvidenceView {
  evidence: LearningEvidence
  sourceKind: LearnerEvidenceSourceKind
  sourceId: string | null
  sourceLabel: string
  objectiveIds: string[]
  objectiveTitles: string[]
}

export interface LearnerDashboardModel {
  objectives: LearnerObjectiveView[]
  missions: LearnerMissionView[]
  activities: LearnerActivityView[]
  evidence: LearnerEvidenceView[]
}

export interface BuildLearnerDashboardModelInput {
  projectId: string
  objectives: LearningObjective[]
  activities: LearningActivity[]
  missions: LearningMission[]
  evidence: LearningEvidence[]
  states: LearningDashboard['states']
}

interface MissionStepReference {
  missionId: string
  step: LearningMissionStep
}

const ACTIVITY_STAGE_ORDER: Record<LearnerActivityStage, number> = {
  ready: 0,
  closed: 1,
  submitted: 2,
}

const MISSION_STATUS_ORDER: Record<LearningMission['status'], number> = {
  ACTIVE: 0,
  PLANNING: 1,
  PAUSED: 2,
  COMPLETED: 3,
  CANCELLED: 4,
}

function compareDates(
  left: string | undefined,
  right: string | undefined,
  direction: 1 | -1,
): number {
  const leftTime = left ? Date.parse(left) : Number.NaN
  const rightTime = right ? Date.parse(right) : Number.NaN
  const leftValid = Number.isFinite(leftTime)
  const rightValid = Number.isFinite(rightTime)
  if (!leftValid || !rightValid) return leftValid === rightValid ? 0 : leftValid ? -1 : 1
  return (leftTime - rightTime) * direction
}

function addToSet(map: Map<string, Set<string>>, key: string, value: string): void {
  const values = map.get(key)
  if (values) values.add(value)
  else map.set(key, new Set([value]))
}

export function buildLearnerDashboardModel(
  input: BuildLearnerDashboardModelInput,
): LearnerDashboardModel {
  const objectiveRecords = input.objectives
    .filter((objective) => objective.projectId === input.projectId && objective.status !== 'DRAFT')
    .sort((left, right) => left.position - right.position)
  const objectiveById = new Map(objectiveRecords.map((objective) => [objective.id, objective]))
  const objectiveOrder = new Map(objectiveRecords.map((objective, index) => [objective.id, index]))
  const objectiveIds = (ids: Iterable<string>) =>
    [...new Set(ids)]
      .filter((id) => objectiveById.has(id))
      .sort((left, right) => (objectiveOrder.get(left) ?? 0) - (objectiveOrder.get(right) ?? 0))
  const objectiveTitles = (ids: Iterable<string>) =>
    objectiveIds(ids).map((id) => objectiveById.get(id)!.title)

  const activityRecords = input.activities.filter(
    (activity) => activity.projectId === input.projectId && activity.status !== 'DRAFT',
  )
  const activityById = new Map(activityRecords.map((activity) => [activity.id, activity]))

  const missionRecords = input.missions
    .filter((mission) => mission.projectId === input.projectId)
    .map((mission) => ({
      ...mission,
      steps: [...mission.steps].sort((left, right) => left.position - right.position),
    }))
    .sort(
      (left, right) =>
        MISSION_STATUS_ORDER[left.status] - MISSION_STATUS_ORDER[right.status] ||
        compareDates(left.updatedAt, right.updatedAt, -1),
    )
  const stepReferences = missionRecords.flatMap((mission) =>
    mission.steps.map((step) => ({
      missionId: mission.id,
      step,
    })),
  )
  const stepById = new Map(stepReferences.map((reference) => [reference.step.id, reference]))
  const stepsByCompletionAttempt = new Map<string, MissionStepReference[]>()
  for (const reference of stepReferences) {
    const attemptId = reference.step.completionAttemptId
    if (!attemptId) continue
    const references = stepsByCompletionAttempt.get(attemptId)
    if (references) references.push(reference)
    else stepsByCompletionAttempt.set(attemptId, [reference])
  }

  const activityEvidenceIds = new Map<string, Set<string>>()
  const stepEvidenceIds = new Map<string, Set<string>>()
  const evidenceViews = input.evidence
    .map((evidence): LearnerEvidenceView => {
      const activity = evidence.activity_id ? activityById.get(evidence.activity_id) : undefined
      const explicitStep = evidence.mission_step_id
        ? stepById.get(evidence.mission_step_id)
        : undefined
      const relatedSteps = new Map<string, MissionStepReference>()
      if (explicitStep) relatedSteps.set(explicitStep.step.id, explicitStep)
      for (const reference of stepsByCompletionAttempt.get(evidence.id) ?? []) {
        relatedSteps.set(reference.step.id, reference)
      }

      if (activity) addToSet(activityEvidenceIds, activity.id, evidence.id)
      for (const reference of relatedSteps.values()) {
        addToSet(stepEvidenceIds, reference.step.id, evidence.id)
      }

      const relatedObjectiveIds = objectiveIds([
        ...(activity?.knowledgeUnitIds ?? []),
        ...[...relatedSteps.values()].flatMap((reference) => reference.step.knowledgeUnitId ?? []),
      ])
      const primaryStep = explicitStep ?? relatedSteps.values().next().value
      if (activity) {
        return {
          evidence,
          sourceKind: 'activity',
          sourceId: activity.id,
          sourceLabel: activity.title,
          objectiveIds: relatedObjectiveIds,
          objectiveTitles: objectiveTitles(relatedObjectiveIds),
        }
      }
      if (primaryStep) {
        return {
          evidence,
          sourceKind: 'missionStep',
          sourceId: primaryStep.step.id,
          sourceLabel: primaryStep.step.description,
          objectiveIds: relatedObjectiveIds,
          objectiveTitles: objectiveTitles(relatedObjectiveIds),
        }
      }
      return {
        evidence,
        sourceKind: 'unknown',
        sourceId: evidence.activity_id ?? evidence.mission_step_id,
        sourceLabel: evidence.activity_id
          ? '课程活动来源已不可用'
          : evidence.mission_step_id
            ? '任务步骤来源已不可用'
            : '来源待同步',
        objectiveIds: [],
        objectiveTitles: [],
      }
    })
    .sort((left, right) => compareDates(left.evidence.created_at, right.evidence.created_at, -1))
  const evidenceOrder = new Map(evidenceViews.map((view, index) => [view.evidence.id, index]))
  const sortedEvidenceIds = (ids: Iterable<string>) =>
    [...new Set(ids)].sort(
      (left, right) =>
        (evidenceOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (evidenceOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
    )

  const activities = activityRecords
    .map((activity): LearnerActivityView => {
      const relatedEvidenceIds = sortedEvidenceIds(activityEvidenceIds.get(activity.id) ?? [])
      const relatedObjectiveIds = objectiveIds(activity.knowledgeUnitIds)
      return {
        activity,
        stage:
          relatedEvidenceIds.length > 0
            ? 'submitted'
            : activity.status === 'CLOSED'
              ? 'closed'
              : 'ready',
        objectiveIds: relatedObjectiveIds,
        objectiveTitles: objectiveTitles(relatedObjectiveIds),
        evidenceIds: relatedEvidenceIds,
        evidenceCount: relatedEvidenceIds.length,
      }
    })
    .sort(
      (left, right) =>
        ACTIVITY_STAGE_ORDER[left.stage] - ACTIVITY_STAGE_ORDER[right.stage] ||
        compareDates(left.activity.dueAt, right.activity.dueAt, 1),
    )

  const missions = missionRecords.map((mission): LearnerMissionView => {
    const steps = mission.steps.map((step): LearnerMissionStepView => {
      const relatedObjectiveIds = objectiveIds(step.knowledgeUnitId ? [step.knowledgeUnitId] : [])
      const relatedEvidenceIds = sortedEvidenceIds(stepEvidenceIds.get(step.id) ?? [])
      return {
        step,
        objectiveIds: relatedObjectiveIds,
        objectiveTitles: objectiveTitles(relatedObjectiveIds),
        evidenceIds: relatedEvidenceIds,
        evidenceCount: relatedEvidenceIds.length,
      }
    })
    const completedSteps = steps.filter(({ step }) => step.status === 'COMPLETED').length
    const relatedObjectiveIds = objectiveIds(steps.flatMap((step) => step.objectiveIds))
    const relatedEvidenceIds = sortedEvidenceIds(steps.flatMap((step) => step.evidenceIds))
    return {
      mission,
      steps,
      objectiveIds: relatedObjectiveIds,
      objectiveTitles: objectiveTitles(relatedObjectiveIds),
      completedSteps,
      totalSteps: steps.length,
      progress: steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0,
      evidenceIds: relatedEvidenceIds,
      evidenceCount: relatedEvidenceIds.length,
    }
  })

  const stateByObjective = new Map(
    input.states
      .filter((state) => state.projectId === input.projectId)
      .map((state) => [state.knowledgeUnitId, state]),
  )
  const objectives = objectiveRecords.map((objective): LearnerObjectiveView => {
    const relatedActivities = activities.filter((view) => view.objectiveIds.includes(objective.id))
    const relatedSteps = missions
      .flatMap((mission) => mission.steps)
      .filter((view) => view.objectiveIds.includes(objective.id))
    const sources: LearnerObjectiveSourceView[] = [
      ...relatedActivities.map((view) => ({
        sourceKind: 'activity' as const,
        sourceId: view.activity.id,
        sourceLabel: view.activity.title,
        evidenceIds: view.evidenceIds,
        evidenceCount: view.evidenceCount,
      })),
      ...relatedSteps.map((view) => ({
        sourceKind: 'missionStep' as const,
        sourceId: view.step.id,
        sourceLabel: view.step.description,
        evidenceIds: view.evidenceIds,
        evidenceCount: view.evidenceCount,
      })),
    ]
    const relatedEvidenceIds = sortedEvidenceIds(sources.flatMap((source) => source.evidenceIds))
    return {
      objective,
      state: stateByObjective.get(objective.id) ?? null,
      prerequisiteTitles: objective.prerequisiteIds.flatMap(
        (id) => objectiveById.get(id)?.title ?? [],
      ),
      activityIds: relatedActivities.map((view) => view.activity.id),
      missionStepIds: relatedSteps.map((view) => view.step.id),
      evidenceIds: relatedEvidenceIds,
      evidenceCount: relatedEvidenceIds.length,
      sources,
    }
  })

  return { objectives, missions, activities, evidence: evidenceViews }
}
