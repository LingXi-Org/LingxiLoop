import { createHash, randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import { createEvidenceRecordInTransaction, createEvidenceWithLinksInTransaction } from '../evidence/public.js'
import { commitDomainEvent } from '../events/public.js'
import { assessmentAttemptSubmittedEvent } from './activity-events.js'
import type {
  CreateLearningActivityCommand,
  CreateProjectLearningActivityCommand,
} from './contracts.js'
import { LearningApplicationError } from './errors.js'
import { requireLearningCourseProjectScope } from './project-scope-repository.js'
import {
  closeProjectLearningActivityRecord,
  countPublishedProjectLearningKnowledgeUnits,
  countProjectLearningKnowledgeUnits,
  findLearningActivity,
  findProjectLearningActivity,
  insertProjectLearningActivity,
  insertProjectLearningActivityAttempt,
  lockProjectLearningActivityForPublish,
  publishProjectLearningActivityRecord,
} from './repository.js'

type LearningTransaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>
type ActivityStatusInput = { companyId: string; projectId: string; activityId: string; teacherId: string }

function learningText(value: string, name: string, maxLength = 10_000): string {
  const text = value.trim()
  if (!text) throw new LearningApplicationError('invalid', `${name} is required`)
  if (text.length > maxLength) {
    throw new LearningApplicationError('invalid', `${name} exceeds ${maxLength} characters`)
  }
  return text
}

function learningLevel(value: number | undefined): 1 | 2 | 3 | 4 {
  const level = value ?? 2
  if (!Number.isInteger(level) || level < 1 || level > 4) {
    throw new LearningApplicationError('invalid', 'targetLevel must be between 1 and 4')
  }
  return level as 1 | 2 | 3 | 4
}

async function assertProjectPermission(
  db: Queryable,
  input: { companyId: string; projectId: string; userId: string; action: 'learning:manage'|'learning:submit' },
): Promise<void> {
  await createPermissionService(db, { lockDependencies: input.action === 'learning:manage' }).assertCan({
    actorUserId: input.userId,
    action: input.action,
    companyId: input.companyId,
    projectId: input.projectId,
    resource: { type: 'project', id: input.projectId },
  })
}

async function writeProjectLearningActivity(
  db: Queryable,
  input: CreateProjectLearningActivityCommand,
  activityId: string,
): Promise<void> {
  const knowledgeUnitIds = [...new Set(input.knowledgeUnitIds ?? [])]
  const rubric = Array.isArray(input.rubric) ? input.rubric : []
  if (knowledgeUnitIds.length > 100 || rubric.length > 100) {
    throw new LearningApplicationError('invalid', 'activity knowledge-unit and rubric lists are limited to 100 items')
  }
  if (input.actorKind === 'teacher') {
    await assertProjectPermission(db, {
      companyId: input.companyId,
      projectId: input.projectId,
      userId: input.actorId,
      action: 'learning:manage',
    })
  }
  if (knowledgeUnitIds.length
    && await countProjectLearningKnowledgeUnits(
      db, input.companyId, input.projectId, knowledgeUnitIds,
    ) !== knowledgeUnitIds.length) {
    throw new LearningApplicationError('invalid', 'every activity knowledge unit must belong to the current project')
  }
  await insertProjectLearningActivity(db, {
    id: activityId,
    companyId: input.companyId,
    projectId: input.projectId,
    actorId: input.actorId,
    title: learningText(input.title, 'title'),
    instructions: learningText(input.instructions, 'instructions'),
    kind: input.kind,
    evaluationMode: input.evaluationMode ?? 'TEACHER_REQUIRED',
    targetLevel: learningLevel(input.targetLevel),
    rubric,
    knowledgeUnitIds,
    ...(input.dueAt ? { dueAt: input.dueAt } : {}),
  })
}

export async function createProjectLearningActivity(
  db: Queryable,
  transaction: LearningTransaction,
  input: CreateProjectLearningActivityCommand,
) {
  const activityId = randomUUID()
  await transaction((client) => writeProjectLearningActivity(client, input, activityId))
  const activity = await findProjectLearningActivity(db, input.companyId, input.projectId, activityId)
  if (!activity) throw new LearningApplicationError('not_found', 'activity not found after creation')
  return activity
}

export async function createLearningActivity(
  db: Queryable,
  transaction: LearningTransaction,
  input: CreateLearningActivityCommand,
) {
  const activityId = randomUUID()
  await transaction(async (client) => {
    const project = await requireLearningCourseProjectScope(client, input.companyId, input.courseId)
    await writeProjectLearningActivity(client, {
      companyId: input.companyId,
      projectId: project.projectId,
      actorId: input.actorId,
      actorKind: input.actorKind,
      title: input.title,
      instructions: input.instructions,
      kind: input.type,
      ...(input.evaluationMode ? { evaluationMode: input.evaluationMode } : {}),
      ...(input.targetLevel !== undefined ? { targetLevel: input.targetLevel } : {}),
      ...(input.rubric ? { rubric: input.rubric } : {}),
      ...(input.objectiveIds ? { knowledgeUnitIds: input.objectiveIds } : {}),
      ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    }, activityId)
  })
  const activity = await findLearningActivity(db, input.companyId, input.courseId, activityId)
  if (!activity) throw new LearningApplicationError('not_found', 'activity not found after creation')
  return activity
}

async function publishProjectActivity(db: Queryable, input: ActivityStatusInput): Promise<void> {
  await assertProjectPermission(db, {
    companyId: input.companyId,
    projectId: input.projectId,
    userId: input.teacherId,
    action: 'learning:manage',
  })
  const activity = await lockProjectLearningActivityForPublish(
    db, input.companyId, input.projectId, input.activityId,
  )
  if (!activity) throw new LearningApplicationError('not_found', 'draft activity not found')
  if (!activity.knowledgeUnitIds.length
    || await countPublishedProjectLearningKnowledgeUnits(
      db, input.companyId, input.projectId, activity.knowledgeUnitIds,
    ) !== activity.knowledgeUnitIds.length) {
    throw new LearningApplicationError(
      'conflict',
      'published activities require at least one published knowledge unit',
    )
  }
  if (['ASSESSMENT','PROJECT'].includes(activity.kind) && !activity.rubric.length) {
    throw new LearningApplicationError('conflict', 'assessment and project activities require a rubric')
  }
  if (!await publishProjectLearningActivityRecord(db, input)) {
    throw new LearningApplicationError('not_found', 'draft activity not found')
  }
}

export async function publishProjectLearningActivity(
  transaction: LearningTransaction,
  input: ActivityStatusInput,
): Promise<void> {
  await transaction((client) => publishProjectActivity(client, input))
}

export async function publishLearningActivity(
  transaction: LearningTransaction,
  input: { companyId: string; courseId: string; activityId: string; teacherId: string },
): Promise<void> {
  await transaction(async (client) => {
    const project = await requireLearningCourseProjectScope(client, input.companyId, input.courseId)
    await publishProjectActivity(client, { ...input, projectId: project.projectId })
  })
}

export async function closeProjectLearningActivity(db: Queryable, input: ActivityStatusInput): Promise<void> {
  await assertProjectPermission(db, {
    companyId: input.companyId,
    projectId: input.projectId,
    userId: input.teacherId,
    action: 'learning:manage',
  })
  if (!await closeProjectLearningActivityRecord(db, input)) {
    throw new LearningApplicationError('not_found', 'published activity not found')
  }
}

export async function closeLearningActivity(
  db: Queryable,
  input: { companyId: string; courseId: string; activityId: string; teacherId: string },
): Promise<void> {
  const project = await requireLearningCourseProjectScope(db, input.companyId, input.courseId)
  return closeProjectLearningActivity(db, { ...input, projectId: project.projectId })
}

async function submitProjectLearningActivityInTransaction(
  db: Queryable,
  input: {
    companyId: string
    projectId: string
    activityId: string
    learnerId: string
    answer: string
    assistance?: 'NONE'|'HINT'|'GUIDED'
    idempotencyKey: string
  },
): Promise<{ attemptId: string; assistance: 'NONE'|'HINT'|'GUIDED' }> {
  await assertProjectPermission(db, {
    companyId: input.companyId,
    projectId: input.projectId,
    userId: input.learnerId,
    action: 'learning:submit',
  })
  const attemptId = randomUUID()
  const evidenceId = `evidence-${createHash('sha256').update(JSON.stringify([
    input.companyId, input.projectId, input.activityId, input.learnerId, input.idempotencyKey,
  ])).digest('hex')}`
  const evidenceInput = {
    id: evidenceId,
    companyId: input.companyId,
    projectId: input.projectId,
    level: 'L1' as const,
    derivation: 'OBSERVED' as const,
    kind: 'LEARNER_SUBMISSION',
    subjectUserId: input.learnerId,
    data: { answer: learningText(input.answer, 'answer', 100_000) },
    createdBy: { type: 'USER' as const, id: input.learnerId },
  }
  await createEvidenceRecordInTransaction(db, evidenceInput)
  const assistance = input.assistance ?? 'NONE'
  const acceptedId = await insertProjectLearningActivityAttempt(db, {
    id: attemptId,
    companyId: input.companyId,
    projectId: input.projectId,
    activityId: input.activityId,
    learnerId: input.learnerId,
    assistance,
    evidenceId,
    idempotencyKey: input.idempotencyKey,
  })
  if (!acceptedId) throw new LearningApplicationError('not_found', 'published activity not found')
  await createEvidenceWithLinksInTransaction(db, evidenceInput, [{
    relation: 'SOURCE', targetLevel: 'L1', targetKind: 'LEARNING_ATTEMPT', targetId: acceptedId,
  }])
  return { attemptId: acceptedId, assistance }
}

export async function submitProjectLearningActivity(
  transaction: LearningTransaction,
  input: {
    companyId: string
    projectId: string
    activityId: string
    learnerId: string
    answer: string
    assistance?: 'NONE'|'HINT'|'GUIDED'
    idempotencyKey: string
  },
): Promise<{ attemptId: string }> {
  const { result } = await commitDomainEvent(transaction, (db) => (
    submitProjectLearningActivityInTransaction(db, input)
  ), (attempt) => assessmentAttemptSubmittedEvent({
    companyId: input.companyId,
    projectId: input.projectId,
    activityId: input.activityId,
    learnerId: input.learnerId,
    attemptId: attempt.attemptId,
    assistance: attempt.assistance,
  }))
  return { attemptId: result.attemptId }
}

export async function submitLearningActivity(
  transaction: LearningTransaction,
  input: {
    companyId: string
    courseId: string
    activityId: string
    learnerId: string
    answer: string
    assistance?: 'NONE'|'HINT'|'GUIDED'
    idempotencyKey: string
  },
): Promise<{ attemptId: string }> {
  const { result } = await commitDomainEvent(transaction, async (db) => {
    const project = await requireLearningCourseProjectScope(db, input.companyId, input.courseId)
    const attempt = await submitProjectLearningActivityInTransaction(db, {
      ...input,
      projectId: project.projectId,
    })
    return { ...attempt, projectId: project.projectId }
  }, (attempt) => assessmentAttemptSubmittedEvent({
    companyId: input.companyId,
    projectId: attempt.projectId,
    activityId: input.activityId,
    learnerId: input.learnerId,
    attemptId: attempt.attemptId,
    assistance: attempt.assistance,
  }))
  return { attemptId: result.attemptId }
}
