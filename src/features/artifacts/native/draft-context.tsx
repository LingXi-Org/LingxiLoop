import { createContext, useCallback, useContext, useLayoutEffect, useRef } from 'react'
import type { NativeDrafts } from './drafts'

export const DraftContext = createContext<NativeDrafts | null>(null)

/** Register once per mounted control, while save/unmount always sees its latest draft. */
export function useLocalDraft(flush: () => void): (dirty: boolean) => void {
  const drafts = useContext(DraftContext)
  const key = useRef(Symbol('native-local-draft'))
  const callback = useRef(flush)
  callback.current = flush
  useLayoutEffect(() => drafts?.register(key.current, () => callback.current()), [drafts])
  return useCallback((dirty: boolean) => { drafts?.mark(key.current, dirty) }, [drafts])
}
