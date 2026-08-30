import type { AgentExecutionRole } from './types.js'

const ROLE_ACTION_ALLOW: Record<AgentExecutionRole, ReadonlySet<string> | null> = {
  coordinator: null,
  specialist: null,
  verifier: new Set([
    'canvas.get', 'canvas.set_status', 'canvas.submit_report',
    'learning.current', 'learning.get_learner_state', 'learning.list_knowledge_units', 'learning.list_due', 'learning.get_mission', 'learning.get_activity', 'learning.propose_evaluation',
    'knowledge.list_sources', 'knowledge.get_source', 'knowledge.search', 'knowledge.ask', 'knowledge.list_notes', 'knowledge.get_note',
    'research.search', 'research.read', 'turn.stop',
  ]),
  reporter: new Set([
    'canvas.get', 'canvas.submit_report',
    'learning.current', 'learning.get_learner_state', 'learning.list_knowledge_units', 'learning.list_due', 'learning.get_mission', 'learning.get_activity',
    'knowledge.list_sources', 'knowledge.get_source', 'knowledge.search', 'knowledge.ask', 'knowledge.list_notes', 'knowledge.get_note',
    'turn.stop',
  ]),
}

export function roleAllowsAction(role: AgentExecutionRole, action: string): boolean {
  const allow = ROLE_ACTION_ALLOW[role]
  return allow === null || allow.has(action)
}
