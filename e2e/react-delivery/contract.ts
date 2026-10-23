import type { AgentRunSnapshot } from '../../src/lib/agentRunSnapshot'
import type { AgentRunTarget } from '../../src/features/chat/runtime/harness-api'

/** Product projection of synthetic native events; not runtime/provider execution. */
export interface ReactDeliveryFrame {
  checkpoint: string
  target: AgentRunTarget
  snapshot: AgentRunSnapshot
}

export interface ReactDeliveryScenario {
  name: string
  targets: AgentRunTarget[]
  frames: ReactDeliveryFrame[]
  /** Independently reloaded from the owning native-event fixture's final state. */
  history: Omit<ReactDeliveryFrame, 'checkpoint'>[]
}

export interface ReactDeliveryEvidence {
  version: 1
  provenance: { producer: 'native-event-projection-fixture'; commit: string }
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
