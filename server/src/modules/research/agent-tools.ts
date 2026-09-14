import { productConversationId } from '../../agent-runtime/identity.js'
import { z } from 'zod'
import type { ActionContext, ToolDefinition } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import { nativeTool } from '../../agents/tools.js'
import { createPermissionService } from '../access/public.js'
import { readResearch, searchResearch } from './index.js'
import { researchUrl } from './address.js'

export const researchSchemas = {
  search: z.object({ query: z.string().trim().min(1).max(2000), limit: z.number().int().min(1).max(20).default(8) }).strict(),
  read: z.object({ url: z.string().min(1).max(2048).refine(value => { try { researchUrl(value); return true } catch { return false } }, 'research URL is blocked or invalid') }).strict(),
}
async function authorize(context: ActionContext) {
  await createPermissionService(context.database as Queryable).assertCan({ actorUserId: context.work.principalId!, companyId: context.work.tenantId,
    action: 'agent:read', resource: { type: 'conversation', id: productConversationId(context.work) } })
}
export const researchTools: ToolDefinition[] = [
  nativeTool('research.search', researchSchemas.search, { description: 'Search OpenAlex for public research sources.', effect: 'read', approval: false, authorize,
    async execute(context, input) { return { ok: true, value: await searchResearch(input.query, input.limit, context.signal) } } }),
  nativeTool('research.read', researchSchemas.read, { description: 'Read a public source with DNS, redirect, byte and time limits.', effect: 'read', approval: false, authorize,
    async execute(context, input) { return { ok: true, value: await readResearch(input.url, context.signal) } } }),
]
