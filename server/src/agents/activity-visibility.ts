type PublicActivityLevel = 'debug' | 'info' | 'warn' | 'error'

/** User-visible activity is intentionally an allowlist with fixed copy.
 * Runtime event titles and data are internal observability input and may carry
 * provider errors, tool arguments, model summaries, or other sensitive text. */
const PUBLIC_ACTIVITY_TITLES: Readonly<Record<string, string>> = Object.freeze({
  'run.started': 'Agent run started',
  'run.completed': 'Agent run completed',
  'run.failed': 'Agent run failed',
  'run.skipped': 'Agent run skipped',
  'run.waiting_for_human': 'Agent is waiting for input',
  'turn.started': 'Agent turn started',
  'turn.completed': 'Agent turn completed',
  'turn.failed': 'Agent turn failed',
  'turn.skipped': 'Agent turn skipped',
  'turn.steered': 'New input joined the running turn',
  'turn.compacted': 'Working context was compacted',
  'turn.completion_verified': 'Completion was verified',
  'turn.completion_rejected': 'More work is needed',
  'turn.tool_interrupted': 'Tool work was interrupted for new input',
  'model.request': 'Planning the next step',
  'model.response': 'Planning step completed',
  'model.error': 'Planning step failed',
  'model.retry_provider_connection': 'Retrying the model connection',
  'model.retry_no_images': 'Retrying without image inputs',
  'tool.started': 'Using a tool',
  'tool.finished': 'Tool step finished',
  'approval.requested': 'Waiting for your approval',
  'approval.resumed': 'Approval received; work resumed',
  'approval.continuation_completed': 'Approved action completed',
  'lingxigraph.started': 'Structured planning started',
  'lingxigraph.completed': 'Structured planning completed',
  'lingxigraph.action_failed': 'Structured action failed',
  'fs.hydrated': 'Workspace loaded',
  'fs.committed': 'Workspace changes saved',
  'fs.commit_failed': 'Workspace changes could not be saved',
  'context.loaded': 'Working context loaded',
  'typing.started': 'Preparing a reply',
  'typing.finished': 'Reply preparation finished',
  'status.changed': 'Agent status updated',
  'budget.stop': 'Work stopped at its budget limit',
  'message.posted': 'Sent a message',
  'handoff.created': 'Created a handoff',
  'memory.learned': 'Updated durable memory',
  'autonomy.learned': 'Updated an autonomy rule',
})

export const PUBLIC_ACTIVITY_KINDS = Object.freeze(Object.keys(PUBLIC_ACTIVITY_TITLES))

export function publicActivityTitle(kind: string, level: PublicActivityLevel = 'info'): string | null {
  if (level === 'debug') return null
  if (/(prompt|reasoning|chain[._-]?of[._-]?thought|secret|credential)/i.test(kind)) return null
  return PUBLIC_ACTIVITY_TITLES[kind] ?? null
}
