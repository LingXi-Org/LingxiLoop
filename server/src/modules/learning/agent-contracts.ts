import { z } from 'zod'
import { createActivityRequestSchema, createObjectivesRequestSchema, learningScoreBreakdownSchema, reviewEvaluationRequestSchema } from './contracts.js'
import { learningContentFields } from './forum-contracts.js'

const id = z.string().trim().min(1).max(200)
const text = z.string().trim().min(1).max(10_000)
const ids = (max: number) => z.array(id).max(max).refine(values => new Set(values).size === values.length, 'IDs must be unique')
const level = z.number().int().min(1).max(4)
const activity = createActivityRequestSchema.extend({ title: text, instructions: text, targetLevel: level.default(2),
  rubric: z.array(z.unknown()).max(100).default([]), objectiveIds: ids(100).default([]), dueAt: z.string().datetime().optional() })
const objective = createObjectivesRequestSchema.shape.objectives.element.extend({ title: text, successCriteria: text,
  targetLevel: level.optional(), prerequisiteIds: ids(100).optional() })
const step = z.object({ kind: z.enum(['LEARN', 'PRACTICE', 'CHECK', 'REFLECT']), description: text, successCriteria: text,
  knowledgeUnitId: id.optional() }).strict()

export const learningAgentSchemas = {
  current: z.object({}).strict(), get_learner_state: z.object({}).strict(), list_knowledge_units: z.object({}).strict(), list_due: z.object({}).strict(),
  get_activity: z.object({ activityId: id }).strict(), get_mission: z.object({ missionId: id.optional() }).strict(),
  list_attempts: z.object({ activityId: id.optional(), missionStepId: id.optional() }).strict()
    .refine(value => !(value.activityId && value.missionStepId), 'filter by activity or step'),
  get_attempt: z.object({ attemptId: id }).strict(),
  submit_activity: z.object({ activityId: id,idempotencyKey: z.string().trim().min(8).max(200),
    source: z.enum(['AGENT_RELAY','AGENT_GENERATED']).describe('AGENT_RELAY forwards the original learner messages unchanged. AGENT_GENERATED submits generated work and never counts as independent human evidence.'),
    answer: z.string().trim().max(20000).default(''),
    evidenceClientMsgNos: ids(20).default([]).describe('Committed original learner message client IDs; required for AGENT_RELAY.'),assistance: z.enum(['NONE','HINT','GUIDED']).default('NONE'),
    ...learningContentFields }).strict()
    .refine(value => value.source !== 'AGENT_RELAY' || value.evidenceClientMsgNos.length > 0, 'relay requires committed original human messages'),
  draft_knowledge_units: z.object({ knowledgeUnits: z.array(objective.omit({ prerequisiteIds: true })
    .extend({ prerequisiteKnowledgeUnitIds: ids(100).optional() })).min(1).max(100) }).strict(),
  draft_activity: activity.omit({ type: true, objectiveIds: true }).extend({ kind: activity.shape.type, knowledgeUnitIds: ids(100).default([]) }),
  start_mission: z.object({ goal: text, successCriteria: text, missionKind: z.enum(['STUDY', 'RESEARCH', 'PROJECT']).optional(),
    sourceClientMsgNo: id.optional(), explicit: z.boolean().optional() }).strict(),
  add_steps: z.object({ missionId: id, steps: z.array(step).min(1).max(64) }).strict(),
  finish_planning: z.object({ missionId: id }).strict(), complete_mission: z.object({ missionId: id }).strict(),
  update_step: z.object({ missionId: id, stepId: id, status: z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
    outcome: text.optional(), sourceEvidenceId: id.optional(), attemptId: id.optional() }).strict()
    .refine(value => value.status !== 'COMPLETED' || Boolean(value.outcome && (value.sourceEvidenceId || value.attemptId)), 'completion requires an outcome and persisted evidence'),
  record_attempt: z.object({ activityId: id.optional(), missionStepId: id.optional(), evidenceClientMsgNos: ids(20).default([]),
    documentIds: ids(20).default([]), canvasFrameIds: ids(20).default([]), assistance: z.enum(['NONE', 'HINT', 'GUIDED']).default('NONE') }).strict()
    .refine(value => Boolean(value.activityId) !== Boolean(value.missionStepId), 'exactly one activity or step is required')
    .refine(value => value.evidenceClientMsgNos.length + value.documentIds.length + value.canvasFrameIds.length > 0, 'persisted evidence is required'),
  propose_evaluation: z.object({ attemptId: id, demonstratedLevel: z.number().int().min(0).max(4), confidence: z.number().min(0).max(1),
    rubricResults: learningScoreBreakdownSchema, feedback: text.optional(), sourceEvidenceId: id.optional(), verifierEvidenceId: id.optional() }).strict()
    .refine(value => !value.verifierEvidenceId || Boolean(value.sourceEvidenceId), 'verifier evidence requires source evidence'),
}

const membership = z.object({ userId: id, enabled: z.boolean() }).strict()
export const teacherAgentSchemas = {
  current: z.object({}).strict(), overview: z.object({ windowDays: z.number().int().min(1).max(90).default(30) }).strict(),
  list_learners: z.object({ attentionOnly: z.boolean().default(false) }).strict(),
  get_learner: z.object({ learnerId: id }).strict(), get_attempt: z.object({ attemptId: id }).strict(),
  list_objectives: z.object({}).strict(), list_activities: z.object({}).strict(), list_reviews: z.object({}).strict(), list_rooms: z.object({}).strict(),
  get_digest_schedule: z.object({}).strict(), draft_objectives: z.object({ objectives: z.array(objective).min(1).max(100) }).strict(),
  draft_activity: activity, update_course: z.object({ title: text.optional(), description: text.optional() }).strict()
    .refine(value => Object.keys(value).length > 0, 'title or description is required'),
  set_learner_membership: membership, set_teacher_membership: membership,
  set_room_binding: z.object({ conversationId: id, enabled: z.boolean(), purpose: z.enum(['lab', 'discussion']).optional() }).strict()
    .refine(value => value.enabled ? Boolean(value.purpose) : value.purpose === undefined, 'purpose is required only when enabling a room'),
  publish_objective: z.object({ objectiveId: id }).strict(), archive_objective: z.object({ objectiveId: id }).strict(),
  publish_activity: z.object({ activityId: id }).strict(), close_activity: z.object({ activityId: id }).strict(),
  transition_course: z.object({ command: z.enum(['END', 'ENTER_READ_ONLY', 'ARCHIVE']) }).strict(),
  review_evaluation: reviewEvaluationRequestSchema.extend({ evaluationId: id, reason: text }),
  configure_digest: z.object({ frequency: z.enum(['off', 'daily', 'weekly']), localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    timezone: z.string().max(100).default('Asia/Shanghai').refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false } }, 'invalid timezone'),
    weekday: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']).optional() }).strict()
    .refine(value => value.frequency === 'off' || Boolean(value.localTime && (value.frequency !== 'weekly' || value.weekday)), 'scheduled digest requires a time and weekly day'),
}
