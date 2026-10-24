import { z } from 'zod'

// Read only the existing judgment fields needed to choose a help default.
const helpJudgmentSchema = z.object({
  criteria: z.array(z.object({ criterion: z.string(), met: z.boolean() })).min(1).max(20),
  evidence: z.array(z.object({ messageId: z.string().min(1), excerpt: z.string().min(1) })).min(1).max(20),
})

export interface HelpAssessment {
  id: string; evidenceRevision: number; returnEpoch: number; status: string; available: boolean
  selectedMessageIds: string[]; result: unknown
  messages: Array<{ messageId: string; role: string; text: string; sequence: number }>
}
export interface HomeworkHelpPlan {
  defaultDepth: 'brief_clue' | 'explanation'
  basis: 'unknown' | 'assessed_gap' | 'repeated_assessed_gap' | 'no_assessed_gap'
  criterionIndex: number | null
  observedAssessments: 0 | 1 | 2
}

/** A help default, never a score, submission gate or new learning judgment. */
export function homeworkHelpPlan(input: {
  criteria: string[]; assessmentId: string | null; evidenceRevision: number; returnEpoch: number; assessments: HelpAssessment[]
}): HomeworkHelpPlan {
  const unknown: HomeworkHelpPlan = { defaultDepth: 'brief_clue', basis: 'unknown', criterionIndex: null, observedAssessments: 0 }
  const read = (item: HelpAssessment) => {
    if (item.status !== 'READY' || !item.available || item.returnEpoch !== input.returnEpoch
      || item.messages.some(message => !Number.isSafeInteger(message.sequence) || message.sequence < 1)) return null
    const parsed = helpJudgmentSchema.safeParse(item.result)
    if (!parsed.success || parsed.data.criteria.length !== input.criteria.length
      || input.criteria.some(criterion => parsed.data.criteria.filter(value => value.criterion === criterion).length !== 1)) return null
    const quotes = parsed.data.evidence.map(quote => item.messages.find(message => message.messageId === quote.messageId
      && message.role === 'user' && Number.isSafeInteger(message.sequence) && message.sequence > 0 && message.text.includes(quote.excerpt)))
    if (!quotes.length || quotes.some(quote => !quote)) return null
    const selected = quotes.filter(quote => item.selectedMessageIds.includes(quote!.messageId))
    if (!selected.length) return null
    return { criteria: parsed.data.criteria, quotes: selected.map(quote => quote!),
      snapshotIds: new Set(item.messages.map(message => message.messageId)), snapshotEnd: Math.max(...item.messages.map(message => message.sequence)) }
  }
  const currentRow = input.assessments.find(item => item.id === input.assessmentId && item.evidenceRevision === input.evidenceRevision)
  const current = currentRow && read(currentRow)
  if (!current) return unknown
  const gaps = input.criteria.map((criterion, index) => current.criteria.find(item => item.criterion === criterion)!.met ? -1 : index).filter(index => index >= 0)
  if (!gaps.length) return { ...unknown, basis: 'no_assessed_gap', observedAssessments: 1 }
  const previousRow = input.assessments.filter(item => item.id !== currentRow!.id && item.evidenceRevision < currentRow!.evidenceRevision)
    .sort((a, b) => b.evidenceRevision - a.evidenceRevision)[0]
  const previous = previousRow && read(previousRow)
  const hasNewWork = previous && current.quotes.some(quote => !previous.snapshotIds.has(quote.messageId) && quote.sequence > previous.snapshotEnd)
  const repeated = hasNewWork ? gaps.find(index => previous!.criteria.some(item => item.criterion === input.criteria[index] && !item.met)) : undefined
  return repeated !== undefined
    ? { defaultDepth: 'explanation', basis: 'repeated_assessed_gap', criterionIndex: repeated, observedAssessments: 2 }
    : { defaultDepth: 'brief_clue', basis: 'assessed_gap', criterionIndex: gaps[0]!, observedAssessments: 1 }
}

export function homeworkHelpRules(plan: HomeworkHelpPlan | null | undefined): string {
  if (!plan) return ''
  return 'Keep help within the frozen teacher requirements and current feedback, and honor the learner’s requested help style. '
    + (plan.defaultDepth === 'explanation'
      ? 'The default is an explanation of the recurring open criterion. '
      : 'The default for hints or checking is one brief clue about the learner’s actual attempt. ')
    + 'For a requested explanation, connect the principle to an analogous example. Finish with one independent next step for the learner. '
}
