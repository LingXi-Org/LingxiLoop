import { z } from 'zod'

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

export const archiveCourseRequestSchema = z.object({ archive: z.boolean().default(true) }).strict()
export const updateCourseMemberRequestSchema = z.object({ role: z.enum(['teacher', 'learner']) }).strict()

export const createCourseInvitationRequestSchema = z.object({
  email: z.string().trim().email('invalid email').nullable().optional(),
  role: z.enum(['teacher', 'learner']),
  note: z.string().trim().max(280).nullable().optional(),
  expiresInDays: z.coerce.number().int().min(1).max(30).default(7),
  maxUses: z.coerce.number().int().min(1).max(100).default(1),
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
export const objectiveStatusRequestSchema = z.object({ status: z.enum(['draft', 'published', 'archived']) }).strict()
export const createActivityRequestSchema = z.object({
  title: z.string().trim().min(1),
  instructions: z.string().trim().min(1),
  type: z.enum(['lesson', 'practice', 'assessment', 'project', 'review']),
  evaluationMode: z.enum(['agent_formative', 'teacher_required']).default('teacher_required'),
  targetLevel: z.coerce.number().int().min(1).max(4).default(2),
  rubric: z.array(z.unknown()).default([]),
  objectiveIds: z.array(z.string()).default([]),
  dueAt: z.string().optional(),
}).strict()
export const submitActivityRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(200),
  answer: z.string().trim().min(1),
  assistance: z.enum(['none', 'hint', 'guided']).default('none'),
}).strict()
export const missionCoordinatorRequestSchema = z.object({ agentId: z.string().trim().min(1) }).strict()
export const reviewEvaluationRequestSchema = z.object({
  decision: z.enum(['accept', 'reject']),
  reason: z.string().trim().min(1),
  overrideLevel: z.coerce.number().int().min(1).max(4).optional(),
}).strict()
export const notificationPreferencesRequestSchema = z.object({
  courseId: z.string().optional(),
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  timezone: z.string().trim().min(1),
  preferredTime: z.string().trim().min(1),
  quietStart: z.string().optional(),
  quietEnd: z.string().optional(),
}).strict()

export type CreateCourseInput = z.infer<typeof createCourseRequestSchema>
export type UpdateCourseInput = z.infer<typeof updateCourseRequestSchema>
export type CreateCourseInvitationInput = z.infer<typeof createCourseInvitationRequestSchema>
export type BindCourseRoomInput = z.infer<typeof bindCourseRoomRequestSchema>
export type CreateObjectivesInput = z.infer<typeof createObjectivesRequestSchema>
export type ObjectiveStatusInput = z.infer<typeof objectiveStatusRequestSchema>
export type CreateActivityInput = z.infer<typeof createActivityRequestSchema>
export type SubmitActivityInput = z.infer<typeof submitActivityRequestSchema>
export type MissionCoordinatorInput = z.infer<typeof missionCoordinatorRequestSchema>
export type ReviewEvaluationInput = z.infer<typeof reviewEvaluationRequestSchema>
export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesRequestSchema>

export interface CreateLearningObjectivesCommand extends CreateObjectivesInput {
  companyId: string
  courseId: string
  actorId: string
  actorKind: 'agent' | 'teacher'
}

export interface CreateLearningActivityCommand {
  companyId: string
  courseId: string
  actorId: string
  actorKind: 'agent' | 'teacher'
  title: string
  instructions: string
  type: 'lesson' | 'practice' | 'assessment' | 'project' | 'review'
  evaluationMode?: 'agent_formative' | 'teacher_required'
  targetLevel?: number
  rubric?: unknown[]
  objectiveIds?: string[]
  dueAt?: string
}

export interface LearningAgentRoomScope {
  companyId: string
  channelId: string
}

export interface AddLearningMissionStepInput {
  type: 'learn' | 'practice' | 'check' | 'reflect'
  description: string
  successCriteria: string
  objectiveId?: string
}

export interface StartLearningMissionCommand extends LearningAgentRoomScope {
  workId: string
  agentId: string
  triggerClientMsgNo: string
  threadRootClientMsgNo?: string
  goal: string
  successCriteria: string
  missionKind?: 'study' | 'research' | 'project'
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
  assistance?: 'none' | 'hint' | 'guided'
}

export interface ProposeLearningEvaluationCommand extends LearningAgentRoomScope {
  agentId: string
  attemptId: string
  demonstratedLevel: number
  confidence: number
  rubricResults?: unknown[]
  feedback?: string
  sourceReportId?: string
  verifierReportId?: string
}

export interface LearningScope { userId: string; companyId: string }
export interface LearningNotificationPreferences {
  company_id: string
  user_id: string
  course_id: string | null
  in_app_enabled: boolean
  email_enabled: boolean
  timezone: string
  preferred_time: string
  quiet_start: string | null
  quiet_end: string | null
}
export interface CourseManager extends LearningScope {
  companyRole: string
  courseRole: string | null
  projectId: string
  status: string
}
