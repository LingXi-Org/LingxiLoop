import type { ToolCallMessagePart } from '@assistant-ui/react'
import type { RunView, ResponseEnvelope } from '@lyyzka/lingxios/ui'
import type { NativeMessage } from './nativeMessage.js'

export type HarnessToolPart = ToolCallMessagePart
export type RunDisplayState = Omit<RunView, 'message' | 'draft' | 'preview' | 'publicTextParts' | 'publicTextAttempts' | 'publicTextCommit'> & {
  artifacts: ResponseEnvelope['artifacts']
}
/** Official Assistant Transport state. The native message also owns history replay. */
export interface AgentRunSnapshot { message: NativeMessage }

export interface MarkdownConfidenceClaim {
  id: string
  text: string
  confidence: 'grounded' | 'inferred' | 'uncertain'
  basis: string
  markers: readonly string[]
  start: number
  end: number
  evidence?: readonly { marker: string; chunkId: string; title: string; excerpt: string; truncated?: boolean }[]
}
