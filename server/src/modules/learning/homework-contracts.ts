import { optionalContentDocument } from '../content-editor/contracts.js'
import { z } from 'zod'
import { conversationReferencesSchema } from './forum-evidence.js'
import { learningContentFields } from './forum-contracts.js'

const revision = z.number().int().min(0)
const id = z.string().trim().min(1).max(200)
export const homeworkDraftSchema = z.object({
  title: z.string().trim().min(1).max(200), instructions: z.string().trim().min(1).max(20000),
  criteria: z.array(z.string().trim().min(1).max(2000)).min(1).max(20).refine(values => new Set(values).size === values.length, 'criteria must be unique'),
  ...learningContentFields, criteriaDocument: optionalContentDocument, dueAt: z.string().datetime().nullable().default(null),
}).strict()
export const homeworkEditSchema = homeworkDraftSchema.extend({ expectedRevision: revision })
export const homeworkPublishSchema = z.object({ expectedRevision: revision, visibleHash: z.string().length(64), idempotencyKey: id.min(8) }).strict()
export const homeworkRevisionSchema = z.object({ expectedRevision: revision }).strict()
export const homeworkDeadlineSchema = homeworkRevisionSchema.extend({ dueAt: z.string().datetime() })
export const homeworkAnswerSchema = z.object({ text: z.string().max(20000).default(''), ...learningContentFields }).strict()
export const homeworkSaveAnswerSchema = homeworkAnswerSchema.extend({ expectedRevision: revision })
export const homeworkReportSchema = z.object({ expectedAnswerRevision: revision }).strict()
export const homeworkSubmitSchema = homeworkReportSchema.extend({ reportId: id, idempotencyKey: id.min(8), conversationReferences: conversationReferencesSchema })
export const homeworkShareSchema = z.object({ expectedEvidenceRevision: revision }).strict()
export const homeworkUnlockSchema = homeworkShareSchema.extend({ learnerId: id, reason: z.string().trim().min(1).max(4000) })
export const homeworkReviewSchema = z.object({ ...learningContentFields, learnerId: id, expectedSubmissionId: id, decision: z.enum(['PASSED','RETURNED']), reason: z.string().trim().min(1).max(4000) }).strict()
export const homeworkAssessmentSchema = z.object({ messageIds: z.array(id).min(1).max(20).refine(ids => new Set(ids).size === ids.length, 'message IDs must be unique') }).strict()
export const homeworkCriterionSchema = z.object({ criterion: z.string(), met: z.boolean(), independent: z.boolean(), feedback: z.string().max(2000) }).strict()
export const homeworkJudgmentSchema = z.object({
  criteria: z.array(homeworkCriterionSchema).min(1).max(20), completion: z.string().max(4000), assistance: z.string().max(4000),
  independence: z.string().max(4000), weaknesses: z.array(z.string().max(2000)).max(20),
  evidence: z.array(z.object({ messageId: id, excerpt: z.string().min(1).max(1000) }).strict()).max(20),
}).strict()
export type HomeworkDraft = z.input<typeof homeworkDraftSchema>
export type HomeworkAnswer = z.output<typeof homeworkAnswerSchema>
export type HomeworkJudgment = z.output<typeof homeworkJudgmentSchema>
export type HomeworkReport = Omit<HomeworkJudgment,'evidence'> & {
  id: string; answerRevision: number; homeworkRevision: number; answerHash: string; evidenceRevision: number; returnEpoch: number;
  evidenceHash: string; conversationSequence: number; verification?: 'verified'|'unverified'; coverage?: { messageCount:number; truncated:boolean };
  materialHashes: string[]; evidence: string[]; evidenceSources: Array<{messageId:string;excerpt:string}>;
  manualReview: { reason: string; remainingDoubts: string[] } | null
}
export type HomeworkMaterial = { source: string; hash: string; text: string; contentStatus?: 'unsupported'|'empty'|'failed'|'too_large' }
