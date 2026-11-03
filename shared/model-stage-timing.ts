import type { ModelStageTimings, PublicTextPublicationTiming } from '@lyyzka/lingxios'

export interface AdminModelStageCall {
  callId: string
  fence: number
  requestVersion: number
  operation: 'generation' | 'correction' | null
  status: 'succeeded' | 'failed'
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
