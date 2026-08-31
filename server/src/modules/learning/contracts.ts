import { z } from 'zod'

// Data-only public contract used by Company onboarding without loading the
// Learning runtime (and therefore runtime environment/infrastructure).
export { type LearningPersonaKey, STARTER_ROOMS, STARTER_TEAM } from './preset.js'

export const createCourseRequestSchema = z.object({
  name: z.string().trim().min(1, 'name required').max(80),
  description: z.string().trim().max(1000).default(''),
  color: z.string().max(200).default('#5266d6'),
}).strict()

export const updateCourseRequestSchema = z.object({
  name: z.string().trim().min(1, 'name required').max(80).optional(),
  description: z.string().trim().max(1000).optional(),
  color: z.string().max(200).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'nothing to update')

export const updateCourseMemberRequestSchema = z.object({ role: z.enum(['teacher', 'learner']) }).strict()

export const addInstitutionalCourseMemberRequestSchema = z.object({
  role: z.enum(['TEACHER', 'TA', 'STUDENT', 'OBSERVER']),
  idempotencyKey: z.string().trim().min(8).max(200),
}).strict()

export const createProjectInvitationRequestSchema = z.object({
  email: z.string().trim().email('invalid email').nullable().optional(),
  note: z.string().trim().max(280).nullable().optional(),
  expiresInDays: z.coerce.number().int().min(1).max(30).default(7),
  maxUses: z.coerce.number().int().min(1).max(100).default(1),
}).strict()

const cursorSchema = z.string().trim().min(1).max(1024).optional()

export const learningSpacesQuerySchema = z.object({
  cursor: cursorSchema,
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).strict()

export const learningOverviewQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(365).default(30),
}).strict()

const queryBooleanSchema = z.union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => value === true || value === 'true')

export const learningLearnersQuerySchema = z.object({
  cursor: cursorSchema,
  limit: z.coerce.number().int().min(1).max(100).default(30),
  attentionOnly: queryBooleanSchema.default(false),
  search: z.string().trim().min(1).max(100).optional(),
}).strict()

export const bindCourseRoomRequestSchema = z.object({ purpose: z.enum(['lab', 'discussion']) }).strict()
export const createObjectivesRequestSchema = z.object({
  objectives: z.array(z.object({
    title: z.string().trim().min(1),
    successCriteria: z.string().trim().min(1),
    targetLevel: z.coerce.number().int().min(1).max(4).optional(),
    prerequisiteIds: z.array(z.string()).optional(),
  }).strict()).min(1),
}).strict()
export const objectiveStatusRequestSchema = z.object({ status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']) }).strict()
export const createActivityRequestSchema = z.object({
  title: z.string().trim().min(1),
  instructions: z.string().trim().min(1),
  type: z.enum(['LESSON', 'PRACTICE', 'ASSESSMENT', 'PROJECT', 'REVIEW']),
  evaluationMode: z.enum(['AGENT_FORMATIVE', 'TEACHER_REQUIRED']).default('TEACHER_REQUIRED'),
  targetLevel: z.coerce.number().int().min(1).max(4).default(2),
  rubric: z.array(z.unknown()).default([]),
  objectiveIds: z.array(z.string()).default([]),
  dueAt: z.string().optional(),
}).strict()
export const submitActivityRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(200),
  answer: z.string().trim().min(1),
  assistance: z.enum(['NONE', 'HINT', 'GUIDED']).default('NONE'),
}).strict()
const importedActivitySchema = z.object({
  externalId: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  instructions: z.string().trim().min(1).max(10_000),
  kind: z.enum(['LESSON', 'PRACTICE', 'ASSESSMENT', 'PROJECT', 'REVIEW']),
  evaluationMode: z.enum(['AGENT_FORMATIVE', 'TEACHER_REQUIRED']).default('TEACHER_REQUIRED'),
  targetLevel: z.number().int().min(1).max(4).default(2),
  rubric: z.array(z.unknown()).max(100).default([]),
  knowledgeUnitIds: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  dueAt: z.string().datetime().optional(),
}).strict().refine((value) => JSON.stringify(value.rubric).length <= 32_768, {
  message: 'activity rubric exceeds 32768 characters', path: ['rubric'],
})
export const importLearningActivitiesRequestSchema = z.object({
  sourceSystem: z.string().trim().min(1).max(100),
  externalImportId: z.string().trim().min(1).max(200),
  activities: z.array(importedActivitySchema).min(1).max(100),
}).strict().refine((value) => new Set(value.activities.map((activity) => activity.externalId)).size === value.activities.length, {
  message: 'external activity IDs must be unique', path: ['activities'],
}).refine((value) => JSON.stringify(value).length <= 524_288, {
  message: 'activity import exceeds 524288 characters', path: ['activities'],
})
export const missionCoordinatorRequestSchema = z.object({ agentId: z.string().trim().min(1) }).strict()
export const reviewEvaluationRequestSchema = z.object({
  decision: z.enum(['accept', 'reject']),
  reason: z.string().trim().min(1),
}).strict()
export type CreateCourseInput = z.infer<typeof createCourseRequestSchema>
export type UpdateCourseInput = z.infer<typeof updateCourseRequestSchema>
export type AddInstitutionalCourseMemberInput = z.infer<typeof addInstitutionalCourseMemberRequestSchema>
export type CreateProjectInvitationInput = z.infer<typeof createProjectInvitationRequestSchema>
export type LearningSpacesQuery = z.infer<typeof learningSpacesQuerySchema>
export type LearningOverviewQuery = z.infer<typeof learningOverviewQuerySchema>
export type LearningLearnersQuery = z.infer<typeof learningLearnersQuerySchema>
export type BindCourseRoomInput = z.infer<typeof bindCourseRoomRequestSchema>
export type CreateObjectivesInput = z.infer<typeof createObjectivesRequestSchema>
export type ObjectiveStatusInput = z.infer<typeof objectiveStatusRequestSchema>
export type CreateActivityInput = z.infer<typeof createActivityRequestSchema>
export type SubmitActivityInput = z.infer<typeof submitActivityRequestSchema>
export type LearningActivityImportInput = z.infer<typeof importLearningActivitiesRequestSchema>
export type MissionCoordinatorInput = z.infer<typeof missionCoordinatorRequestSchema>
export type ReviewEvaluationInput = z.infer<typeof reviewEvaluationRequestSchema>

export interface CreateLearningObjectivesCommand extends CreateObjectivesInput {
  companyId: string
  courseId: string
  actorId: string
  actorKind: 'agent' | 'teacher'
}

export interface CreateLearningKnowledgeUnitsCommand {
  companyId: string
  projectId: string
  actorId: string
  actorKind: 'agent' | 'teacher'
  knowledgeUnits: Array<{
    title: string
    successCriteria: string
    targetLevel?: number
    prerequisiteKnowledgeUnitIds?: string[]
  }>
}

export interface CreateLearningActivityCommand {
  companyId: string
  courseId: string
  actorId: string
  actorKind: 'agent' | 'teacher'
  title: string
  instructions: string
  type: 'LESSON' | 'PRACTICE' | 'ASSESSMENT' | 'PROJECT' | 'REVIEW'
  evaluationMode?: 'AGENT_FORMATIVE' | 'TEACHER_REQUIRED'
  targetLevel?: number
  rubric?: unknown[]
  objectiveIds?: string[]
  dueAt?: string
}

export interface CreateProjectLearningActivityCommand {
  companyId: string
  projectId: string
  actorId: string
  actorKind: 'agent' | 'teacher'
  title: string
  instructions: string
  kind: 'LESSON' | 'PRACTICE' | 'ASSESSMENT' | 'PROJECT' | 'REVIEW'
  evaluationMode?: 'AGENT_FORMATIVE' | 'TEACHER_REQUIRED'
  targetLevel?: number
  rubric?: unknown[]
  knowledgeUnitIds?: string[]
  dueAt?: string
}

export interface LearningAgentRoomScope {
  companyId: string
  channelId: string
}

export interface AddLearningMissionStepInput {
  kind: 'LEARN' | 'PRACTICE' | 'CHECK' | 'REFLECT'
  description: string
  successCriteria: string
  knowledgeUnitId?: string
}

export interface StartLearningMissionCommand extends LearningAgentRoomScope {
  workId: string
  agentId: string
  triggerClientMsgNo: string
  threadRootClientMsgNo?: string
  goal: string
  successCriteria: string
  missionKind?: 'STUDY' | 'RESEARCH' | 'PROJECT'
  sourceClientMsgNo?: string
  explicit?: boolean
}

export interface RecordLearningAttemptCommand extends LearningAgentRoomScope {
  agentId: string
  activityId?: string
  missionStepId?: string
  evidenceClientMsgNos?: string[]
  documentIds?: string[]
  canvasFrameIds?: string[]
  assistance?: 'NONE' | 'HINT' | 'GUIDED'
}

export interface ProposeLearningEvaluationCommand extends LearningAgentRoomScope {
  agentId: string
  attemptId: string
  demonstratedLevel: number
  confidence: number
  rubricResults?: unknown[]
  feedback?: string
  sourceEvidenceId?: string
  verifierEvidenceId?: string
}

export interface LearningScope { userId: string; companyId: string }
export interface CourseManager extends LearningScope {
  companyRole: string
  courseRole: string | null
  projectId: string
  status: string
}
