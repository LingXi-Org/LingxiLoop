import type { AgentRunSnapshot } from '../../src/lib/agentRunSnapshot'
import type { AgentRunTarget } from '../../src/features/chat/runtime/harness-api'

/** Synthetic integration output; this is not a runtime wire protocol. */
export interface ReactDeliveryFrame {
  checkpoint: string
  target: AgentRunTarget
  snapshot: AgentRunSnapshot
}

export interface ReactDeliveryScenario {
  name: string
  targets: AgentRunTarget[]
  frames: ReactDeliveryFrame[]
  /** Independently reloaded by the owning integration after the live run. */
  history: Omit<ReactDeliveryFrame, 'checkpoint'>[]
}

export interface ReactDeliveryEvidence {
  version: 1
  provenance: { producer: 'synthetic-scripted-provider'; commit: string }
  scenarios: ReactDeliveryScenario[]
}

export interface ReactDeliveryHarness {
  push(frame: ReactDeliveryFrame): Promise<void>
  reconnect(target: AgentRunTarget): Promise<void>
  restore(frames: Omit<ReactDeliveryFrame, 'checkpoint'>[]): Promise<void>
  reset(): Promise<void>
  evidence(): { received: number; rendered: number; mutations: number; streamConnections: number }
}
declare global { interface Window { reactDelivery?: ReactDeliveryHarness } }

export const REACT_DELIVERY_TEXT = {
  a: 'Gather collects the available inputs.',
  b: 'Check compares those inputs with the stated goal.',
  replacement: 'Gather records the approved inputs.',
  commentary: 'Checking the stored resource.',
} as const
