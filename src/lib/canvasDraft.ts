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

export type CanvasDraftPatch = Partial<Record<'title' | 'content', string>>

interface CanvasDraftSaveQueueOptions {
  delayMs?: number
  save: (frameId: string, patch: CanvasDraftPatch) => void | Promise<void>
  setTimer?: (callback: () => void, delayMs: number) => unknown
  clearTimer?: (timer: unknown) => void
}

interface PendingCanvasDraftSave {
  patch: CanvasDraftPatch
  timer: unknown
}

/**
 * Debounces saves per frame rather than per Inspector selection. Selecting a
 * different frame therefore cannot cancel the old frame's pending patch, and
 * the patch contains only fields the human actually changed.
 */
export function createCanvasDraftSaveQueue(options: CanvasDraftSaveQueueOptions) {
  const pending = new Map<string, PendingCanvasDraftSave>()
  const setTimer = options.setTimer ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs))
  const clearTimer = options.clearTimer ?? ((timer) => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>))

  return {
    schedule(frameId: string, patch: CanvasDraftPatch) {
      const previous = pending.get(frameId)
      if (previous) clearTimer(previous.timer)
      const mergedPatch = { ...previous?.patch, ...patch }
      const timer = setTimer(() => {
        pending.delete(frameId)
        void Promise.resolve(options.save(frameId, mergedPatch)).catch(() => undefined)
      }, options.delayMs ?? 550)
      pending.set(frameId, { patch: mergedPatch, timer })
    },
  }
}
