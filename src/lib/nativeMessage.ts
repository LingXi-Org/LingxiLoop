import type { CompleteAttachment, ThreadMessage } from '@assistant-ui/react'
import { z } from 'zod'

type Wire<T> = T extends Date ? string : T extends readonly (infer U)[] ? Wire<U>[] : T extends object ? { [K in keyof T]: Wire<T[K]> } : T
export type NativeMessage = Wire<ThreadMessage>
export type NativeAttachment = Omit<Wire<CompleteAttachment>, 'file'>
export const NATIVE_MESSAGE_CONTENT_TYPE = 1001
export const DATA_NAMES = ['poll', 'questionnaire', 'recommendation', 'handoff', 'canvas', 'learning-mission',
  'teacher-briefing', 'presentation-artifact', 'email', 'citation-claims', 'document-reference', 'tool-activity'] as const
const id = z.string().min(1).max(2000)
const json = z.json()
const object = z.record(z.string(), json)
const providerMetadata = z.record(z.string(), object).optional()
const parentId = id.optional()
const partStatus = z.discriminatedUnion('type', [z.object({ type: z.literal('running') }).strict(), z.object({ type: z.literal('complete') }).strict(),
  z.object({ type: z.literal('incomplete'), reason: z.enum(['cancelled','length','content-filter','other','error']), error: json.optional() }).strict()])
export const messageStatusSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('running') }).strict(),
  z.object({ type: z.literal('complete'), reason: z.enum(['stop','unknown']) }).strict(),
  z.object({ type: z.literal('requires-action'), reason: z.enum(['tool-calls','interrupt']) }).strict(),
  z.object({ type: z.literal('incomplete'), reason: z.enum(['cancelled','tool-calls','length','content-filter','other','error']), error: json.optional() }).strict(),
])
const safeUrl = z.string().max(2_000_000).refine(value => /^(https?:\/\/|\/api\/files\?|data:(?:image|audio|video)\/|data:application\/pdf;)/i.test(value), 'unsupported media URL')
const text = z.object({ type: z.literal('text'), text: z.string().max(1_000_000), status: partStatus.optional(), providerMetadata, parentId }).strict()
const image = z.object({ type: z.literal('image'), image: safeUrl, filename: z.string().max(1000).optional(), providerMetadata }).strict()
const file = z.object({ type: z.literal('file'), data: z.string().max(2_000_000), mimeType: z.string().min(1).max(200),
  filename: z.string().max(1000).optional(), sourceType: z.enum(['id','url']).optional(), providerMetadata, parentId }).strict().superRefine((part, ctx) => {
  if (part.sourceType === 'url' && !safeUrl.safeParse(part.data).success) ctx.addIssue({ code: 'custom', message: 'unsupported file URL' })
})
const data = z.object({ type: z.literal('data'), name: z.enum(DATA_NAMES), data: json }).strict()

// Persisted subset of react-generative-ui 0.0.16. Keep validation usable by the server without loading React.
const textSize = z.enum(['sm', 'md', 'lg', 'xl', '2xl', '3xl']).optional()
const gap = z.number().min(0).max(8).optional()
const align = z.enum(['start', 'center', 'end']).optional()
export const generativeComponentSchemas: Record<string, z.ZodType> = {
  Text: z.object({ value: z.string(), size: textSize, weight: z.enum(['normal', 'medium', 'semibold', 'bold']).optional(),
    color: z.enum(['emphasis', 'secondary', 'alpha-70', 'white', 'white-70', 'white-50']).optional() }).strict(),
  Markdown: z.object({ value: z.string() }).strict(),
  Header: z.object({ text: z.string(), size: textSize }).strict(),
  Caption: z.object({ value: z.string() }).strict(),
  Row: z.object({ gap, align, justify: z.enum(['start', 'center', 'end', 'between']).optional() }).strict(),
  Col: z.object({ gap, align }).strict(),
  Badge: z.object({ value: z.string(), variant: z.string().optional() }).strict(),
  Divider: z.object({ flush: z.boolean().optional() }).strict(),
  Spacer: z.object({}).strict(),
  Card: z.object({ title: z.string().optional(), padding: gap }).strict(),
  'calendar-event': z.object({ event: z.object({ id, title: z.string(), startAt: z.string(), endAt: z.string().nullable().optional(), allDay: z.boolean() }).strict() }).strict(),
  'learning-stats': z.object({ id, title: z.string(), description: z.string(), stats: z.array(z.object({ key: id, label: z.string(), value: z.number() }).strict()).max(100) }).strict(),
}
const node: z.ZodType<unknown> = z.lazy(() => z.union([z.string(), z.object({ component: z.string(), props: object.optional(), children: z.array(node).max(256).optional(), key: id.optional() }).strict()
  .superRefine((value, ctx) => {
    const schema = generativeComponentSchemas[value.component as keyof typeof generativeComponentSchemas]
    if (!schema || !schema.safeParse(value.props ?? {}).success) ctx.addIssue({ code: 'custom', message: 'unsupported component or properties' })
  })]))
const generative = z.object({ type: z.literal('generative-ui'), spec: z.object({ root: z.union([node, z.array(node).max(256)]) }).strict(), id: id.optional(), parentId }).strict()
const approval = z.object({ id, approved: z.boolean().optional(), reason: z.string().optional(), isAutomatic: z.boolean().optional(), optionId: id.optional(),
  resolution: z.enum(['cancelled','expired']).optional(), options: z.array(z.object({ id, kind: z.string(), label: z.string().optional(), description: z.string().optional(),
    grants: z.array(z.string()).optional(), confirm: z.union([z.boolean(), z.object({ title: z.string().optional(), description: z.string().optional() }).strict()]).optional() }).strict()).max(32).optional() }).strict()
const tool = z.object({ type: z.literal('tool-call'), toolCallId: id, toolName: id, args: object, argsText: z.string().max(1_000_000), result: json.optional(),
  isError: z.boolean().optional(), artifact: json.optional(), timing: z.object({ startedAt: z.number(), completedAt: z.number().optional() }).strict().optional(),
  mcp: z.object({ app: z.object({ resourceUri: z.string().startsWith('ui://'), mimeType: z.string().optional(), visibility: z.array(z.enum(['model','app'])).optional(), serverId: id.optional() }).strict().optional() }).strict().optional(),
  providerMetadata, modelContent: z.array(z.union([z.object({ type: z.literal('text'), text: z.string() }).strict(), z.object({ type: z.literal('file'), data: z.string(), mediaType: z.string(), filename: z.string().optional() }).strict()])).max(256).optional(), interrupt: z.object({ type: z.literal('human'), payload: json }).strict().optional(), approval: approval.optional(),
  parentId, messages: z.lazy(() => z.array(message).max(100)).optional(),
}).strict()
const userPart = z.union([text, image, file, data])
const assistantPart = z.union([text, image, file, data, generative, tool,
  z.object({ type: z.literal('reasoning'), text: z.string().max(1_000_000), status: partStatus.optional(), unstable_summary: z.string().optional(), providerMetadata, parentId }).strict(),
  z.object({ type: z.literal('source'), sourceType: z.literal('url'), id, url: z.url().refine(value => /^https?:\/\//i.test(value)), title: z.string().optional(), providerMetadata, parentId }).strict(),
  z.object({ type: z.literal('source'), sourceType: z.literal('document'), id, title: z.string(), mediaType: z.string(), filename: z.string().optional(), providerMetadata, parentId }).strict(),
])
export const nativeAttachmentSchema = z.object({ id, type: z.string(), name: z.string().max(1000), contentType: z.string().optional(),
  status: z.object({ type: z.literal('complete') }).strict(), content: z.array(userPart).min(1).max(20) }).strict()
const base = { id, createdAt: z.iso.datetime({ offset: true }) }
const custom = z.record(z.string(), json)
const user = z.object({ ...base, role: z.literal('user'), content: z.array(userPart).max(256), attachments: z.array(nativeAttachmentSchema).max(20),
  metadata: z.object({ custom, isOptimistic: z.boolean().optional() }).strict() }).strict().superRefine((value, ctx) => {
  if (new Set(value.attachments.map(item => item.id)).size !== value.attachments.length) ctx.addIssue({ code: 'custom', message: 'duplicate attachment identity' })
})
const message: z.ZodType<unknown> = z.lazy(() => z.union([user,
  z.object({ ...base, role: z.literal('system'), content: z.tuple([text]), metadata: z.object({ custom }).strict() }).strict(),
  z.object({ ...base, role: z.literal('assistant'), content: z.array(assistantPart).max(512), status: messageStatusSchema,
    metadata: z.object({ custom, unstable_state: json, unstable_annotations: z.array(json), unstable_data: z.array(json),
      steps: z.array(z.object({ messageId: z.string().optional(), usage: z.object({ inputTokens: z.number().nonnegative(), outputTokens: z.number().nonnegative() }).strict().optional() }).strict()).max(512),
      submittedFeedback: z.object({ type: z.enum(['positive','negative']) }).strict().optional(), isOptimistic: z.boolean().optional(),
      timing: z.object({ streamStartTime: z.number(), firstTokenTime: z.number().optional(), totalStreamTime: z.number().optional(), tokenCount: z.number().optional(),
        tokensPerSecond: z.number().optional(), totalChunks: z.number(), toolCallCount: z.number() }).strict().optional(),
    }).strict() }).strict(),
]))
const bounded = z.unknown().superRefine((value, ctx) => {
  const pending = [{ value, depth: 0 }]
  let count = 0
  while (pending.length) {
    const item = pending.pop()!
    if (++count > 50_000 || item.depth > 32) { ctx.addIssue({ code: 'custom', message: 'message exceeds structural limits' }); return }
    if (item.value && typeof item.value === 'object') {
      for (const value of Object.values(item.value)) pending.push({ value, depth: item.depth + 1 })
    }
  }
})
export const nativeMessageSchema = bounded.pipe(message) as z.ZodType<NativeMessage>
const humanCustom = z.object({ replyToClientMsgNo: id.optional(), mentionedIds: z.array(id).max(100).optional(), mentionAll: z.boolean().optional(),
  agentContinuation: z.object({ agentId: id, runId: id, requestVersion: z.number().int().positive().safe() }).strict().optional(),
  questionnaireReply: z.object({ questionId: id, answers: z.record(z.string(), z.union([z.string().max(4000), z.array(z.string().max(4000)).max(12)])) }).strict().optional(),
}).strict()
export const userMessageSchema = nativeMessageSchema.superRefine((value, ctx) => {
  if (value.role !== 'user' || !humanCustom.safeParse(value.metadata.custom).success || value.content.some(part => part.type === 'data')
    || !value.content.length && !value.attachments?.length) ctx.addIssue({ code: 'custom', message: 'invalid human message' })
})

export function serializeMessage(message: ThreadMessage): NativeMessage {
  return nativeMessageSchema.parse(JSON.parse(JSON.stringify(message, (key, value) => key === 'file' && typeof File !== 'undefined' && value instanceof File ? undefined : value)))
}
export function deserializeMessage(value: unknown): ThreadMessage {
  const parsed = nativeMessageSchema.parse(value)
  return { ...parsed, createdAt: new Date(parsed.createdAt), content: parsed.content.map(part => part.type === 'tool-call' && part.messages
    ? { ...part, messages: part.messages.map(deserializeMessage) } : part) } as ThreadMessage
}
export function createNativeMessage(input: { id: string; role: ThreadMessage['role']; content: ThreadMessage['content'] | NativeMessage['content'];
  createdAt?: string; custom?: Record<string, unknown>; attachments?: NativeAttachment[]; status?: ThreadMessage['status'] }): NativeMessage {
  return nativeMessageSchema.parse(JSON.parse(JSON.stringify({ id: input.id, role: input.role, content: input.content, createdAt: input.createdAt ?? new Date().toISOString(),
    ...(input.role === 'user' ? { attachments: input.attachments ?? [] } : {}),
    ...(input.role === 'assistant' ? { status: input.status ?? { type: 'complete', reason: 'stop' } } : {}),
    metadata: { ...(input.role === 'assistant' ? { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [] } : {}), custom: input.custom ?? {} } })))
}
export function nativeText(message: Pick<NativeMessage, 'content'>): string {
  return message.content.filter(part => part.type === 'text').map(part => part.text).join('\n')
}
export function nativeData<T = Record<string, unknown>>(message: Pick<NativeMessage, 'content'>, name: string): T | undefined {
  const part = message.content.find(part => part.type === 'data' && part.name === name)
  return part?.type === 'data' ? part.data as T : undefined
}
export function nativeAttachments(message: NativeMessage): NativeAttachment[] { return message.role === 'user' ? message.attachments : [] }
