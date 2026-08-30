import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type { AddLearningMissionStepInput, LearningAgentRoomScope } from './contracts.js'
import { LearningApplicationError } from './errors.js'
import {
  activateLearningMission,
  completeLearningMissionRecord,
  countLearningMissionSteps,
  countProjectLearningKnowledgeUnits,
  findLearningMission,
  findLearningRoomState,
  insertLearningMissionStep,
  learningMissionCompletionSummary,
  learningMissionPlanningSummary,
  lockLearningMission,
  updateLearningMissionStepRecord,
} from './repository.js'

type LearningTransaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>

function learningText(value: string, name: string, maxLength = 10_000): string {
  const text = String(value ?? '').trim()
  if (!text) throw new LearningApplicationError('invalid', `${name} is required`)
  if (text.length > maxLength) throw new LearningApplicationError('invalid', `${name} exceeds ${maxLength} characters`)
  return text
}

async function requireLearningRoomState(db: Queryable, scope: LearningAgentRoomScope) {
  const room = await findLearningRoomState(db, scope)
  if (!room) throw new LearningApplicationError('not_found', 'current conversation is not bound to a project')
  return room
}

export async function getLearningMission(
  db: Queryable,
  companyId: string,
  projectId: string,
  missionId: string,
) {
  const mission = await findLearningMission(db, companyId, projectId, missionId)
  if (!mission) throw new LearningApplicationError('not_found', 'mission not found')
  return mission
}

export async function addLearningMissionSteps(
  db: Queryable,
  transaction: LearningTransaction,
  scope: LearningAgentRoomScope,
  missionId: string,
  steps: AddLearningMissionStepInput[],
) {
  if (!steps.length || steps.length > 64) {
    throw new LearningApplicationError('invalid', 'steps must contain between 1 and 64 items')
  }
  const room = await requireLearningRoomState(db, scope)
  const missionScope = { companyId: room.companyId, projectId: room.projectId, missionId }
  await transaction(async (client) => {
    if (!await lockLearningMission(client, {
      ...scope,
      projectId: room.projectId,
      missionId,
      statuses: ['PLANNING','ACTIVE','PAUSED'],
    })) throw new LearningApplicationError('not_found', 'mission not found in current project conversation')
    let position = await countLearningMissionSteps(client, missionScope)
    for (const step of steps) {
      if (step.knowledgeUnitId
        && await countProjectLearningKnowledgeUnits(
          client, room.companyId, room.projectId, [step.knowledgeUnitId],
        ) !== 1) {
        throw new LearningApplicationError('invalid', 'mission step knowledge unit must belong to the current project')
      }
      const inserted = await insertLearningMissionStep(client, {
        ...missionScope,
        id: randomUUID(),
        kind: step.kind,
        description: learningText(step.description, 'step description'),
        successCriteria: learningText(step.successCriteria, 'step successCriteria'),
        ...(step.knowledgeUnitId ? { knowledgeUnitId: step.knowledgeUnitId } : {}),
        position: position++,
      })
      if (!inserted) position--
    }
    if (await countLearningMissionSteps(client, missionScope) < 1) {
      throw new LearningApplicationError('conflict', 'mission requires at least one checkable step')
    }
  })
  return getLearningMission(db, room.companyId, room.projectId, missionId)
}

export async function finishLearningMissionPlanning(
  db: Queryable,
  transaction: LearningTransaction,
  scope: LearningAgentRoomScope,
  missionId: string,
) {
  const room = await requireLearningRoomState(db, scope)
  const missionScope = { companyId: room.companyId, projectId: room.projectId, missionId }
  await transaction(async (client) => {
    if (!await lockLearningMission(client, {
      ...scope,
      projectId: room.projectId,
      missionId,
      statuses: ['PLANNING'],
    })) throw new LearningApplicationError('not_found', 'planning Mission not found in the current project conversation')
    const summary = await learningMissionPlanningSummary(client, missionScope)
    if (summary.total < 1) throw new LearningApplicationError('conflict', 'planning gate blocked: add concrete Mission steps first')
    if (summary.checks < 1) throw new LearningApplicationError('conflict', 'planning gate blocked: add at least one check step with observable success criteria')
    if (summary.reflections < 1) throw new LearningApplicationError('conflict', 'planning gate blocked: add a reflect step before execution')
    if (!await activateLearningMission(client, missionScope)) {
      throw new LearningApplicationError('conflict', 'Mission planning state changed')
    }
  })
  return getLearningMission(db, room.companyId, room.projectId, missionId)
}

export async function updateLearningMissionStep(
  db: Queryable,
  transaction: LearningTransaction,
  scope: LearningAgentRoomScope,
  input: {
    missionId: string
    stepId: string
    status: 'OPEN'|'IN_PROGRESS'|'COMPLETED'|'CANCELLED'
    outcome?: string
    sourceEvidenceId?: string
    attemptId?: string
  },
) {
  if (input.status === 'COMPLETED' && !input.outcome?.trim()) {
    throw new LearningApplicationError('invalid', 'completed mission steps require an outcome')
  }
  if (input.status === 'COMPLETED' && !input.sourceEvidenceId && !input.attemptId) {
    throw new LearningApplicationError('invalid', 'completed mission steps require a persisted report or learner attempt')
  }
  const room = await requireLearningRoomState(db, scope)
  await transaction(async (client) => {
    if (!await lockLearningMission(client, {
      ...scope,
      projectId: room.projectId,
      missionId: input.missionId,
      statuses: ['ACTIVE','PAUSED'],
    })) throw new LearningApplicationError('not_found', 'active Mission not found in the current project conversation')
    if (!await updateLearningMissionStepRecord(client, {
      ...scope,
      projectId: room.projectId,
      ...input,
    })) throw new LearningApplicationError('not_found', 'mission step or completion evidence not found')
  })
  return getLearningMission(db, room.companyId, room.projectId, input.missionId)
}

export async function completeLearningMission(
  db: Queryable,
  transaction: LearningTransaction,
  scope: LearningAgentRoomScope,
  missionId: string,
) {
  const room = await requireLearningRoomState(db, scope)
  const missionScope = { companyId: room.companyId, projectId: room.projectId, missionId }
  await transaction(async (client) => {
    if (!await lockLearningMission(client, {
      ...scope,
      projectId: room.projectId,
      missionId,
      statuses: ['ACTIVE','PAUSED'],
    })) throw new LearningApplicationError('not_found', 'active Mission not found in the current project conversation')
    const summary = await learningMissionCompletionSummary(client, missionScope)
    if (summary.unresolved > 0) throw new LearningApplicationError('conflict', 'mission has unresolved steps')
    if (summary.reflections < 1) throw new LearningApplicationError('conflict', 'mission requires a completed reflection step')
    if (!await completeLearningMissionRecord(client, missionScope)) {
      throw new LearningApplicationError('conflict', 'Mission state changed before completion')
    }
  })
  return getLearningMission(db, room.companyId, room.projectId, missionId)
}
