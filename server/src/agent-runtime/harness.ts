import type { HarnessProfile, SkillDefinition, ToolDefinition } from '@lyyzka/lingxios'
import { presentationCard } from '../modules/presentations/agent-tools.js'

export const productSkills: SkillDefinition[] = [
  { name: 'document-edit', version: '1', description: 'Read, edit and verify a product document without losing peer changes.',
    actions: ['documents.read','documents.edit'], body: 'Read the current document and revision. Apply the requested minimal edits against that revision. On conflict, reread and preserve peer content. Read back the committed document before reporting completion.' },
  { name: 'research-evidence', version: '2', description: 'Research a question using Chinese web search and readable primary evidence.',
    actions: ['research.search','research.read'], body: 'Use research.search for Chinese web search and prefer relevant domestic primary sources. Read the sources before treating snippets as evidence, and distinguish supported findings from uncertainty. Cite only evidence actually returned by the tools; do not invent source contents. Search sources are displayed as cards: avoid repeating a link list in the answer, but preserve necessary inline citations. Do not comment on a short or empty result list or fill it using foreign search engines. If the search tool fails, state the failure honestly without claiming that no sources exist.' },
  { name: 'canvas-cooperation', version: '2', description: 'Use for a shared deliverable or independent evidence verification.',
    actions: ['canvas.current','canvas.start_workspace','canvas.assign','canvas.submit_report'], body: 'Use canvas.available_agents for actual room members. Create the business workspace with canvas.start_workspace and assign specialist and independent verifier tasks through canvas.assign. These tools dispatch real child work and wait for its results; never bypass them with graph.start. Persist canvas.submit_report, consume all current reports and preserve unresolved disagreements. If coordinating a Mission, first hand off Canvas hosting to a separate child via handoffs.create; resume Mission coordination after that child returns. Creation or acceptance is not completion.' },
  { name: 'task-coordination', version: '1', description: 'Choose direct answers, specialist handoffs or a sustained learning Mission according to the goal.',
    actions: ['learning.current','learning.start_mission','handoffs.create'], body: 'Answer simple questions directly. For a sustained learning goal in an authorized project conversation, reuse the relevant active Mission or start one from the committed original human message. Maintain planning, checking, reflection and completion evidence. For a specialist subtask, call handoffs.create with an actual roster ID and wait for the persisted child result. If the needed role is absent, explain its purpose and ask the user to add it. Ordinary @ text does not dispatch work.' },
  { name: 'course-evidence', version: '1', description: 'Ground course-dependent answers in authorized knowledge and resolve missing or conflicting evidence.',
    actions: ['knowledge.search','knowledge.read_source','knowledge.list_sources'], body: 'Use automatic retrieval when sufficient. When the question depends on course material, evidence is missing, or sources conflict, search and read the relevant source before answering. Cite only returned markers and distinguish inference. State no matches, processing sources or service unavailability when observed; do not invent citations. At most two searches for the same question without new evidence; then explain the gap or ask for the missing material.' },
]

export function createProductHarness(tools: ToolDefinition[]): HarnessProfile {
  return { id: 'lingxiloop', version: '3.2.3', mode: 'execute',
    capabilities: [...new Set(tools.map(tool => tool.action.split('.')[0]))].map(id => ({ id,
      tools: tools.filter(tool => tool.action.startsWith(`${id}.`)),
      skills: productSkills.filter(skill => skill.actions[0].startsWith(`${id}.`)),
      ...(id === 'presentations' ? { presentations: [presentationCard] } : {}),
    })) }
}
