import { z } from 'zod'

const webUrl = z.string().max(2048).refine(value => {
    try {
      const url = new URL(value)
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
    } catch { return false }
  })

const sourceSchema = z.object({
  title: z.string().trim().min(1).max(500),
  url: webUrl,
  image: webUrl.optional().catch(undefined),
  snippet: z.string().max(4000).optional(),
  source: z.string().max(80).optional(),
  sourceId: z.string().max(200).optional(),
  sourceVersion: z.string().max(200).optional(),
  page: z.number().int().positive().optional(),
  pageNumbers: z.array(z.number().int().positive()).max(20).optional(),
  chunkIds: z.array(z.string().max(200)).max(20).optional(),
})

export type ResearchSource = z.infer<typeof sourceSchema>

/** Keep only bounded card metadata, never query text or complete web pages. */
export function researchSources(value: unknown): ResearchSource[] | null {
  if (!value || typeof value !== 'object') return null
  const results: unknown = Reflect.get(value, 'results')
  if (!Array.isArray(results)) return null
  const sources = new Map<string, ResearchSource>()
  for (const result of results.slice(0, 20)) {
    const parsed = sourceSchema.safeParse(result)
    if (!parsed.success) continue
    const item = parsed.data, url = new URL(item.url)
    // A URL is not a source identity: versions, page fragments and distinct
    // excerpts may share it. Only the same bounded public record is a duplicate.
    const identity = JSON.stringify({ ...item, url: url.href })
    if (!sources.has(identity)) sources.set(identity, { ...item, url: url.href,
      title: item.title.slice(0, 160), ...(item.snippet === undefined ? {} : { snippet: item.snippet.slice(0, 300) }) })
  }
  return results.length && !sources.size ? null : [...sources.values()]
}
