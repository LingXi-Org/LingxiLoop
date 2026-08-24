import type { CanvasActivity, CanvasActivityKind } from '@/types'
import { normalizeCanvasActivityKind } from '@/lib/canvasEventKinds'

export function normalizeCanvasActivity(activity: CanvasActivity): CanvasActivity {
  const action: CanvasActivityKind = normalizeCanvasActivityKind(activity.action)
  return action === activity.action ? activity : { ...activity, action }
}

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
    const normalized = normalizeCanvasActivity(activity)
    if (!byId.has(normalized.id)) byId.set(normalized.id, normalized)
  }
  return [...byId.values()]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, limit)
}
