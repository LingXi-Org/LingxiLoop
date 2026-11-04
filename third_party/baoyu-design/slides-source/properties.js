import { installUiSegmentedProperty } from './modules/ui-segmented-property.js'
import { installUiSidesProperty } from './modules/ui-sides-property.js'
import { installUiSelectionInspector } from './modules/ui-selection-inspector.js'
import { installDesignSystemThemePanel } from './modules/design-system-theme-panel.js'

export function installPropertyModules(runtime) {
  const initializers = [installUiSegmentedProperty(runtime), installUiSidesProperty(runtime), installUiSelectionInspector(runtime), installDesignSystemThemePanel(runtime)]
  for (const initialize of initializers) initialize()
}
