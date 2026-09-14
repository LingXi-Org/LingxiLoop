import type { HarnessProfile, SkillDefinition, ToolDefinition } from '@lyyzka/lingxios'
import { presentationCard } from '../modules/presentations/agent-tools.js'

export const productSkills: SkillDefinition[] = [
  { name: 'document-edit', version: '1', description: 'Read, edit and verify a product document without losing peer changes.',
    actions: ['documents.read','documents.edit'], body: 'Read the current document and revision. Apply the requested minimal edits against that revision. On conflict, reread and preserve peer content. Read back the committed document before reporting completion.' },
  { name: 'research-evidence', version: '1', description: 'Research a question using readable primary evidence.',
    actions: ['research.search','research.read'], body: 'Search for relevant primary sources, read the sources, and distinguish supported findings from uncertainty. Cite only evidence actually returned by the tools; do not invent source contents.' },
  { name: 'canvas-cooperation', version: '1', description: 'Coordinate specialists, verify evidence and report unresolved disagreements.',
    actions: ['canvas.current','canvas.submit_report'], body: 'Read the Canvas goal and current assignments. Use native graph.start for independent specialist tasks and their dependencies, then wait for their committed results. Verify business resources, preserve disagreements and persist an evidence-backed report. Graph creation alone is not completion.' },
]

export function createProductHarness(tools: ToolDefinition[]): HarnessProfile {
  return { id: 'lingxiloop', version: '3.2.2', mode: 'execute',
    capabilities: [...new Set(tools.map(tool => tool.action.split('.')[0]))].map(id => ({ id,
      tools: tools.filter(tool => tool.action.startsWith(`${id}.`)),
      skills: productSkills.filter(skill => skill.actions[0].startsWith(`${id}.`)),
      ...(id === 'presentations' ? { presentations: [presentationCard] } : {}),
    })) }
}
