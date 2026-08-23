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
  onError?: (frameId: string, error: unknown) => void
  setTimer?: (callback: () => void, delayMs: number) => unknown
  clearTimer?: (timer: unknown) => void
}

interface CanvasDraftSaveState {
  inFlight: boolean
  patch?: CanvasDraftPatch
  ready: boolean
  timer?: unknown
}

/**
 * Debounces saves per frame rather than per Inspector selection. Selecting a
 * different frame therefore cannot cancel the old frame's pending patch, and
 * the patch contains only fields the human actually changed.
 */
export function createCanvasDraftSaveQueue(options: CanvasDraftSaveQueueOptions) {
  const states = new Map<string, CanvasDraftSaveState>()
  const setTimer = options.setTimer ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs))
  const clearTimer = options.clearTimer ?? ((timer) => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>))

  async function flush(frameId: string, state: CanvasDraftSaveState) {
    if (state.inFlight || !state.ready || !state.patch) return
    const patch = state.patch
    state.patch = undefined
    state.ready = false
    state.inFlight = true
    try {
      await options.save(frameId, patch)
    } catch (error) {
      // Retain failed fields for an explicit retry. Edits made while this
      // request was in flight win when they touch the same field.
      state.patch = { ...patch, ...(state.patch ?? {}) }
      options.onError?.(frameId, error)
    } finally {
      state.inFlight = false
      if (state.ready && state.patch) {
        void flush(frameId, state)
      } else if (!state.patch && state.timer === undefined) {
        states.delete(frameId)
      }
    }
  }

  return {
    schedule(frameId: string, patch: CanvasDraftPatch) {
      const state = states.get(frameId) ?? { inFlight: false, ready: false }
      states.set(frameId, state)
      if (state.timer !== undefined) clearTimer(state.timer)
      state.patch = { ...state.patch, ...patch }
      state.ready = false
      state.timer = setTimer(() => {
        state.timer = undefined
        state.ready = true
        void flush(frameId, state)
      }, options.delayMs ?? 550)
    },
    retry(frameId: string) {
      const state = states.get(frameId)
      if (!state?.patch) return false
      if (state.timer !== undefined) clearTimer(state.timer)
      state.timer = undefined
      state.ready = true
      void flush(frameId, state)
      return true
    },
  }
}
