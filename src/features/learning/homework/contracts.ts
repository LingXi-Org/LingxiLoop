import type { ContentDocument } from '@/features/content-editor'
import type { ConversationEvidence, ForumAttachment } from '../forum/contracts'

export interface HomeworkAnswer { text: string; editorDocument?: ContentDocument | null; links: string[]; attachments: ForumAttachment[] }
export interface HomeworkCriterion { reviewRequired?: boolean; criterion: string; met: boolean; independent: boolean; feedback: string }
export interface HomeworkValidationFinding {
  field: 'title' | 'instructions' | 'criteria'; severity: 'blocker' | 'suggestion' | 'teacher_review'
  excerpt: string; original: string; criterionIndex: number | null; reason: string; suggestion: string
  replacement?: string; observableEvidence?: string; teacherReview?: string; instructionChange?: string
}
export interface Homework {
  id: string
  courseId: string
  title: string
  instructions: string
  editorDocument?: ContentDocument | null
  criteriaDocument?: ContentDocument | null
  criteria: string[]
  links: string[]
  attachments: ForumAttachment[]
  dueAt: string | null
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED'
  revision: number
  visibleHash: string
  createdBy: string
  validation: { status: 'PENDING' | 'READY' | 'INVALID' | 'MATERIAL_ERROR' | 'ERROR'; revision: number | null; feedback: string; findings?: HomeworkValidationFinding[] }
  canPublish: boolean
  canEditDraft: boolean
}
export type HomeworkFields = Pick<Homework, 'title' | 'instructions' | 'editorDocument' | 'criteriaDocument' | 'criteria' | 'links' | 'attachments' | 'dueAt'>
export function canPublishHomeworkDraft(homework: Homework, dirty: boolean): boolean {
  return !dirty && homework.status === 'DRAFT' && homework.canPublish
    && homework.validation.status === 'READY' && homework.validation.revision === homework.revision
}
export interface HomeworkReport {
  id: string
  answerRevision: number
  verification?: 'verified' | 'unverified'
  completion: string
  criteria: HomeworkCriterion[]
  assistance: string
  independence: string
  weaknesses: string[]
  evidence: string[]
  evidenceSources?: Array<{ messageId: string; excerpt: string }>
  manualReview: { reason: string; remainingDoubts: string[] } | null
}
export interface HomeworkSubmission {
  conversationReferences:ConversationEvidence[]
  id: string
  learnerId: string
  learnerName: string; learnerAvatarUrl?: string | null
  version: number
  answer: HomeworkAnswer
  report: HomeworkReport
  submittedAt: string
  late: boolean
  reviewStatus: 'PENDING' | 'PASSED' | 'RETURNED'
  feedback: string
  feedbackDocument?: ContentDocument | null
  feedbackAttachments?: ForumAttachment[]
  feedbackLinks?: string[]
}
export type HomeworkLearnerStatus = 'NOT_STARTED' | 'LEARNING' | 'MASTERED' | 'PENDING' | 'PASSED' | 'RETURNED'
export interface HomeworkStudent {
  channelId: string | null
  answer: HomeworkAnswer
  answerRevision: number
  evidenceRevision: number
  status: HomeworkLearnerStatus
  hasLearningRecord: boolean
  unlocked: boolean
  canSubmit: boolean
  criteria: HomeworkCriterion[]
  report: HomeworkReport | null
  reportStatus: 'NONE' | 'PENDING' | 'READY' | 'INVALID'
  reportFeedback: string
  latestSubmission: HomeworkSubmission | null
  feedback: string
  feedbackDocument?: ContentDocument | null
  feedbackAttachments?: ForumAttachment[]
  feedbackLinks?: string[]
  manualReview: { evidence: string[]; sharedAt: string } | null
}
export interface HomeworkDetail { homework: Homework; student: HomeworkStudent | null; teacher: boolean }
export interface HomeworkLearner {
  learnerId: string
  learnerName: string; learnerAvatarUrl?: string | null
  status: HomeworkLearnerStatus
  missingCriteria: string[]
  evidenceRevision: number
  latestSubmission: HomeworkSubmission | null
  manualReview: { evidence: string[]; sharedAt: string } | null
}
export const homeworkStatus = {
  NOT_STARTED: '尚未开始', LEARNING: '学习中', MASTERED: '已掌握 · 未提交', PENDING: '待验收', PASSED: '已通过', RETURNED: '已退回',
} satisfies Record<HomeworkLearnerStatus, string>

export function localDeadline(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
