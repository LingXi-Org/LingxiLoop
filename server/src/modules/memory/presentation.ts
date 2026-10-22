import { NoEffectError, type ActionContext, type PresentationDefinition, type createLingxiOS } from '@lyyzka/lingxios'
import { z } from 'zod'
import { memoryIdSchema } from '../../../../src/lib/memoryActivity.js'
import { authorizeAgent, nativeTool } from '../../agents/tools.js'
import { readMemoryChips } from './public.js'

export type MemoryPresentationControl = () => Promise<Pick<Awaited<ReturnType<typeof createLingxiOS>>, 'memory'>>
const inputSchema = z.object({ memoryId: memoryIdSchema }).strict()

async function readSummary(control: MemoryPresentationControl, context: ActionContext, reference: string) {
  context.signal.throwIfAborted()
  const id = memoryIdSchema.parse(reference), { work } = context
  if (!work.principalId) throw new NoEffectError('memory principal is unavailable', 'forbidden')
  const memory = (await control()).memory
  if (!memory) throw new NoEffectError('memory is unavailable', 'unavailable')
  const result = await readMemoryChips(memory, { tenantId: work.tenantId, agentId: work.agentId,
    principalId: work.principalId, sessionId: work.sessionId, workId: work.id,
    ...(work.threadId ? { threadId: work.threadId } : {}) }, [id])
  context.signal.throwIfAborted()
  if (result.chips.length !== 1 || result.chips[0].id !== id) throw new NoEffectError('memory summary is unavailable', 'not_found')
  return result
}

/** Exact-reference read; native scopes and audience checks remain authoritative. */
export function createMemorySummaryTool(control: MemoryPresentationControl) {
  return nativeTool('memory.summary', inputSchema, {
    description: 'Read the public summary of one exact memory ID already observed in this authorized conversation. Use only when the user explicitly requests this memory as a result; never guess IDs or enumerate memories. To present this result, select memory-summary with the same ID through presentation.render. This read does not modify memory.',
    effect: 'read', approval: false,
    async authorize(context, input) { await readSummary(control, context, input.memoryId) },
    async execute(context, input) { return { ok: true, value: await readSummary(control, context, input.memoryId) } },
  })
}

export function createMemorySummaryPresentation(control: MemoryPresentationControl): PresentationDefinition {
  const authorizedSummary = async (context: ActionContext, reference: string) => {
    // Check the declared product read action; the native presentation catalog
    // independently gates this same fixed action against current capability grants.
    await authorizeAgent({ ...context, action: { ...context.action, action: 'memory.summary' } })
    return readSummary(control, context, reference)
  }
  return {
    type: 'memory-summary', version: '1',
    description: 'A requested public memory summary, resolved from one exact authorized memory ID. No private body or scope is displayed.',
    actions: ['memory.summary'],
    async authorize(context, reference) { await authorizedSummary(context, reference) },
    async resolve(context, reference) {
      const fields = await authorizedSummary(context, reference), chip = fields.chips[0]
      return { fields, sources: [{ ref: `memory:${chip.id}`, version: String(chip.version), observedAt: new Date().toISOString() }] }
    },
  }
}
