import type { MessageKind } from '@/types'

export interface MessageShellCapabilities {
  sharedShell: boolean
  quote: boolean
  reactions: boolean
  reply: boolean
  selection: boolean
  linkPreview: boolean
}

/** Product contract for message-level behavior.
 *
 * Structured cards are still first-class messages. They intentionally skip a
 * duplicate text bubble/link preview, but retain the same author, quote,
 * reaction, reply, selection, mobile, and entrance shell as ordinary text.
 */
export function messageShellCapabilities(kind: MessageKind): MessageShellCapabilities {
  if (kind === 'system' || kind === 'whisper-link') {
    return {
      sharedShell: false,
      quote: false,
      reactions: false,
      reply: false,
      selection: false,
      linkPreview: false,
    }
  }
  return {
    sharedShell: true,
    quote: true,
    reactions: true,
    reply: true,
    selection: true,
    linkPreview: !['tool', 'attachment', 'email', 'poll', 'handoff', 'approval'].includes(kind),
  }
}
