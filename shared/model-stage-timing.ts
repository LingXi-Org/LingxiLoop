import type { ModelStageTimings, PublicTextPublicationTiming } from '@lingxi-org/lingxios'

export interface AdminModelStageCall {
  callId: string
  fence: number
  requestVersion: number
  operation: 'generation' | 'correction' | null
  status: 'succeeded' | 'failed'
  failureAttribution?: { kind: 'output' | null; outputCallback: 'operation' | 'delta' | null }
  stages: ModelStageTimings
}
export interface RunStageTiming {
  calls: AdminModelStageCall[]
  modelCallsAvailable: boolean
  callsTruncated: boolean
  publicationTimings: PublicTextPublicationTiming[]
  publicationMeasurementsAvailable: boolean
  publicationsTruncated: boolean
  providerTime: 'unavailable'
  unattributedRunMs: null
}
