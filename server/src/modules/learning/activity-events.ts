import type { AppendDomainEventInput, JsonObject } from '../events/public.js'

interface AssessmentAttemptSubmittedPayload extends JsonObject {
  attemptId: string
  activityId: string
  learnerId: string
  assistance: 'NONE' | 'HINT' | 'GUIDED'
}

export function assessmentAttemptSubmittedEvent(input: {
  companyId: string
  projectId: string
  attemptId: string
  activityId: string
  learnerId: string
  assistance: 'NONE' | 'HINT' | 'GUIDED'
}): AppendDomainEventInput<'ASSESSMENT.ATTEMPT_SUBMITTED', AssessmentAttemptSubmittedPayload> {
  return {
    companyId: input.companyId,
    projectId: input.projectId,
    aggregateType: 'ASSESSMENT_ATTEMPT',
    aggregateId: input.attemptId,
    idempotencyKey: `assessment-attempt:${input.attemptId}:submitted`,
    actor: { type: 'USER', id: input.learnerId },
    event: {
      eventType: 'ASSESSMENT.ATTEMPT_SUBMITTED',
      schemaVersion: 1,
      payload: {
        attemptId: input.attemptId,
        activityId: input.activityId,
        learnerId: input.learnerId,
        assistance: input.assistance,
      },
    },
  }
}
