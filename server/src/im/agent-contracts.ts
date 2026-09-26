import { z } from 'zod'

const id = z.string().trim().min(1).max(2000)
const text = (max: number) => z.string().trim().min(1).max(max)
const choice = z.object({ value: text(120), label: text(500), description: text(500).optional(), disabled: z.boolean().optional() }).strict()
const question = z.object({ name: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/).optional(), prompt: text(500), description: text(1000).optional(),
  required: z.boolean().optional(), multiple: z.boolean().optional(), choices: z.array(choice).max(12).default([]),
  input: z.object({ label: text(120), placeholder: text(160).optional() }).strict().optional(),
}).strict().refine(item => (!!item.choices.length || !!item.input) && new Set(item.choices.map(choice => choice.value)).size === item.choices.length,
  'question requires unique choices or freeform input')

export const agentMessageSchemas = {
  recommend: z.object({ title: text(160), explanation: text(4000), nextStep: text(500) }).strict(),
  history: z.object({ limit: z.number().int().min(1).max(100).default(50), beforeSequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0) }).strict(),
  inbox: z.object({ limit: z.number().int().min(1).max(50).default(50) }).strict(),
  search: z.object({ query: text(200), limit: z.number().int().min(1).max(50).default(10) }).strict(),
  ack: z.object({}).strict(),
  react: z.object({ messageId: id, emoji: text(64) }).strict(),
  send: z.object({ body: text(64_000), replyToClientMsgNo: id.optional() }).strict(),
  ask: z.object({ title: text(160).default('Agent 提问'), items: z.array(question).min(1).max(8).refine(items =>
    new Set(items.map((item, index) => item.name ?? `question_${index + 1}`)).size === items.length, 'question names must be unique'), submitLabel: text(80).optional() }).strict(),
}
