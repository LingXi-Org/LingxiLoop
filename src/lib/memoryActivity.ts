import { z } from 'zod'
import { publicText } from './runActivity.js'

export const memoryIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/)
export const memoryActivitySchema = z.object({ chips: z.array(z.object({
  id: memoryIdSchema, text: publicText.pipe(z.string().max(1000)),
  change: z.enum(['added', 'updated', 'existing']), version: z.number().int().positive().safe(),
}).strict()).max(100) }).strict()
export type MemoryActivity = z.infer<typeof memoryActivitySchema>

const entrySchema = z.object({ id: memoryIdSchema, title: z.string(), description: z.string(),
  version: z.number().int().positive().safe(), status: z.literal('active') })

/** Only public fact summaries cross the boundary; bodies, sources and scope identities stay native. */
export function memoryActivity(action: string, value: unknown): MemoryActivity | undefined {
  if (!['memory.apply', 'memory.restore', 'memory.list', 'memory.read', 'memory.search', 'memory.history'].includes(action)) return undefined
  const result = value && typeof value === 'object' ? value : {}
  const entries = action === 'memory.read' ? [Reflect.get(result, 'document')]
    : Reflect.get(result, action === 'memory.apply' || action === 'memory.restore' ? 'documents' : 'items')
  const chips = new Map<string, MemoryActivity['chips'][number]>()
  if (Array.isArray(entries)) for (const item of entries.slice(0, 100)) {
    const parsed = entrySchema.safeParse(action === 'memory.history' && item && typeof item === 'object' ? Reflect.get(item, 'snapshot') : item)
    if (!parsed.success) continue
    const entry = parsed.data
    const chip = memoryActivitySchema.shape.chips.element.safeParse({ id: entry.id, text: entry.description || entry.title, version: entry.version,
      change: action === 'memory.apply' ? entry.version === 1 ? 'added' : 'updated' : action === 'memory.restore' ? 'updated' : 'existing' })
    if (chip.success && (!chips.has(entry.id) || chips.get(entry.id)!.version < entry.version)) chips.set(entry.id, chip.data)
  }
  return { chips: [...chips.values()] }
}
