import { avatarInputSchema } from '../identity/contracts.js'

import { z } from 'zod'



export const createCourseRequestSchema = z.object({
  name: z.string().trim().min(1, 'name required').max(80),
  description: z.string().trim().max(1000).default(''),
  color: z.string().max(200).default('#5266d6'),
}).strict()


export const updateCourseRequestSchema = z.object({
  avatar: avatarInputSchema.optional(),
  name: z.string().trim().min(1, 'name required').max(80).optional(),
  description: z.string().trim().max(1000).optional(),
  color: z.string().max(200).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'nothing to update')


export const updateCourseMemberRequestSchema = z.object({ role: z.enum(['teacher', 'learner']) }).strict()


export const addInstitutionalCourseMemberRequestSchema = z.object({
  role: z.literal('TEACHER'),
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

export type CreateCourseInput = z.infer<typeof createCourseRequestSchema>

export type UpdateCourseInput = z.infer<typeof updateCourseRequestSchema>

export type AddInstitutionalCourseMemberInput = z.infer<typeof addInstitutionalCourseMemberRequestSchema>

export type CreateProjectInvitationInput = z.infer<typeof createProjectInvitationRequestSchema>

export type LearningSpacesQuery = z.infer<typeof learningSpacesQuerySchema>


export interface LearningScope { userId: string; companyId: string }

export interface CourseManager extends LearningScope {
  companyRole: string
  courseRole: string | null
  projectId: string
  status: string
}

export { type LearningPersonaKey, STARTER_ROOMS, STARTER_TEAM } from './preset.js'
