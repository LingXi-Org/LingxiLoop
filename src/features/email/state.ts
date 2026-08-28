import { create } from 'zustand'
import type { EmailComposition } from './contracts'

interface EmailComposerState {
  composition: EmailComposition
  openComposeNew: () => void
  openComposeReply: (replyToMessageId: string) => void
  closeCompose: () => void
}

export const useEmailComposer = create<EmailComposerState>((set) => ({
  composition: null,
  openComposeNew: () => set({ composition: { mode: 'new' } }),
  openComposeReply: (replyToMessageId) => set({ composition: { mode: 'reply', replyToMessageId } }),
  closeCompose: () => set({ composition: null }),
}))
