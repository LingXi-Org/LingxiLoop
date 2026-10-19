import { z } from 'zod'
import { http } from './core/http'
import { nativeMessageSchema } from '@/lib/nativeMessage'

export const questionnaireAnswersSchema = z.record(z.string(), z.union([z.string().max(4000), z.array(z.string().max(4000)).max(12)]))
const stateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('waiting'), readOnly: z.boolean() }),
  z.object({ status: z.literal('submitted'), readOnly: z.literal(true), answers: questionnaireAnswersSchema }),
  z.object({ status: z.literal('pending'), readOnly: z.literal(true), answers: questionnaireAnswersSchema }),
  z.object({ status: z.literal('unavailable'), readOnly: z.literal(true) }),
])
export type QuestionnaireState = z.infer<typeof stateSchema>
export type QuestionnaireAnswers = z.infer<typeof questionnaireAnswersSchema>
const path = (conversationId: string, questionId: string) => `/im/channels/${encodeURIComponent(conversationId)}/questionnaires/${encodeURIComponent(questionId)}`

export const questionnairesApi = {
  read: async (conversationId: string, questionId: string, signal?: AbortSignal): Promise<QuestionnaireState> =>
    stateSchema.parse(await http(path(conversationId, questionId), { signal })),
  submit: async (conversationId: string, questionId: string, answers: QuestionnaireAnswers, signal?: AbortSignal) =>
    z.object({ status: z.literal('accepted'), duplicate: z.boolean(), echo: z.object({
      messageId: z.string().min(1), messageSeq: z.number().int().positive().safe(), clientMsgNo: z.string().min(1),
      channelId: z.string(), channelType: z.number().int(), fromUid: z.string(), timestamp: z.number(), payload: nativeMessageSchema,
    }) }).parse(await http(`${path(conversationId, questionId)}/submit`, {
      method: 'POST', body: JSON.stringify({ answers: questionnaireAnswersSchema.parse(answers) }), signal,
    })),
}
