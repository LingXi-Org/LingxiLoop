import type { Queryable } from '../../db/queryable.js'
import { latestProjectEventSequence } from '../events/public.js'
import { TEACHER_BRIEFING_POLICY_V1 } from './policy.js'
import { recordMeaningfulProjectVisit } from './repository.js'

export async function recordProjectVisit(db: Queryable, args: {
  companyId: string; projectId: string; userId: string; briefingEligible: boolean
}): Promise<void> {
  const eventSequence = await latestProjectEventSequence(db, args)
  await recordMeaningfulProjectVisit(db, {
    ...args,
    briefingEligible: args.briefingEligible,
    eventSequence,
    policy: TEACHER_BRIEFING_POLICY_V1,
  })
}
