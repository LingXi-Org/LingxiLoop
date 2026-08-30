import type { BriefingPolicy } from './contracts.js'

export const TEACHER_BRIEFING_POLICY_V1 = {
  version: 'teacher-briefing.v1',
  meaningfulAfterMinutes: 30,
  maxAttentionItems: 50,
} as const satisfies BriefingPolicy
