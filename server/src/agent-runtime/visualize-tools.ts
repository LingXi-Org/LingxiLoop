import { z } from 'zod'
import { createHash } from 'node:crypto'
import type { ActionContext, RunVerificationContext, ToolDefinition, VerificationRecord } from '@lyyzka/lingxios'
import { nativeTool, authorizeAudienceRead, compareResource } from '../agents/tools.js'
import { productConversationId } from './identity.js'
import { readAuthorizedVisualizeDocument, saveVisualizeDocument } from '../im/visualize.js'
import { readVisualizeReference } from './visualize-skill.js'
import { renderVisualizeStandalone } from './visualize-export.js'
import { visualizeReferences } from './visualize-projection.js'
import { projectGenUiReferences } from '../../../src/features/chat/visualize/zcode/gen-ui/domain/references.js'
import type { Queryable } from '../db/queryable.js'

const name = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100)
const path = z.string().min(1).max(4096)
const scope = (context: Pick<ActionContext, 'work'>) => ({ companyId: context.work.tenantId,
  channelId: productConversationId(context.work), userId: context.work.principalId! })
async function authorize(context: Pick<ActionContext, 'work' | 'database'>) {
  await authorizeAudienceRead(context, { action: 'conversation:read', resource: { type: 'conversation', id: productConversationId(context.work) } })
}
export const visualizeTools: ToolDefinition[] = [
  nativeTool('visualize.read_reference', z.object({ path: z.string().max(200) }).strict(), {
    description: 'Read a complete unchanged visualize skill reference by its skill-relative path, e.g. SKILL.md, references/api.md, references/styles.md, tweak.md, widgets/calendar.md or examples/calendar.html. No arbitrary filesystem access.',
    effect: 'read', approval: false, authorize,
    async execute(_context, input) { return { ok: true, value: { path: input.path, text: await readVisualizeReference(input.path), complete: true } } },
  }),
  nativeTool('visualize.save', z.object({ name, html: z.string().min(1).max(5_000_000) }).strict(), {
    description: 'Save a complete literal HTML fragment for a useful inline comparison, relationship, process, trend or interactive explanation; no explicit visualization request is required. Load the visualize skill first. name is lowercase-hyphenated without .html. Returns the actual authorized absolute path for a final ::visualize JSON reference; read back with visualize.read. Never send a full HTML document or unfinished script.',
    effect: 'transaction', approval: false, authorize,
    async execute(context, input) {
      const document = await saveVisualizeDocument({ ...scope(context), runId: context.work.id, agentId: context.work.agentId,
        name: input.name, html: input.html, database: context.database as Queryable })
      return { ok: true, value: { path: document.path, bytes: Buffer.byteLength(document.html), sourceHash: createHash('sha256').update(document.html).digest('hex') } }
    },
    async verify(context, input, value) {
      await authorize(context)
      const saved = z.object({ path }).passthrough().parse(value)
      const document = await readAuthorizedVisualizeDocument({ ...scope(context), path: saved.path })
      const hash = (html: string) => createHash('sha256').update(html).digest('hex')
      return compareResource(`visualize:${saved.path}`, { sha256: hash(input.html) }, { sha256: hash(document.html) })
    },
  }),
  nativeTool('visualize.read', z.object({ path }).strict(), {
    description: 'Read back a saved visualization fragment in the current authorized conversation. Use its actual returned path for edits and exports.',
    effect: 'read', approval: false, authorize,
    async execute(context, input) { return { ok: true, value: await readAuthorizedVisualizeDocument({ ...scope(context), path: input.path }) } },
  }),
  nativeTool('visualize.export', z.object({ path, name }).strict(), {
    description: 'When the user explicitly asks to export an existing visualization, execute the original render.py and create a downloadable standalone HTML artifact. The upstream exporter requires the source fragment under 1 MB (inline hosting supports up to 5 MB); simplify larger sources first. Replace host-only follow-up/openExternal interactions in the editable fragment first; widgetState/setWidgetState remain supported offline.',
    effect: 'read', approval: false, authorize,
    async execute(context, input) {
      const document = await readAuthorizedVisualizeDocument({ ...scope(context), path: input.path })
      const bytes = await renderVisualizeStandalone(document.html, input.name, context.signal)
      await authorize(context)
      const artifact = await context.createArtifact({ path: `visualize/${input.name}.html`, mime: 'text/html', bytes })
      return { ok: true, value: { path: artifact.path, size: artifact.size }, artifacts: [artifact] }
    },
  }),
]

/** Product verifier uses the native repair budget and cannot authorize a new file. */
export async function verifyVisualizeCandidate(context: RunVerificationContext): Promise<VerificationRecord[]> {
  const parts = projectGenUiReferences(context.candidate.body, true)
  if (!parts.some(part => part.kind !== 'text')) return []
  const checker = 'product:visualize'
  if (parts.some(part => part.kind === 'invalid' || part.kind === 'pending')) return [{ checker, status: 'failed',
    evidence: { hint: 'Use a complete ::visualize JSON reference with the absolute path returned by visualize.save.' } }]
  await authorize(context)
  for (const { reference } of visualizeReferences(context.candidate.body)) {
    context.signal.throwIfAborted()
    try { await readAuthorizedVisualizeDocument({ ...scope(context), path: reference.path }) }
    catch { return [{ checker, status: 'failed', evidence: { hint: 'The visualization path is unavailable in this conversation. Save and read back the fragment with visualize.save and visualize.read; reference only the returned path.' } }] }
  }
  return [{ checker, status: 'passed', evidence: { references: visualizeReferences(context.candidate.body).length } }]
}
