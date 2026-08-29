export const CANVAS_ACTIVITY_KINDS = [
  'workspace_started', 'workspace_updated',
  'frame_created', 'frame_updated', 'frame_deleted',
  'comment_created', 'agent_status',
  'assignment_created', 'assignment_updated',
  'handoff', 'task_completed', 'task_failed', 'task_cancelled',
] as const

export type CanvasActivityKind = typeof CANVAS_ACTIVITY_KINDS[number]

const CANONICAL_ACTIVITY_KINDS = new Set<string>(CANVAS_ACTIVITY_KINDS)

/** Parse the immutable v1 Canvas activity contract without legacy aliases. */
export function parseCanvasActivityKind(action: string): CanvasActivityKind {
  if (!CANONICAL_ACTIVITY_KINDS.has(action)) {
    throw new Error(`unsupported Canvas activity kind: ${action}`)
  }
  return action as CanvasActivityKind
}
