export interface NativeHistoryState { version: number; undo: string[]; redo: string[] }
export type NativeHistoryCommand = { kind: 'edit' | 'restore'; operationId: string }
  | { kind: 'undo' | 'redo'; operationId: string; targetOperationId: string; expectedHistoryVersion: number }

export class NativeHistoryConflict extends Error {
  readonly status = 409
  readonly code = 'history_conflict'
  constructor(readonly history: ReturnType<typeof historyView>) { super('History changed. Refresh before undoing or redoing this step.') }
}

export const historyView = (state: NativeHistoryState) => ({ version: state.version, undo: state.undo.at(-1) ?? null, redo: state.redo.at(-1) ?? null })

/** Called while holding the artifact lock; history is global, never a browser's private stack. */
export function advanceNativeHistory(state: NativeHistoryState, command: NativeHistoryCommand): NativeHistoryState {
  const next = { version: state.version + 1, undo: [...state.undo], redo: [...state.redo] }
  if (!('targetOperationId' in command)) {
    next.undo.push(command.operationId)
    next.redo = []
    return next
  }
  const source = command.kind === 'undo' ? next.undo : next.redo
  if (command.expectedHistoryVersion !== state.version || source.at(-1) !== command.targetOperationId) throw new NativeHistoryConflict(historyView(state))
  source.pop()
  ;(command.kind === 'undo' ? next.redo : next.undo).push(command.targetOperationId)
  return next
}
