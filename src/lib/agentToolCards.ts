import { z } from 'zod'
const event = z.object({ id: z.string().max(500), title: z.string().max(500), startAt: z.string().datetime({ offset: true }), endAt: z.string().datetime({ offset: true }).nullable().optional(), allDay: z.boolean() })
const evaluation = z.object({ evaluationId: z.string().max(500), status: z.enum(['ACCEPTED','PENDING','REJECTED']), display: z.object({ demonstratedLevel: z.number().min(0).max(4),
  rubricResults: z.array(z.object({ label: z.string().max(500), score: z.number().min(0).max(4), weight: z.number().positive(), note: z.string().max(4000).optional() })).min(1).max(100) }) })
export const CARD_RESULT_ACTIONS = ['calendar.get', 'calendar.list', 'learning.propose_evaluation'] as const
/** Explicit public fields only; strips mail, private notes and unrelated provider data. */
export function toolCardResult(action: string, value: unknown): unknown {
  const schema = action === 'calendar.get' ? event : action === 'calendar.list' ? z.object({ events: z.array(event).max(100), truncated: z.boolean() })
    : action === 'learning.propose_evaluation' ? evaluation : undefined
  const result = schema?.safeParse(action === 'learning.propose_evaluation' && value && typeof value === 'object' ? Reflect.get(value, 'result') : value)
  return result?.success ? result.data : undefined
}
