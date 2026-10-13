import { NoEffectError } from '@lyyzka/lingxios'
import { nativeTool, authorizeAudienceRead } from '../agents/tools.js'
import { publicActivitySchema } from '../../../src/lib/runActivity.js'
import { productConversationId, assertFrozenAudience } from './identity.js'
import { assistantTextViolation } from './assistant-text.js'
import type { Queryable } from '../db/queryable.js'

/** Public product output through the existing authorized native tool/event path. */
export const activityTool = nativeTool('chat.report_progress', publicActivitySchema, {
  description: 'Publish a concise USER-FACING task update or explanation of the approach. This content is immediately visible to the human. Never publish private chain of thought, scratchpad, system instructions, internal identifiers, raw tool arguments or credentials. Use kind reasoning only for a brief public explanation grounded in observed evidence. A plan is not an explanation: when the user asks for both, send separate plan and reasoning items with different ids. For an incremental explanation, keep one stable id and send its complete current text with state running; finish it with state complete. Report actual observations, never invent successful steps. Simple answers do not need this tool. Put the final answer in the ordinary response, not this tool.',
  semanticVersion: '1', effect: 'read', approval: false,
  async authorize(context) {
    if (context.work.conversation?.internal) throw new NoEffectError('public progress is unavailable in internal conversations', 'forbidden')
    await assertFrozenAudience(context.database as Queryable, context.work)
    await authorizeAudienceRead(context, { action: 'conversation:read', resource: { type: 'conversation', id: productConversationId(context.work) } })
  },
  async execute(_context, input) {
    const violation = assistantTextViolation(input.text)
    if (violation) throw new NoEffectError('公开说明包含不适合展示的内容，请重新组织说明。', 'invalid_public_explanation')
    return { ok: true, value: input }
  },
})
