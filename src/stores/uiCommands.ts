import { useRef } from 'react'
import { create } from 'zustand'

export type UiCommand = 'focus-conversation-search' | 'find-chat' | 'focus-composer' | 'new-group' | 'open-updater'

interface UiCommandState {
  command: { type: UiCommand; sequence: number } | null
  dispatch: (type: UiCommand) => void
}

export const useUiCommands = create<UiCommandState>((set) => ({
  command: null,
  dispatch: (type) => set((state) => ({ command: { type, sequence: (state.command?.sequence ?? 0) + 1 } })),
}))

/** Returns only commands dispatched after this subscriber mounted. */
export function useUiCommand() {
  const mountedAtSequence = useRef(useUiCommands.getState().command?.sequence ?? 0).current
  return useUiCommands((state) => (
    state.command && state.command.sequence > mountedAtSequence ? state.command : null
  ))
}
