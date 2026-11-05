import type { HarnessProfile, ToolDefinition } from '@lyyzka/lingxios'
import { productSkills } from './system-skills.js'
export { productSkills } from './system-skills.js'
import { activityTool } from './activity-tool.js'
import { beginPublicToolActivity, finishPublicToolActivity } from './tool-activity.js'
import { createMemorySummaryPresentation, type MemoryPresentationControl } from '../modules/memory/presentation.js'

const publicAnswerGuidance = 'The trusted model driver owns public answer delivery and wire encoding. Publish supported explanations through that channel; companion text and private reasoning are internal. '
  + 'Respect the request’s evidence scope: supplied facts and verified tool results for source-restricted tasks; otherwise established general knowledge with inferences labelled. Describe completed tool results from their receipts. '
  + 'Request independent read-only tools together in one model turn when their inputs are already known. Wait for observations before dependent calls; preserve write, approval and user-input ordering. Use each real receipt, continue independent work after a partial failure, and never repeat an uncertain side effect. '
  + 'Use chat.report_progress for a useful plan or material progress. Native lifecycle events show routine tool activity and failed calls. Explain a failure in the answer only when it affects the result or requires the user to act; do not duplicate error cards or raw diagnostics. '

export function createProductHarness(productTools: ToolDefinition[], memoryControl?: MemoryPresentationControl): HarnessProfile {
  if (productTools.some(tool => tool.action === 'memory.summary') && !memoryControl) throw new Error('memory-summary requires its authorized reader')
  const implementations: ToolDefinition[] = [...productTools, activityTool]
  const tools: ToolDefinition[] = implementations.map(tool => ({ ...tool,
    async execute(context, input) {
      const display = await beginPublicToolActivity(context, input).catch(() => { console.warn('[activity] execution details unavailable'); return undefined })
      try {
        const result = await tool.execute(context, input)
        if (display) await finishPublicToolActivity(context, display, result).catch(() => console.warn('[activity] execution details unavailable'))
        return result
      } catch (error) {
        if (display) await finishPublicToolActivity(context, display).catch(() => console.warn('[activity] execution details unavailable'))
        throw error
      }
    },
  }))
  return { id: 'lingxiloop', version: '3.8.24-retired-visualizations-1', mode: 'execute',
    rules: 'Select an applicable skill by its current name/version/hash. A skill with no delivery uses skills.load for both guidance and authoring; only a skill with delivery can use skills.activate. The complete registered body is supplied in the next prompt. Finish selection and read that guidance before calling dependent tools; never batch a selection with tools that need its instructions. Selection grants no permissions. Only a real delivery contract creates an activation obligation. explanation is optional and applies only to a registered explanationBeforeAuthoring workflow requested by the human; never add it to a skill without that workflow. '
      + publicAnswerGuidance,
    capabilities: [...new Set(tools.map(tool => tool.action.split('.')[0]))].map(id => ({ id,
      tools: tools.filter(tool => tool.action.startsWith(`${id}.`)),
      skills: productSkills.filter(skill => skill.actions[0].startsWith(`${id}.`)),
      presentations: id === 'memory' && memoryControl ? [createMemorySummaryPresentation(memoryControl)] : [],
    })),
  }
}
