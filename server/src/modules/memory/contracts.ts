import { z } from 'zod'
import type { MemoryApplyInput, MemoryContent, MemoryRestoreInput } from '@lyyzka/lingxios'

const id = z.string().trim().min(1).max(1000)
const version = z.number().int().positive().safe()
const scope = z.object({ tenantId: id, scopeType: id, scopeId: id }).strict()
const content = z.object({ path: id, title: z.string().trim().min(1).max(200), description: z.string().trim().min(1).max(500),
  body: z.string().min(1).max(64 * 1024), layer: z.enum(['core','reference']), kind: z.string().max(32).optional(),
  locked: z.boolean().optional(), validUntil: z.string().datetime({ offset: true }).nullable().optional(),
}).strict() satisfies z.ZodType<MemoryContent>
const versioned = { id, expectedVersion: version }
const changes = z.array(z.discriminatedUnion('action',[
  z.object({ action: z.literal('create'), content }).strict(),
  z.object({ action: z.literal('update'), ...versioned, content }).strict(),
  z.object({ action: z.literal('move'), ...versioned, path: id }).strict(),
  z.object({ action: z.literal('expire'), ...versioned }).strict(),
  z.object({ action: z.literal('delete'), ...versioned }).strict(),
  z.object({ action: z.literal('merge'), ...versioned, content, from: z.array(z.object(versioned).strict()).min(1).max(12) }).strict(),
])).min(1).max(12)
export const memoryIdentityQuery = z.object({ threadId: id.optional() }).strict()
export const memoryScopeQuery = memoryIdentityQuery.extend({ scopeType: id, scopeId: id })
export const memoryListQuery = memoryScopeQuery.extend({ prefix: id.optional(), layer: z.enum(['core','reference']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(), cursor: id.optional(),
  includeInactive: z.enum(['true','false']).transform(value=>value==='true').optional() })
export const memoryReadQuery = memoryScopeQuery.extend({ version: z.coerce.number().int().positive().safe().optional() })
export const memoryPageQuery = memoryScopeQuery.extend({ limit: z.coerce.number().int().min(1).max(100).optional(), cursor: id.optional() })
export const memorySearchQuery = memoryPageQuery.extend({ query: z.string().trim().min(1).max(4000), target: z.enum(['documents','history']).optional() })
const provenance = { idempotencyKey: id, sourceRef: id }
export const memoryApplySchema = z.object({ scope, changes, ...provenance }).strict() satisfies z.ZodType<MemoryApplyInput>
export const memoryRestoreSchema = z.object({ scope, ...versioned, version, ...provenance }).strict() satisfies z.ZodType<MemoryRestoreInput>
export const memoryScopeSchema = scope
export const memoryRollbackSchema = z.object({ scope,activeId: id,expectedVersion: version,targetId: id.nullable() }).strict()
