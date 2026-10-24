import type { BotEngine, Look } from './engine'
import type { StateId } from './states'

/** Static history still acknowledges a pointer, but samples only that explicit
 * event at its frozen pose. No clock, timer, or layout measurement is involved. */
export function sampleStaticPointerFrame(engine: BotEngine, state: StateId, phase: number, look: Look | null) {
  engine.reset(state, 0)
  // Finish the look transition before sampling, avoiding a perpetual hover clock
  // and the undefined 0/0 interpolation of a zero-duration transition.
  engine.setLook(look, phase - 1, 0.001)
  return engine.sample(phase)
}
