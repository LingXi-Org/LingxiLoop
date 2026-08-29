import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type { CreateLearningActivityCommand, CreateLearningObjectivesCommand } from './contracts.js'
import { LearningApplicationError } from './errors.js'
import {
  closeLearningActivityRecord,
  countCourseObjectives,
  countPublishedCourseObjectives,
  courseRole,
  findLearningActivity,
  insertLearningActivity,
  insertLearningActivityAttempt,
  insertLearningObjective,
  insertLearningObjectiveDependency,
  listLearningObjectives,
  lockLearningActivityForPublish,
  publishLearningActivityRecord,
  updateLearningObjectiveStatus,
} from './repository.js'

type LearningTransaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>

function learningText(value: string, name: string, maxLength = 10_000): string {
  const text = value.trim()
  if (!text) throw new LearningApplicationError('invalid', `${name} is required`)
  if (text.length > maxLength) throw new LearningApplicationError('invalid', `${name} exceeds ${maxLength} characters`)
  return text
}

function learningLevel(value: number | undefined, defaultValue: 1|2|3|4): 1 | 2 | 3 | 4 {
  const level = value ?? defaultValue
  if (!Number.isInteger(level) || level < 1 || level > 4) {
    throw new LearningApplicationError('invalid', 'targetLevel must be between 1 and 4')
  }
  return level as 1 | 2 | 3 | 4
}

export async function createLearningObjectives(
  db: Queryable,
  transaction: LearningTransaction,
  input: CreateLearningObjectivesCommand,
) {
  if (!input.objectives.length || input.objectives.length > 100) {
    throw new LearningApplicationError('invalid', 'objectives must contain between 1 and 100 items')
  }
  await transaction(async (client) => {
    if (input.actorKind === 'teacher') {
      const role = await courseRole(client, input.courseId, input.companyId, input.actorId)
      if (role !== 'teacher') throw new LearningApplicationError('forbidden', 'course teacher role required')
    }
    for (const [position, objective] of input.objectives.entries()) {
      const objectiveId = randomUUID()
      await insertLearningObjective(client, {
        id: objectiveId,
        companyId: input.companyId,
        courseId: input.courseId,
        actorId: input.actorId,
        title: learningText(objective.title, 'objective title'),
        successCriteria: learningText(objective.successCriteria, 'successCriteria'),
        targetLevel: learningLevel(objective.targetLevel, 3),
        position,
      })
      for (const prerequisiteId of objective.prerequisiteIds ?? []) {
        await insertLearningObjectiveDependency(client, {
          companyId: input.companyId,
          courseId: input.courseId,
          objectiveId,
          prerequisiteId,
        })
      }
    }
  })
  return listLearningObjectives(db, input.companyId, input.courseId)
}

export async function createLearningActivity(
  db: Queryable,
  transaction: LearningTransaction,
  input: CreateLearningActivityCommand,
) {
  const objectiveIds = [...new Set(input.objectiveIds ?? [])]
  const rubric = Array.isArray(input.rubric) ? input.rubric : []
  if (objectiveIds.length > 100 || rubric.length > 100) {
    throw new LearningApplicationError('invalid', 'activity objective and rubric lists are limited to 100 items')
  }
  const activityId = randomUUID()
  await transaction(async (client) => {
    if (input.actorKind === 'teacher') {
      const role = await courseRole(client, input.courseId, input.companyId, input.actorId)
      if (role !== 'teacher') throw new LearningApplicationError('forbidden', 'course teacher role required')
    }
    if (objectiveIds.length
      && await countCourseObjectives(client, input.companyId, input.courseId, objectiveIds) !== objectiveIds.length) {
      throw new LearningApplicationError('invalid', 'every activity objective must belong to the current course')
    }
    await insertLearningActivity(client, {
      id: activityId,
      companyId: input.companyId,
      courseId: input.courseId,
      actorId: input.actorId,
      title: learningText(input.title, 'title'),
      instructions: learningText(input.instructions, 'instructions'),
      type: input.type,
      evaluationMode: input.evaluationMode ?? 'teacher_required',
      targetLevel: learningLevel(input.targetLevel, 2),
      rubric,
      objectiveIds,
      ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    })
  })
  const activity = await findLearningActivity(db, input.companyId, input.courseId, activityId)
  if (!activity) throw new LearningApplicationError('not_found', 'activity not found after creation')
  return activity
}

export async function publishLearningActivity(
  transaction: LearningTransaction,
  input: { companyId: string; courseId: string; activityId: string; teacherId: string },
): Promise<void> {
  await transaction(async (client) => {
    const activity = await lockLearningActivityForPublish(
      client, input.companyId, input.courseId, input.activityId,
    )
    if (!activity) throw new LearningApplicationError('not_found', 'draft activity not found')
    if (!activity.objectiveIds.length
      || await countPublishedCourseObjectives(
        client, input.companyId, input.courseId, activity.objectiveIds,
      ) !== activity.objectiveIds.length) {
      throw new LearningApplicationError('conflict', 'published activities require at least one published objective')
    }
    if (['assessment','project'].includes(activity.type) && !activity.rubric.length) {
      throw new LearningApplicationError('conflict', 'assessment and project activities require a rubric')
    }
    if (!await publishLearningActivityRecord(client, input)) {
      throw new LearningApplicationError('not_found', 'draft activity not found')
    }
  })
}

export async function closeLearningActivity(
  db: Queryable,
  input: { companyId: string; courseId: string; activityId: string; teacherId: string },
): Promise<void> {
  if (!await closeLearningActivityRecord(db, input)) {
    throw new LearningApplicationError('not_found', 'published activity not found')
  }
}

export async function submitLearningActivity(
  db: Queryable,
  input: {
    companyId: string; courseId: string; activityId: string; learnerId: string
    answer: string; assistance?: 'none'|'hint'|'guided'; idempotencyKey: string
  },
): Promise<{ attemptId: string }> {
  const attemptId = randomUUID()
  const acceptedId = await insertLearningActivityAttempt(db, {
    id: attemptId,
    companyId: input.companyId,
    courseId: input.courseId,
    activityId: input.activityId,
    learnerId: input.learnerId,
    assistance: input.assistance ?? 'none',
    answer: learningText(input.answer, 'answer', 100_000),
    idempotencyKey: input.idempotencyKey,
  })
  if (!acceptedId) throw new LearningApplicationError('not_found', 'published activity not found')
  return { attemptId: acceptedId }
}




export async function setLearningObjectiveStatus(
  db: Queryable,
  input: {
    companyId: string
    courseId: string
    objectiveId: string
    teacherId: string
    status: 'draft' | 'published' | 'archived'
  },
): Promise<void> {
  if (!await updateLearningObjectiveStatus(db, input)) {
    throw new LearningApplicationError('not_found', 'objective not found')
  }
}

