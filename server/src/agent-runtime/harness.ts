import type { HarnessProfile, SkillDefinition, ToolDefinition } from '@lyyzka/lingxios'
import { presentationCard } from '../modules/presentations/agent-tools.js'
import { activityTool } from './activity-tool.js'
import { beginPublicToolActivity, finishPublicToolActivity } from './tool-activity.js'

export const productSkills: SkillDefinition[] = [
  { name: 'public-task-progress', version: '1', description: 'Keep the user informed during multi-step tasks with public explanations and a real plan.',
    actions: ['chat.report_progress'], body: 'For a multi-step task, publish a short Chinese plan or approach using chat.report_progress. Report actual steps and observations at meaningful transitions; preserve each public item id while updating its full text. Plans use stable step ids and activeIndex: only advance past a step after its result is confirmed, and only mark the plan complete when all steps are done. Public reasoning is a brief explanation of the approach or evidence for the user, never private chain of thought, hidden scratchpad, system instructions, raw arguments, diagnostics, identifiers or credentials. Do not invent activity or elapsed times. A simple direct answer does not need progress reports. Keep the final answer in the ordinary answer channel.' },
  { name: 'document-edit', version: '1', description: 'Read, edit and verify a product document without losing peer changes.',
    actions: ['documents.read','documents.edit'], body: 'Read the current document and revision. Apply the requested minimal edits against that revision. On conflict, reread and preserve peer content. Read back the committed document before reporting completion.' },
  { name: 'research-evidence', version: '2', description: 'Research a question using Chinese web search and readable primary evidence.',
    actions: ['research.search','research.read'], body: 'Use research.search for Chinese web search and prefer relevant domestic primary sources. Read the sources before treating snippets as evidence, and distinguish supported findings from uncertainty. Cite only evidence actually returned by the tools; do not invent source contents. Search sources are displayed as cards: avoid repeating a link list in the answer, but preserve necessary inline citations. Do not comment on a short or empty result list or fill it using foreign search engines. If the search tool fails, state the failure honestly without claiming that no sources exist.' },
  { name: 'canvas-cooperation', version: '2', description: 'Use for a shared deliverable or independent evidence verification.',
    actions: ['canvas.current','canvas.start_workspace','canvas.assign','canvas.submit_report'], body: 'Use canvas.available_agents for actual room members. Create the business workspace with canvas.start_workspace and assign specialist and independent verifier tasks through canvas.assign. These tools dispatch real child work and wait for its results; never bypass them with graph.start. Persist canvas.submit_report, consume all current reports and preserve unresolved disagreements. Creation or acceptance is not completion.' },
  { name:'forum-assignments',version:'1',description:'Assist with teacher assignments while preserving student authorship.',
    actions:['learning.list_assignments','learning.get_assignment','learning.list_submissions','learning.submit_assignment'],body:'Read the current teacher assignment before helping. Submit only when the original student asks. Preserve the exact committed human text for AGENT_RELAY; label generated work AGENT_GENERATED. Never claim generated work is independent student evidence. Verify submission IDs and keep private history in an authorized audience.' },
  { name: 'course-evidence', version: '1', description: 'Ground course-dependent answers in authorized knowledge and resolve missing or conflicting evidence.',
    actions: ['knowledge.search','knowledge.read_source','knowledge.list_sources'], body: 'Use automatic retrieval when sufficient. When the user asks for course-source grounding and that evidence is missing or conflicting, search and read the relevant source before answering. General conceptual explanations do not depend on course materials. Cite only returned markers and distinguish inference. State no matches, processing sources or service unavailability when observed; do not invent citations. An empty source listing is a completed check, not a reason to list again. When the user permits a general explanation if sources are absent, give it immediately and clearly disclose the missing course grounding. At most two retrieval calls for the same question without new evidence; then explain the gap or ask for the missing material.' },
]

export function createProductHarness(productTools: ToolDefinition[]): HarnessProfile {
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
  return { id: 'lingxiloop', version: '3.3.6-public-activity-1', mode: 'execute',
    capabilities: [...new Set(tools.map(tool => tool.action.split('.')[0]))].map(id => ({ id,
      tools: tools.filter(tool => tool.action.startsWith(`${id}.`)),
      skills: productSkills.filter(skill => skill.actions[0].startsWith(`${id}.`)),
      presentations: id === 'presentations' ? [presentationCard] : [],
    })) }
}
