import type { ApprovalKind } from './coworker.js'
import type { CommunicationAction } from './lingxigraph-adapter.js'

export type AgentCapability = 'computer' | 'web' | 'files' | 'email' | 'documents'

export interface HardApprovalRequirement {
  kind: ApprovalKind
  summary: string
  payload: Record<string, unknown>
  blockedAction: Record<string, unknown>
}

const SHELL_OR_EVAL_WRAPPERS = new Set([
  'sh', 'bash', 'dash', 'zsh', 'ksh', 'fish',
  'python', 'python3', 'node', 'nodejs', 'perl', 'ruby', 'php',
])

const DESTRUCTIVE_PROGRAMS = new Set([
  'rm', 'rmdir', 'unlink', 'dd', 'mkfs', 'fdisk', 'parted',
  'shutdown', 'reboot', 'poweroff', 'halt', 'kill', 'killall', 'pkill',
])

function programName(value: string): string {
  return value.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase().replace(/\.exe$/, '') ?? ''
}

/**
 * Capability enforcement belongs to the executor boundary, not the prompt or
 * model adapter. Every action reaches this mapping before any sink is called.
 */
export function requiredCapabilityForAction(action: CommunicationAction): AgentCapability | null {
  if (action.type.startsWith('computer.')) return 'computer'
  if (action.type.startsWith('email.')) return 'email'
  if (action.type.startsWith('document.')) return 'documents'
  return null
}

function computerCommandNeedsApproval(command: string[]): boolean {
  if (command.length === 0) return true
  const executable = programName(command[0] ?? '')
  // Shell/eval wrappers are deliberately fail-closed. Trying to recover a
  // trustworthy nested argv from `sh -c`, Python/Node source, aliases, or
  // encoded snippets is impossible at this boundary.
  if (SHELL_OR_EVAL_WRAPPERS.has(executable)) return true
  if (DESTRUCTIVE_PROGRAMS.has(executable)) return true
  // Also catch indirection such as env/sudo/xargs/command and option-prefixed
  // invocations. This is intentionally token based rather than substring
  // based so benign filenames containing "rm" do not trip the gate.
  return command.slice(1).some((token) => DESTRUCTIVE_PROGRAMS.has(programName(token)))
}

/**
 * Mandatory, fail-closed approval classes. These requirements are independent
 * of learned autonomy: an allow rule may never bypass this function.
 */
export function hardApprovalForAction(action: CommunicationAction): HardApprovalRequirement | null {
  const blockedAction = action as unknown as Record<string, unknown>
  if (action.type === 'approval.request') {
    const exactAction = action.payload.action
    return {
      kind: action.kind,
      summary: action.summary,
      payload: action.payload,
      blockedAction: exactAction && typeof exactAction === 'object' && !Array.isArray(exactAction)
        ? exactAction as Record<string, unknown>
        : {},
    }
  }
  if (action.type === 'email.send') {
    return {
      kind: 'external_communication',
      summary: `Send external email to ${action.to.join(', ')} — ${action.subject}`,
      payload: blockedAction,
      blockedAction,
    }
  }
  if (action.type === 'email.reply') {
    return {
      kind: 'external_communication',
      summary: `Reply to external email ${action.messageId}`,
      payload: blockedAction,
      blockedAction,
    }
  }
  if (action.type === 'computer.exec' && computerCommandNeedsApproval(action.command)) {
    return {
      kind: 'sensitive_or_destructive_action',
      summary: `Run sensitive computer command: ${action.command.join(' ') || '(empty command)'}`,
      payload: blockedAction,
      blockedAction,
    }
  }
  // A coordinate click has no semantic target at this boundary. It can submit
  // a purchase, publish content, confirm deletion, or authorize a transfer, so
  // it must be treated as financial/irreversible unless a future typed browser
  // action can prove a safer semantic intent.
  if (action.type === 'computer.browser.click') {
    return {
      kind: 'financial_or_irreversible_action',
      summary: `Click browser target ${action.targetId} at (${action.x}, ${action.y})`,
      payload: blockedAction,
      blockedAction,
    }
  }
  if (action.type === 'conversation.member.remove' || action.type === 'conversation.leave' || action.type === 'poll.close') {
    return {
      kind: 'financial_or_irreversible_action',
      summary: `Perform irreversible action: ${action.type}`,
      payload: blockedAction,
      blockedAction,
    }
  }
  return null
}
