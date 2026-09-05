import { isDeepStrictEqual } from 'node:util'
import type { Grade, Grader } from './contracts.js'

export function deterministicGrade(grader: Exclude<Grader, { kind: 'factuality' }>, output: string, expected: string): Grade {
  let score = 0
  switch (grader.kind) {
    case 'exact': score = Number(output === expected); break
    case 'contains': score = Number(output.includes(grader.value)); break
    case 'json':
      try { score = Number(isDeepStrictEqual(JSON.parse(output), JSON.parse(expected))) } catch { score = 0 }
      break
  }
  return { id: grader.id, score, passed: score >= grader.threshold, ...(score < grader.threshold ? { reason: 'expectation_mismatch' } : {}) }
}
