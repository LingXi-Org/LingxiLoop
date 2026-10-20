import type { MemoryWritePolicy } from '@lyyzka/lingxios'

/** Product learning records, teacher feedback and assessments remain authoritative. */
export const memoryWritePolicy: MemoryWritePolicy = input => {
  if (input.origin==='synthesized' && (['mastery','learning_state','assessment'].includes(input.kind)
    || /(?:学生|学习者|用户).{0,24}(?:已掌握|已经掌握)|(?:student|learner|user).{0,24}(?:has mastered|mastered)/i.test(input.body))) {
    return {action:'reject',code:'learning_evidence_required'}
  }
  return {action:'allow'}
}
