export const LEARNING_CASE_STATUSES = [
  'DETECTED',
  'IN_PROGRESS',
  'ESCALATED',
  'RESOLVED',
  'CLOSED',
] as const

export type LearningCaseStatus = typeof LEARNING_CASE_STATUSES[number]

export const LEARNING_CASE_ACTION_KINDS = [
  'DIAGNOSE',
  'INTERVENE',
  'REASSESS',
  'ESCALATE',
  'OVERRIDE',
  'CLOSE',
] as const

export type LearningCaseActionKind = typeof LEARNING_CASE_ACTION_KINDS[number]

export type LearningCaseTransition =
  | { outcome: 'APPLIED'; from: LearningCaseStatus; to: LearningCaseStatus }
  | { outcome: 'ALREADY_APPLIED'; from: LearningCaseStatus; to: LearningCaseStatus }
  | { outcome: 'INVALID'; from: LearningCaseStatus; to: null }

export function transitionLearningCase(
  status: LearningCaseStatus,
  actionKind: LearningCaseActionKind,
): LearningCaseTransition {
  switch (actionKind) {
    case 'DIAGNOSE':
      if (status === 'DETECTED') {
        return { outcome: 'APPLIED', from: status, to: 'IN_PROGRESS' }
      }
      if (status === 'IN_PROGRESS') {
        return { outcome: 'ALREADY_APPLIED', from: status, to: status }
      }
      return { outcome: 'INVALID', from: status, to: null }
    case 'INTERVENE':
      if (status === 'IN_PROGRESS' || status === 'ESCALATED') {
        return { outcome: 'APPLIED', from: status, to: status }
      }
      return { outcome: 'INVALID', from: status, to: null }
    case 'REASSESS':
      if (status === 'IN_PROGRESS' || status === 'ESCALATED') {
        return { outcome: 'APPLIED', from: status, to: 'RESOLVED' }
      }
      return { outcome: 'INVALID', from: status, to: null }
    case 'ESCALATE':
      if (status === 'DETECTED' || status === 'IN_PROGRESS') {
        return { outcome: 'APPLIED', from: status, to: 'ESCALATED' }
      }
      if (status === 'ESCALATED') {
        return { outcome: 'ALREADY_APPLIED', from: status, to: status }
      }
      return { outcome: 'INVALID', from: status, to: null }
    case 'OVERRIDE':
      if (status === 'DETECTED' || status === 'IN_PROGRESS' || status === 'ESCALATED') {
        return { outcome: 'APPLIED', from: status, to: 'RESOLVED' }
      }
      return { outcome: 'INVALID', from: status, to: null }
    case 'CLOSE':
      if (status === 'RESOLVED') {
        return { outcome: 'APPLIED', from: status, to: 'CLOSED' }
      }
      if (status === 'CLOSED') {
        return { outcome: 'ALREADY_APPLIED', from: status, to: status }
      }
      return { outcome: 'INVALID', from: status, to: null }
  }
}
