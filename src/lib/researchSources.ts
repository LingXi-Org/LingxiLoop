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
    url.hash = ''
    if (!sources.has(url.href)) sources.set(url.href, { ...item, url: url.href,
      title: item.title.slice(0, 160), ...(item.snippet === undefined ? {} : { snippet: item.snippet.slice(0, 300) }) })
  }
  return results.length && !sources.size ? null : [...sources.values()]
}
