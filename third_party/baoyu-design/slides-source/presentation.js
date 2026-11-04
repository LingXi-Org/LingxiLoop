import { installPresentationSpeakerPanel } from './modules/presentation-speaker-panel.js'
import { installPresentationView } from './modules/presentation-view.js'

export function installPresentationModules(runtime) {
  const initializers = [installPresentationSpeakerPanel(runtime), installPresentationView(runtime)]
  for (const initialize of initializers) initialize()
}
