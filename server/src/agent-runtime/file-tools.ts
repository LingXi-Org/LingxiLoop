import { z } from 'zod'
import { NoEffectError, type ActionContext, type RequestAttachment } from '@lyyzka/lingxios'
import { nativeTool, authorizeAudienceRead, audienceHumanIds } from '../agents/tools.js'
import { productConversationId } from './identity.js'
import { unavailableAttachmentIds } from './attachments.js'
import type { Queryable } from '../db/queryable.js'

async function authorize(context: ActionContext) {
  await authorizeAudienceRead(context, { action: 'conversation:read', resource: { type: 'conversation', id: productConversationId(context.work) } })
}
async function attachments(context: ActionContext) {
  const request = await context.requestSnapshot()
  const items: RequestAttachment[] = [...request.attachments, ...[...(request.inheritedRevisions ?? []), ...request.revisions].flatMap(revision => revision.attachments ?? [])]
  const denied = await unavailableAttachmentIds(context.database as Queryable, context.work.tenantId, productConversationId(context.work), items.map(item => item.id), await audienceHumanIds(context))
  return items.filter(item => !denied.has(item.id))
}
export const fileTools = [
  nativeTool('files.list', z.object({}).strict(), { description: 'List authorized attachments selected for this request. Use files.read for bounded text; unavailable binary formats remain explicit.', effect: 'read', approval: false, authorize,
    async execute(context) { return { ok: true, value: (await attachments(context)).map(({ text: _text, ...item }) => item) } } }),
  nativeTool('files.read', z.object({ id: z.string().min(1).max(2000), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(16000).default(8000) }).strict(), {
    description: 'Read selected attachment text by character range. Continue at nextOffset; do not treat partial text as the whole file.', effect: 'read', approval: false, authorize,
    async execute(context, input) {
      const file = (await attachments(context)).find(item => item.id === input.id)
      if (!file) throw new NoEffectError('attachment is unavailable', 'not_found')
      if (file.text === undefined) return { ok: true, value: { id: file.id, status: file.contentStatus ?? 'unavailable' } }
      const text = file.text.slice(input.offset, input.offset + input.limit), nextOffset = input.offset + text.length
      return { ok: true, value: { id: file.id, sourceVersion: file.sourceVersion, text, truncated: nextOffset < file.text.length, nextOffset } }
    } }),
  nativeTool('files.create', z.object({ name: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}\.(txt|md|csv|json)$/), text: z.string().max(128000) }).strict(), {
    description: 'Create a downloadable UTF-8 text, Markdown, CSV or JSON artifact for this request. Returns the actual committed artifact; never invent a download link.', effect: 'read', approval: false, authorize,
    async execute(context, input) {
      if (input.name.endsWith('.json')) JSON.parse(input.text)
      const mime = input.name.endsWith('.json') ? 'application/json' : input.name.endsWith('.csv') ? 'text/csv' : input.name.endsWith('.md') ? 'text/markdown' : 'text/plain'
      const artifact = await context.createArtifact({ path: 'files/' + input.name, mime, bytes: Buffer.from(input.text) })
      return { ok: true, value: { path: artifact.path, size: artifact.size }, artifacts: [artifact] }
    } }),
]
