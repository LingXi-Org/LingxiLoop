// Type declarations for the big-brain guard (scripts/guard-big-brain.mjs).
export interface BigBrainViolation {
  rel: string
  ln: number
  line: string
  why: string
}
/** Detection rules for one line of `rel`. Returns a reason per violation. */
export function lineViolations(rel: string, raw: string): string[]
/** Scan the configured source dirs; returns every ungated big-brain use. */
export function scanRepo(): BigBrainViolation[]
