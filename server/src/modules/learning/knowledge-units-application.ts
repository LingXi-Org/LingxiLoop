import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import type {
  CreateLearningKnowledgeUnitsCommand,
  CreateLearningObjectivesCommand,
} from './contracts.js'
import { LearningApplicationError } from './errors.js'
import { requireLearningCourseProjectScope } from './project-scope-repository.js'
import {
  insertLearningKnowledgeUnit,
  insertLearningKnowledgeUnitDependency,
  listLearningObjectives,
  listProjectLearningKnowledgeUnits,
  updateLearningKnowledgeUnitStatus,
} from './repository.js'
import type { LearningKnowledgeUnitStatus } from './types.js'

type LearningTransaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>

function learningText(value: string, name: string): string {
  const text = value.trim()
  if (!text) throw new LearningApplicationError('invalid', `${name} is required`)
  if (text.length > 10_000) {
    throw new LearningApplicationError('invalid', `${name} exceeds 10000 characters`)
  }
  return text
}

function learningLevel(value: number | undefined): 1 | 2 | 3 | 4 {
  const level = value ?? 3
  if (!Number.isInteger(level) || level < 1 || level > 4) {
    throw new LearningApplicationError('invalid', 'targetLevel must be between 1 and 4')
  }
  return level as 1 | 2 | 3 | 4
}

async function writeLearningKnowledgeUnits(
  db: Queryable,
  input: CreateLearningKnowledgeUnitsCommand,
): Promise<void> {
  if (input.actorKind === 'teacher') {
    await createPermissionService(db, { lockDependencies: true }).assertCan({
      actorUserId: input.actorId,
      action: 'learning:manage',
      companyId: input.companyId,
      projectId: input.projectId,
      resource: { type: 'project', id: input.projectId },
    })
  }
  for (const [position, unit] of input.knowledgeUnits.entries()) {
    const knowledgeUnitId = randomUUID()
    await insertLearningKnowledgeUnit(db, {
      id: knowledgeUnitId,
      companyId: input.companyId,
      projectId: input.projectId,
      actorId: input.actorId,
      title: learningText(unit.title, 'knowledge unit title'),
      successCriteria: learningText(unit.successCriteria, 'successCriteria'),
      targetLevel: learningLevel(unit.targetLevel),
      position,
    })
    for (const prerequisiteKnowledgeUnitId of unit.prerequisiteKnowledgeUnitIds ?? []) {
      await insertLearningKnowledgeUnitDependency(db, {
        companyId: input.companyId,
        projectId: input.projectId,
        knowledgeUnitId,
        prerequisiteKnowledgeUnitId,
      })
    }
  }
}

function assertKnowledgeUnitBatchLength(length: number): void {
  if (!length || length > 100) {
    throw new LearningApplicationError('invalid', 'knowledgeUnits must contain between 1 and 100 items')
  }
}

export async function createLearningKnowledgeUnits(
  db: Queryable,
  transaction: LearningTransaction,
  input: CreateLearningKnowledgeUnitsCommand,
) {
  assertKnowledgeUnitBatchLength(input.knowledgeUnits.length)
  await transaction((client) => writeLearningKnowledgeUnits(client, input))
  return listProjectLearningKnowledgeUnits(db, input.companyId, input.projectId)
}

export async function createLearningObjectives(
  db: Queryable,
  transaction: LearningTransaction,
  input: CreateLearningObjectivesCommand,
) {
  assertKnowledgeUnitBatchLength(input.objectives.length)
  await transaction(async (client) => {
    const project = await requireLearningCourseProjectScope(client, input.companyId, input.courseId)
    await writeLearningKnowledgeUnits(client, {
      companyId: input.companyId,
      projectId: project.projectId,
      actorId: input.actorId,
      actorKind: input.actorKind,
      knowledgeUnits: input.objectives.map((objective) => ({
        title: objective.title,
        successCriteria: objective.successCriteria,
        ...(objective.targetLevel !== undefined ? { targetLevel: objective.targetLevel } : {}),
        ...(objective.prerequisiteIds ? {
          prerequisiteKnowledgeUnitIds: objective.prerequisiteIds,
        } : {}),
      })),
    })
  })
  return listLearningObjectives(db, input.companyId, input.courseId)
}

export async function setLearningKnowledgeUnitStatus(
  db: Queryable,
  input: {
    companyId: string
    projectId: string
    knowledgeUnitId: string
    teacherId: string
    status: LearningKnowledgeUnitStatus
  },
): Promise<void> {
  await createPermissionService(db).assertCan({
    actorUserId: input.teacherId,
    action: 'learning:manage',
    companyId: input.companyId,
    projectId: input.projectId,
    resource: { type: 'project', id: input.projectId },
  })
  if (!await updateLearningKnowledgeUnitStatus(db, input)) {
    throw new LearningApplicationError('not_found', 'knowledge unit not found')
  }
}

export async function setLearningObjectiveStatus(
  db: Queryable,
  input: {
    companyId: string
    courseId: string
    objectiveId: string
    teacherId: string
    status: LearningKnowledgeUnitStatus
  },
): Promise<void> {
  const project = await requireLearningCourseProjectScope(db, input.companyId, input.courseId)
  return setLearningKnowledgeUnitStatus(db, {
    companyId: input.companyId,
    projectId: project.projectId,
    knowledgeUnitId: input.objectiveId,
    teacherId: input.teacherId,
    status: input.status,
  })
}
