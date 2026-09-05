import { z } from 'zod'

const learningCaseIdSchema = z.string().trim().min(1).max(200)

export const learningCaseProjectParamsSchema = z.object({
  projectId: learningCaseIdSchema,
}).strict()

export const learningCaseParamsSchema = z.object({
  projectId: learningCaseIdSchema,
  caseId: learningCaseIdSchema,
}).strict()

export const listLearningCasesQuerySchema = z.object({
  userId: learningCaseIdSchema.optional(),
  knowledgeUnitId: learningCaseIdSchema.optional(),
  status: z.enum(['DETECTED', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict()

export const createLearningCaseRequestSchema = z.object({
  userId: learningCaseIdSchema,
  knowledgeUnitId: learningCaseIdSchema,
  reason: z.string().trim().min(1).max(2_000),
  summary: z.string().trim().max(10_000).default(''),
}).strict()

export const applyLearningCaseActionRequestSchema = z.object({
  kind: z.enum(['DIAGNOSE', 'INTERVENE', 'REASSESS', 'ESCALATE', 'OVERRIDE', 'CLOSE']),
  expectedVersion: z.coerce.number().int().positive(),
  idempotencyKey: z.string().trim().min(8).max(200),
  reason: z.string().trim().max(2_000).optional(),
  activityId: learningCaseIdSchema.optional(),
  missionId: learningCaseIdSchema.optional(),
  attemptId: learningCaseIdSchema.optional(),
  evaluationId: learningCaseIdSchema.optional(),
}).strict()
