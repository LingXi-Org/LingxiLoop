import type { ForumAttachment } from '../forum/contracts'

export interface HomeworkAnswer { text: string; links: string[]; attachments: ForumAttachment[] }
export interface HomeworkCriterion { criterion: string; met: boolean; independent: boolean; feedback: string }
export interface Homework {
  id: string
  courseId: string
  title: string
  instructions: string
  criteria: string[]
  links: string[]
  attachments: ForumAttachment[]
  dueAt: string | null
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED'
  revision: number
  visibleHash: string
  createdBy: string
  validation: { status: 'PENDING' | 'READY' | 'INVALID'; revision: number | null; feedback: string }
  canPublish: boolean
  canEditDraft: boolean
}
export type HomeworkFields = Pick<Homework, 'title' | 'instructions' | 'criteria' | 'links' | 'attachments' | 'dueAt'>
export interface HomeworkReport {
  id: string
  answerRevision: number
  completion: string
  criteria: HomeworkCriterion[]
  assistance: string
  independence: string
  weaknesses: string[]
  evidence: string[]
  manualReview: { reason: string; remainingDoubts: string[] } | null
}
export interface HomeworkSubmission {
  id: string
  learnerId: string
  learnerName: string
  version: number
  answer: HomeworkAnswer
  report: HomeworkReport
  submittedAt: string
  late: boolean
  reviewStatus: 'PENDING' | 'PASSED' | 'RETURNED'
  feedback: string
}
export type HomeworkLearnerStatus = 'NOT_STARTED' | 'LEARNING' | 'MASTERED' | 'PENDING' | 'PASSED' | 'RETURNED'
export interface HomeworkStudent {
  channelId: string | null
  answer: HomeworkAnswer
  answerRevision: number
  evidenceRevision: number
  status: HomeworkLearnerStatus
  unlocked: boolean
  canSubmit: boolean
  criteria: HomeworkCriterion[]
  report: HomeworkReport | null
  reportStatus: 'NONE' | 'PENDING' | 'READY' | 'INVALID'
  reportFeedback: string
  latestSubmission: HomeworkSubmission | null
  feedback: string
  manualReviewPreview: string[]
  manualReview: { evidence: string[]; sharedAt: string } | null
}
export interface HomeworkDetail { homework: Homework; student: HomeworkStudent | null; teacher: boolean }
export interface HomeworkLearner {
  learnerId: string
  learnerName: string
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
