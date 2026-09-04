import type { AttentionRuleSet } from './contracts.js'

export const TEACHER_ATTENTION_RULES_V1 = {
  version: 'teacher-attention.v1',
  rules: {
    CASE_DETECTED: { expectedMinutes: 30, rankScore: 100 },
    CASE_ESCALATED: { expectedMinutes: 15, rankScore: 200 },
  },
} as const satisfies AttentionRuleSet
