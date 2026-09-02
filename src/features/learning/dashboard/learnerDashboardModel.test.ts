import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  LearningActivity,
  LearningDashboard,
  LearningEvidence,
  LearningMission,
  LearningMissionStep,
  LearningObjective,
} from '../contracts'
import { buildLearnerDashboardModel } from './learnerDashboardModel'

function objective(
  id: string,
  position: number,
  input: Partial<LearningObjective> = {},
): LearningObjective {
  return {
    id,
    projectId: 'project-a',
    title: `目标 ${id}`,
    successCriteria: `达成 ${id}`,
    targetLevel: 3,
    position,
    status: 'PUBLISHED',
    prerequisiteIds: [],
    ...input,
  }
}

function activity(id: string, input: Partial<LearningActivity> = {}): LearningActivity {
  return {
    id,
    projectId: 'project-a',
    title: `活动 ${id}`,
    instructions: `完成 ${id}`,
    kind: 'PRACTICE',
    status: 'PUBLISHED',
    evaluationMode: 'AGENT_FORMATIVE',
    targetLevel: 2,
    rubric: [],
    knowledgeUnitIds: [],
    ...input,
  }
}

function step(
  id: string,
  position: number,
  input: Partial<LearningMissionStep> = {},
): LearningMissionStep {
  return {
    id,
    kind: 'PRACTICE',
    description: `步骤 ${id}`,
    successCriteria: `完成步骤 ${id}`,
    status: 'OPEN',
    position,
    ...input,
  }
}

function mission(id: string, input: Partial<LearningMission> = {}): LearningMission {
  return {
    id,
    projectId: 'project-a',
    learnerId: 'learner-1',
    conversationId: 'conversation-1',
    triggerClientMsgNo: 'message-1',
    goal: `任务 ${id}`,
    successCriteria: `完成任务 ${id}`,
    kind: 'STUDY',
    coordinatorAgentId: 'agent-1',
    status: 'ACTIVE',
    steps: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...input,
  }
}

function attempt(
  id: string,
  createdAt: string,
  input: Partial<LearningEvidence> = {},
): LearningEvidence {
  return {
    id,
    activity_id: null,
    mission_step_id: null,
    assistance: 'NONE',
    status: 'ACCEPTED',
    evidence: { answer: id },
    created_at: createdAt,
    evaluation_id: null,
    demonstrated_level: null,
    confidence: null,
    rubric_results: null,
    feedback: null,
    evaluation_status: null,
    ...input,
  }
}

test('builds the objective-source-evidence graph from reliable project-scoped relationships', () => {
  const objectives = [
    objective('objective-2', 1, { prerequisiteIds: ['objective-1'] }),
    objective('objective-1', 0),
    objective('draft-objective', 2, { status: 'DRAFT' }),
    objective('foreign-objective', 0, { projectId: 'project-b' }),
  ]
  const activities = [
    activity('activity-1', { knowledgeUnitIds: ['objective-1'] }),
    activity('draft-activity', { status: 'DRAFT', knowledgeUnitIds: ['objective-1'] }),
    activity('foreign-activity', { projectId: 'project-b' }),
  ]
  const linkedSteps = [
    step('step-2', 1, {
      knowledgeUnitId: 'objective-1',
      status: 'IN_PROGRESS',
      completionAttemptId: 'evidence-step',
    }),
    step('step-1', 0, {
      knowledgeUnitId: 'objective-2',
      status: 'COMPLETED',
      completionAttemptId: 'evidence-activity',
      completionEvidenceId: 'evidence-ignored',
    }),
  ]
  const missions = [
    mission('mission-linked', { steps: linkedSteps }),
    mission('foreign-mission', { projectId: 'project-b' }),
  ]
  const evidence = [
    attempt('evidence-step', '2026-09-02T00:00:00.000Z', { mission_step_id: 'step-2' }),
    attempt('evidence-activity', '2026-09-03T00:00:00.000Z', { activity_id: 'activity-1' }),
    attempt('evidence-ignored', '2026-09-04T00:00:00.000Z'),
  ]
  const states: LearningDashboard['states'] = [
    {
      projectId: 'project-b',
      knowledgeUnitId: 'objective-1',
      title: '错误项目状态',
      level: 4,
      status: 'VERIFIED',
      nextReviewAt: null,
      reviewIntervalDays: 30,
    },
    {
      projectId: 'project-a',
      knowledgeUnitId: 'objective-1',
      title: '目标 objective-1',
      level: 2,
      status: 'LEARNING',
      nextReviewAt: '2026-09-08T00:00:00.000Z',
      reviewIntervalDays: 7,
    },
  ]

  const model = buildLearnerDashboardModel({
    projectId: 'project-a',
    objectives,
    activities,
    missions,
    evidence,
    states,
  })

  assert.deepEqual(
    model.objectives.map((view) => view.objective.id),
    ['objective-1', 'objective-2'],
  )
  assert.deepEqual(model.objectives[0], {
    objective: objectives[1],
    state: states[1],
    prerequisiteTitles: [],
    activityIds: ['activity-1'],
    missionStepIds: ['step-2'],
    evidenceIds: ['evidence-activity', 'evidence-step'],
    evidenceCount: 2,
    sources: [
      {
        sourceKind: 'activity',
        sourceId: 'activity-1',
        sourceLabel: '活动 activity-1',
        evidenceIds: ['evidence-activity'],
        evidenceCount: 1,
      },
      {
        sourceKind: 'missionStep',
        sourceId: 'step-2',
        sourceLabel: '步骤 step-2',
        evidenceIds: ['evidence-step'],
        evidenceCount: 1,
      },
    ],
  })
  assert.deepEqual(model.objectives[1].prerequisiteTitles, ['目标 objective-1'])
  assert.deepEqual(model.objectives[1].evidenceIds, ['evidence-activity'])

  const linkedMission = model.missions[0]
  assert.deepEqual(
    linkedMission.steps.map((view) => view.step.id),
    ['step-1', 'step-2'],
  )
  assert.deepEqual(
    linkedMission.steps.map((view) => view.evidenceIds),
    [['evidence-activity'], ['evidence-step']],
  )
  assert.deepEqual(
    {
      objectiveIds: linkedMission.objectiveIds,
      completedSteps: linkedMission.completedSteps,
      totalSteps: linkedMission.totalSteps,
      progress: linkedMission.progress,
      evidenceIds: linkedMission.evidenceIds,
      evidenceCount: linkedMission.evidenceCount,
    },
    {
      objectiveIds: ['objective-1', 'objective-2'],
      completedSteps: 1,
      totalSteps: 2,
      progress: 50,
      evidenceIds: ['evidence-activity', 'evidence-step'],
      evidenceCount: 2,
    },
  )

  assert.deepEqual(
    model.evidence.map((view) => ({
      id: view.evidence.id,
      sourceKind: view.sourceKind,
      sourceId: view.sourceId,
      sourceLabel: view.sourceLabel,
      objectiveIds: view.objectiveIds,
    })),
    [
      {
        id: 'evidence-ignored',
        sourceKind: 'unknown',
        sourceId: null,
        sourceLabel: '来源待同步',
        objectiveIds: [],
      },
      {
        id: 'evidence-activity',
        sourceKind: 'activity',
        sourceId: 'activity-1',
        sourceLabel: '活动 activity-1',
        objectiveIds: ['objective-1', 'objective-2'],
      },
      {
        id: 'evidence-step',
        sourceKind: 'missionStep',
        sourceId: 'step-2',
        sourceLabel: '步骤 step-2',
        objectiveIds: ['objective-1'],
      },
    ],
  )
})

test('keeps closed unsubmitted activities and stably sorts dashboard records', () => {
  const activities = [
    activity('ready-late', { dueAt: '2026-09-12T00:00:00.000Z' }),
    activity('submitted', { dueAt: '2026-09-01T00:00:00.000Z' }),
    activity('closed', { status: 'CLOSED', dueAt: '2026-09-02T00:00:00.000Z' }),
    activity('ready-early', { dueAt: '2026-09-05T00:00:00.000Z' }),
    activity('ready-no-date'),
  ]
  const missions = [
    mission('active-old', { updatedAt: '2026-09-01T00:00:00.000Z' }),
    mission('completed-new', { status: 'COMPLETED', updatedAt: '2026-09-10T00:00:00.000Z' }),
    mission('active-new', { updatedAt: '2026-09-08T00:00:00.000Z' }),
  ]

  const model = buildLearnerDashboardModel({
    projectId: 'project-a',
    objectives: [],
    activities,
    missions,
    evidence: [
      attempt('submitted-attempt', '2026-09-03T00:00:00.000Z', {
        activity_id: 'submitted',
      }),
    ],
    states: [],
  })

  assert.deepEqual(
    model.activities.map((view) => [view.activity.id, view.stage]),
    [
      ['ready-early', 'ready'],
      ['ready-late', 'ready'],
      ['ready-no-date', 'ready'],
      ['closed', 'closed'],
      ['submitted', 'submitted'],
    ],
  )
  assert.deepEqual(
    model.missions.map((view) => view.mission.id),
    ['active-new', 'active-old', 'completed-new'],
  )
  assert.deepEqual(
    activities.map((item) => item.id),
    ['ready-late', 'submitted', 'closed', 'ready-early', 'ready-no-date'],
  )
})
