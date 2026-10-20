import { z } from 'zod'
import { createHash } from 'node:crypto'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { NoEffectError, skillIndex } from '@lyyzka/lingxios'
import type { ActionContext, RunVerificationContext, ToolDefinition, VerificationRecord } from '@lyyzka/lingxios'
import { nativeTool, authorizeAudienceRead, compareResource } from '../agents/tools.js'
import { productConversationId } from './identity.js'
import { readAuthorizedVisualizeDocument, saveVisualizeDocument, validateVisualizeFragment } from '../im/visualize.js'
import { HttpError } from '../http/errors.js'
import { DiagramInputError, sequenceDiagramSchema, renderSequenceDiagram } from '../im/visualize-diagram.js'
import { NumericChartError, numericChartSchema, renderNumericChart } from '../im/visualize-numeric.js'
import { readVisualizeReference, visualizeSkill } from './visualize-skill.js'
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
async function activateAuthoring(context: ActionContext) {
  if (!context.activateSkillDelivery) throw new NoEffectError('skill delivery activation is unavailable')
  const { name,version,hash } = skillIndex(visualizeSkill)
  await context.activateSkillDelivery({ name,version,hash })
}
export const visualizeTools: ToolDefinition[] = [
  nativeTool('visualize.read_reference', z.object({ path: z.string().max(200) }).strict(), {
    description: 'Read a complete unchanged visualize skill reference by its skill-relative path, e.g. SKILL.md, references/api.md, references/styles.md, tweak.md, widgets/calendar.md or examples/calendar.html. No arbitrary filesystem access.',
    effect: 'read', approval: false, authorize,
    async execute(_context, input) { return { ok: true, value: { path: input.path, text: await readVisualizeReference(input.path), complete: true } } },
  }),
  nativeTool('visualize.save', z.object({ name, html: z.string().min(1).max(5_000_000) }).strict(), {
    description: 'Save a complete literal HTML fragment for a useful inline comparison, relationship, process, trend or interactive explanation; no explicit visualization request is required. Load the visualize skill first. Derive numeric labels and decisions from the same computed data as the plot; check branches, units and same-series differences against the original inputs. name is lowercase-hyphenated without .html. Returns the actual authorized absolute path for a final ::visualize JSON reference; read back with visualize.read and reconcile calculations, labels and final prose before delivery. Saving verifies storage, not numeric correctness. Never send a full HTML document or unfinished script.',
    effect: 'transaction', approval: false, authorize, semanticVersion: '2',
    async execute(context, input) {
      try { validateVisualizeFragment(input.name, input.html) }
      catch (error) {
        if (!(error instanceof HttpError) || error.status !== 400) throw error
        // Only this pure admission check is converted. Authorization/storage
        // failures retain their original native failure and reconciliation path.
        return { ok: false, code: 'invalid_arguments', executionState: 'no_effect',
          error: 'Expected a literal HTML fragment under 5 MB, not a full document. Remove <!doctype>, html, head and body wrappers; keep the complete style/script with the fragment. Use a lowercase-hyphenated name.' }
      }
      await activateAuthoring(context)
      const document = await saveVisualizeDocument({ ...scope(context), runId: context.work.id, agentId: context.work.agentId,
        name: input.name, html: input.html, requestVersion: context.requestVersion!, database: context.database as Queryable })
      return { ok: true, value: { path: document.path, bytes: Buffer.byteLength(document.html), sourceHash: createHash('sha256').update(document.html).digest('hex') } }
    },
    async verify(context, input, value) {
      await authorize(context)
      const saved = z.object({ path }).passthrough().parse(value)
      const document = await readAuthorizedVisualizeDocument({ ...scope(context), path: saved.path }, context.database as Queryable)
      const hash = (html: string) => createHash('sha256').update(html).digest('hex')
      return compareResource(`visualize:${saved.path}`, { sha256: hash(input.html) }, { sha256: hash(document.html) })
    },
  }),
  nativeTool('visualize.chart', z.object({ name, chart: numericChartSchema }).strict(), {
    description: 'Create and save a bounded static numeric chart from supplied data, without authoring HTML or expressions. Use linear for intercept+slope*x comparisons with an explicit lower/higher preference and common units; optional preferenceBands shades interval interiors using computed intersections (intervals must remain distinct at 0.001 SVG units and distinct functions must remain distinguishable at interval midpoints); use trend for ordered observations and optional differences between named base series. Plots, tables, intersections and decisions use the same unrounded calculations. Up to 6 base series, 60 periods or 12 comparison samples; unique labels and finite inputs within +/-1e12, computed magnitudes <=1e15. Percent changes need a positive previous value. Return the actual saved reference, read back with visualize.read, and use the returned calculations in prose. This does not establish that the supplied data or model interpretation is correct. Other visualizations can still use visualize.save.',
    effect: 'transaction', approval: false, authorize, semanticVersion: '2',
    async execute(context, input) {
      context.signal.throwIfAborted()
      let rendered: ReturnType<typeof renderNumericChart>
      try { rendered = renderNumericChart(input.chart, context.signal) }
      catch (error) {
        if (!(error instanceof NumericChartError) && !(error instanceof z.ZodError)) throw error
        return { ok: false, code: 'invalid_arguments', executionState: 'no_effect',
          error: 'Numeric chart requires distinct labels/samples, matching series lengths and existing base-series references. Check the domain, common units, finite inputs and computed magnitude bounds. No document was saved.' }
      }
      validateVisualizeFragment(input.name, rendered.html)
      context.signal.throwIfAborted()
      await activateAuthoring(context)
      const document = await saveVisualizeDocument({ ...scope(context), runId: context.work.id, agentId: context.work.agentId,
        name: input.name, html: rendered.html, requestVersion: context.requestVersion!, database: context.database as Queryable })
      return { ok: true, value: { path: document.path, reference: `::visualize${JSON.stringify({ path: document.path })}`,
        bytes: Buffer.byteLength(document.html), sourceHash: createHash('sha256').update(document.html).digest('hex'), summary: rendered.summary } }
    },
    async verify(context, input, value) {
      await authorize(context)
      const saved = z.object({ path }).passthrough().parse(value)
      const document = await readAuthorizedVisualizeDocument({ ...scope(context), path: saved.path }, context.database as Queryable)
      const expected = renderNumericChart(input.chart, context.signal).html
      const hash = (html: string) => createHash('sha256').update(html).digest('hex')
      return compareResource(`visualize:${saved.path}`, { sha256: hash(expected) }, { sha256: hash(document.html) })
    },
  }),
  nativeTool('visualize.diagram', z.object({ name, diagram: sequenceDiagramSchema }).strict(), {
    description: 'Create and save a bounded static vertical sequence diagram from 2–12 ordered nodes, without authoring HTML or pixel coordinates. Supply unique lowercase node IDs, labels and optional detail; optional edges must be the complete adjacent forward chain in node order. Node heights follow wrapped text in normal document flow; connectors occupy the gaps. Arbitrary graphs, branches, cycles and spatial layouts are unsupported: use a different suitable visualization or explain the limitation. Returns the actual saved reference. Read back with visualize.read; supplied meaning and order still require checking. Ordinary prose, code and visualize.save remain valid.',
    effect: 'transaction', approval: false, authorize, semanticVersion: '2',
    async execute(context, input) {
      context.signal.throwIfAborted()
      let rendered: ReturnType<typeof renderSequenceDiagram>
      try { rendered = renderSequenceDiagram(input.diagram, context.signal) }
      catch (error) {
        if (!(error instanceof DiagramInputError) && !(error instanceof z.ZodError)) throw error
        return { ok: false, code: 'invalid_arguments', executionState: 'no_effect',
          error: 'Sequence diagram requires 2–12 unique nodes and, if supplied, exactly the adjacent forward edges in node order. Do not supply pixel geometry. No document was saved.' }
      }
      validateVisualizeFragment(input.name, rendered.html)
      context.signal.throwIfAborted()
      await activateAuthoring(context)
      const document = await saveVisualizeDocument({ ...scope(context), runId: context.work.id, agentId: context.work.agentId,
        name: input.name, html: rendered.html, requestVersion: context.requestVersion!, database: context.database as Queryable })
      return { ok: true, value: { path: document.path, reference: `::visualize${JSON.stringify({ path: document.path })}`,
        bytes: Buffer.byteLength(document.html), sourceHash: createHash('sha256').update(document.html).digest('hex'), summary: rendered.summary } }
    },
    async verify(context, input, value) {
      await authorize(context)
      const saved = z.object({ path }).passthrough().parse(value)
      const document = await readAuthorizedVisualizeDocument({ ...scope(context), path: saved.path }, context.database as Queryable)
      const expected = renderSequenceDiagram(input.diagram, context.signal).html
      const hash = (html: string) => createHash('sha256').update(html).digest('hex')
      return compareResource(`visualize:${saved.path}`, { sha256: hash(expected) }, { sha256: hash(document.html) })
    },
  }),
  nativeTool('visualize.read', z.object({ path }).strict(), {
    description: 'Read back a saved visualization fragment in the current authorized conversation. Use its actual returned path for edits and exports.',
    effect: 'read', approval: false, authorize,
    async execute(context, input) { return { ok: true, value: await readAuthorizedVisualizeDocument({ ...scope(context), path: input.path }, context.database as Queryable) } },
  }),
  nativeTool('visualize.export', z.object({ path, name }).strict(), {
    description: 'When the user explicitly asks to export an existing visualization, execute the original render.py and create a downloadable standalone HTML artifact. The upstream exporter requires the source fragment under 1 MB (inline hosting supports up to 5 MB); simplify larger sources first. Replace host-only follow-up/openExternal interactions in the editable fragment first; widgetState/setWidgetState remain supported offline.',
    effect: 'read', approval: false, authorize,
    async execute(context, input) {
      const document = await readAuthorizedVisualizeDocument({ ...scope(context), path: input.path }, context.database as Queryable)
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
  const checker = 'product:visualize'
  if (!parts.some(part => part.kind !== 'text')) {
    // Code examples must stay inert. Ask native repair only when the entire
    // answer is one code-wrapped reference to this run's saved document. Saves
    // followed by exports, ordinary prose or an honest fallback remain valid.
    if (!context.candidate.body.includes('visualize')) return []
    const tree = fromMarkdown(context.candidate.body)
    const node = tree.children.length === 1 ? tree.children[0] : undefined
    const code = node?.type === 'code' ? node.value
      : node?.type === 'paragraph' && node.children.length === 1 && node.children[0].type === 'inlineCode' ? node.children[0].value : undefined
    if (!code) return []
    const inner = projectGenUiReferences(code, true).filter(part => part.kind !== 'text' || part.text.trim())
    if (inner.length !== 1 || inner[0].kind !== 'ui') return []
    const saved = await context.database.query(`SELECT 1 FROM im_visualize_documents
      WHERE company_id=$1 AND run_id=$2 AND agent_id=$3 AND created_by=$4 AND path=$5 LIMIT 1`,
    [context.work.tenantId, context.work.id, context.work.agentId, context.work.principalId, inner[0].reference.path])
    if (!saved.rows.length) return []
    await authorize(context)
    return [{ checker, status: 'failed', evidence: {
      hint: 'The final answer contains only a code-wrapped reference to the visualization saved by this run, so no chart will be displayed. Read back the saved fragment and put its literal ::visualize JSON reference on its own line outside any code fence or inline code.',
    } }]
  }
  if (parts.some(part => part.kind === 'invalid' || part.kind === 'pending')) return [{ checker, status: 'failed',
    evidence: { hint: 'Use a complete ::visualize JSON reference with the absolute path returned by visualize.save.' } }]
  await authorize(context)
  for (const { reference } of visualizeReferences(context.candidate.body)) {
    context.signal.throwIfAborted()
    try { await readAuthorizedVisualizeDocument({ ...scope(context), path: reference.path }, context.database as Queryable) }
    catch { return [{ checker, status: 'failed', evidence: { hint: 'The visualization path is unavailable in this conversation. Save and read back the fragment with visualize.save and visualize.read; reference only the returned path.' } }] }
  }
  return [{ checker, status: 'passed', evidence: { references: visualizeReferences(context.candidate.body).length } }]
}
