import { z } from 'zod'
const homeworkDraft = z.object({ result: z.object({ homeworkId: z.string().min(1).max(200), courseId: z.string().min(1).max(200), revision: z.number().int().min(1) }) })
export const CARD_RESULT_ACTIONS = ['teacher.draft_homework'] as const
/** Only public card locators cross the runtime transport. */
export function toolCardResult(action: string, value: unknown): unknown {
  if (action !== 'teacher.draft_homework') return undefined
  const result = homeworkDraft.safeParse(value)
  return result.success ? result.data : undefined
}
