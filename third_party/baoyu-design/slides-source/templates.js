import { installEditorTemplates } from './modules/editor-templates.js'
import { installEditorTemplateRestyling } from './modules/editor-template-restyling.js'

/** Register every live binding before initializing either cyclic consumer. */
export function installTemplateModules(runtime) {
  const initialize = [installEditorTemplates(runtime), installEditorTemplateRestyling(runtime)]
  for (const run of initialize) run()
}
