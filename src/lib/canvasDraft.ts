export interface CanvasDraftSyncState {
  currentFrameId: string | null
  nextFrameId: string | null
  focused: boolean
  dirty: boolean
}

/**
 * A frame selection change always replaces the Inspector draft. Revisions for
 * the selected frame only do so once the human has left the editor and any
 * pending local save has completed.
 */
export function shouldSyncCanvasDraft(state: CanvasDraftSyncState): boolean {
  return state.currentFrameId !== state.nextFrameId || (!state.focused && !state.dirty)
}
