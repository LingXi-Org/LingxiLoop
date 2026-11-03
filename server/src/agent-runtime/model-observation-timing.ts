import { readModelStageTimings } from '@lyyzka/lingxios'

/** Closed SDK projection only; old/unfenced observations cannot impersonate a
 * measured current call. Existing latency, token and cost fields are untouched. */
export function modelStageExtras(observation: { stageTimings?: unknown; fence?: unknown; requestVersion?: unknown }) {
  const stageTimings = readModelStageTimings(observation.stageTimings)
  const { fence, requestVersion } = observation
  return stageTimings && typeof fence === 'number' && Number.isSafeInteger(fence) && fence > 0
    && typeof requestVersion === 'number' && Number.isSafeInteger(requestVersion) && requestVersion > 0
    ? { stageTimings, fence, requestVersion } : {}
}
