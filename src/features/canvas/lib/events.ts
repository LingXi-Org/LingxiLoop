import type { CanvasActivity } from '@/features/canvas/contracts'

/** REST history and WebSocket events share this reducer. Stable ids make the
 * reconnect overlap harmless, and newest-first sorting keeps late packets from
 * moving the activity timeline backwards. */
export function mergeCanvasActivities(
  current: CanvasActivity[],
  incoming: CanvasActivity[],
  limit = 100,
): CanvasActivity[] {
  const byId = new Map<string, CanvasActivity>()
  for (const activity of [...current, ...incoming]) {
    if (!byId.has(activity.id)) byId.set(activity.id, activity)
  }
  return [...byId.values()]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, limit)
}
