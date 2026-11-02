import { create } from 'zustand'
import type { ForumFilter } from './contracts'

/** The forum board filter, shared by the nested sidebar and the forum feed. */
export const useForumSection = create<{ kind: ForumFilter; setKind(kind: ForumFilter): void }>((set) => ({
  kind: 'all',
  setKind: (kind) => set({ kind }),
}))
