export const CANVAS_ACTIVITY_KINDS = [
  'workspace_started', 'workspace_updated',
  'frame_created', 'frame_updated', 'frame_deleted',
  'comment_created', 'agent_status',
  'assignment_created', 'assignment_updated',
  'handoff', 'task_completed', 'task_failed', 'task_cancelled',
] as const

export type CanvasActivityKind = typeof CANVAS_ACTIVITY_KINDS[number]

const CANONICAL_ACTIVITY_KINDS = new Set<string>(CANVAS_ACTIVITY_KINDS)
const LEGACY_ACTIVITY_KIND: Record<string, CanvasActivityKind> = {
  'frame.created': 'frame_created',
  'frame.updated': 'frame_updated',
  'frame.content_appended': 'frame_updated',
  'frame.deleted': 'frame_deleted',
  'comment.created': 'comment_created',
  'agent.status': 'agent_status',
  'agent.steered': 'assignment_updated',
  'assignment.created': 'assignment_created',
  'assignment.restarted': 'assignment_updated',
  'assignment.steered': 'assignment_updated',
  'assignment.completed': 'task_completed',
  'assignment.failed': 'task_failed',
  'assignment.cancelled': 'task_cancelled',
}

export function normalizeCanvasActivityKind(action: string): CanvasActivityKind {
  const normalized = LEGACY_ACTIVITY_KIND[action] ?? action
  return CANONICAL_ACTIVITY_KINDS.has(normalized)
    ? normalized as CanvasActivityKind
    : 'workspace_updated'
}
