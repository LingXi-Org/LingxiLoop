/** Only saved index fields are observable; no deck/malformed fields stay absent. */
export function slidesSummary(indexText: string | undefined): { title?: string; slideCount?: number } {
  if (!indexText) return {}
  try {
    const index = JSON.parse(indexText) as { title?: unknown; order?: unknown }
    if (!index || typeof index !== 'object' || Array.isArray(index)) return {}
    return {
      ...(typeof index.title === 'string' ? { title: index.title } : {}),
      ...(Array.isArray(index.order) && index.order.every(id => typeof id === 'string' && id.length > 0)
        && new Set(index.order).size === index.order.length ? { slideCount: index.order.length } : {}),
    }
  } catch { return {} }
}
