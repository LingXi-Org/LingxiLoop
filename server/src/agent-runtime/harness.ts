import type { HarnessProfile, ToolDefinition } from '@lyyzka/lingxios'
import { productSkills } from './system-skills.js'
export { productSkills } from './system-skills.js'
import { presentationCard } from '../modules/presentations/agent-tools.js'
import { activityTool } from './activity-tool.js'
import { beginPublicToolActivity, finishPublicToolActivity } from './tool-activity.js'
import { createMemorySummaryPresentation, type MemoryPresentationControl } from '../modules/memory/presentation.js'

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
  return { id: 'lingxiloop', version: '3.4.1-system-skill-context-2', mode: 'execute',
    rules: 'For an applicable built-in workflow, select its exact current index once with the native skills.load tool for reference-only use. For requested creation or a commitment to author under a skill delivery contract, select it with native skills.activate instead, before loading references or promising delivery. Both actions supply the complete registered body directly in subsequent prompts; activation needs no additional skills.load. Do not paginate or reload that skill, including after compaction. Select only skills needed for this request; selection grants no permissions. Only skills.activate or an authoring tool creates a delivery obligation; loading alone does not. A brief substantive public explanation may precede selection. Keep substantive answers streaming in ordinary response text, and publish process or status updates through chat.report_progress when available without repeating them in answer text; do not narrate document loading instead of helping the user.',
    capabilities: [...new Set(tools.map(tool => tool.action.split('.')[0]))].map(id => ({ id,
      tools: tools.filter(tool => tool.action.startsWith(`${id}.`)),
      skills: productSkills.filter(skill => skill.actions[0].startsWith(`${id}.`)),
      presentations: id === 'presentations' ? [presentationCard] : id === 'memory' && memoryControl ? [createMemorySummaryPresentation(memoryControl)] : [],
    })) }
}
