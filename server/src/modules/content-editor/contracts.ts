import { z } from 'zod'

// Additive native state; plain text/Markdown remains available to existing readers,
// search, report generation and old clients. Never put editor JSON into LLM text.
export const contentDocumentSchema = z.object({
  format: z.literal('blocknote'), version: z.literal(1),
  projection: z.string().max(200000), sections: z.array(z.string().max(200000)).max(5000),
  blocks: z.array(z.record(z.string(), z.json())).min(1).max(5000),
  legacyMarkdown: z.string().max(200000).optional(),
}).strict().superRefine((value, ctx) => {
  if (JSON.stringify(value).length > 1000000) ctx.addIssue({ code: 'custom', message: 'editor document too large' })
  const types = new Set(['audio','bulletListItem','checkListItem','codeBlock','divider','file','heading','image','numberedListItem','paragraph','quote','table','toggleListItem','video','mathBlock','diagram'])
  const pending: { block: unknown; depth: number }[] = value.blocks.map(block => ({ block, depth: 0 }))
  const ids = new Set<string>()
  let count = 0
  while (pending.length) {
    const { block, depth } = pending.pop()!
    const item = block as Record<string, unknown> | null
    if (++count > 5000 || depth > 64 || !item || !types.has(String(item.type)) || !Array.isArray(item.children)) {
      ctx.addIssue({ code: 'custom', message: 'invalid native block structure' }); return
    }
    if (typeof item.id !== 'string' || !item.id || ids.has(item.id)) {
      ctx.addIssue({ code: 'custom', message: 'native block IDs must be unique' }); return
    }
    ids.add(item.id)
    const props = item.props as Record<string, unknown> | null
    if (!props || typeof props !== 'object' || Array.isArray(props)) {
      ctx.addIssue({ code: 'custom', message: 'invalid native block properties' }); return
    }
    if (['image','audio','video','file'].includes(String(item.type)) && props.url
      && (typeof props.url !== 'string' || !/^(https?:\/\/|\/api\/files\?)/i.test(props.url))) {
      ctx.addIssue({ code: 'custom', message: 'media must use a persisted HTTP or authorized file URL' }); return
    }
    pending.push(...item.children.map(block => ({ block, depth: depth + 1 })))
  }
})
export type ContentDocument = z.infer<typeof contentDocumentSchema>
export const optionalContentDocument = contentDocumentSchema.nullish()

export function documentFileUrls(document: ContentDocument | null | undefined): string[] {
  if (!document) return []
  const urls: string[] = []
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach(visit); return }
    const item = value as Record<string, unknown>
    if (['image','audio','video','file'].includes(String(item.type)) && item.props && typeof item.props === 'object') {
      const url = (item.props as Record<string, unknown>).url
      if (typeof url === 'string' && url) urls.push(url)
    }
    if (item.children) visit(item.children)
  }
  visit(document.blocks)
  return urls
}

export function matchesProjection(document: ContentDocument | null | undefined, text: string) {
  return !document || document.projection.trim() === text.trim()
}
