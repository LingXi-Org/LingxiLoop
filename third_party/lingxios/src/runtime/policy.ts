/**
 * RuntimePolicy — the extension point where deployments put product policy.
 *
 * The core agent loop is product-agnostic; everything a product wants to
 * impose on a turn (capability mapping, response validation, completion
 * gates, dynamic context rendering, prompt assembly) is expressed through
 * this interface. The previous generation of this system hardcoded all of it
 * into the loop; the split is the central lesson of that codebase.
 */
import { KERNEL_SDK_MODULE } from '../protocol/constants.js'
import type {
  CapabilityGrant, ModelItem, PromptContext, TurnContext, WorkItem,
} from '../protocol/types.js'

export interface RuntimePolicyEvent {
  kind: string
  data: Record<string, unknown>
}

export interface FinalMessageExtension {
  data?: Record<string, unknown>
  events?: RuntimePolicyEvent[]
}

/**
 * A completion gate can veto a final (text-only) assistant response and force
 * the loop to continue with an injected instruction — e.g. "you have not
 * submitted your report yet".
 */
export interface CompletionGateResult {
  allowed: boolean
  /** Injected as a user item when `allowed` is false. */
  instruction?: string
}

export interface RuntimePolicy {
  /**
   * Compute the kernel capability grant for this turn. The same computation
   * must be mirrored by the control plane's capability resolver — the kernel
   * grant is advisory, the control-plane check is authoritative.
   */
  kernelCapabilities(context: TurnContext): CapabilityGrant[]

  /**
   * Assemble the full system prompt from the frozen prompt-context candidate.
   * Returns the exact string handed to the model as instructions.
   */
  assembleSystemPrompt(candidate: PromptContext, context: TurnContext): string

  /**
   * Render the per-turn dynamic context (retrieval results, live product
   * state) as model items appended after session history. Never persisted.
   */
  dynamicContextItems(context: TurnContext): ModelItem[]

  /**
   * Render the turn's trigger input as model items to fold into durable
   * session history exactly once per work item.
   */
  turnInputItems(context: TurnContext, hasHistory: boolean): ModelItem[]

  /** Trusted, metadata-only context events emitted after context loading. */
  contextEvents(context: TurnContext): RuntimePolicyEvent[]

  /**
   * Validate a candidate final assistant text. Return a violation description
   * to withhold it and grant the model one bounded correction turn, or null
   * to accept.
   */
  validateAssistantText(text: string, context: TurnContext, state: { completedHostAction: boolean }): string | null

  /**
   * Decide whether a final text-only response may end the turn. Evaluated on
   * fresh context each hop.
   */
  completionGate(context: TurnContext, work: WorkItem): CompletionGateResult

  /** Trusted product metadata and events attached to an accepted final answer. */
  finalMessageExtension(
    text: string,
    context: TurnContext,
    state: { nextPartIndex: number },
  ): FinalMessageExtension
}

const DEFAULT_PROMPT_PREAMBLE = `You are an agent running on the LingxiOS Agent OS.

Tooling contract:
- You have exactly one tool: ipython. It executes Python in your persistent, sandboxed session kernel.
- Product capabilities are Python namespaces: ${KERNEL_SDK_MODULE}.<capability>.<method>(keyword=value, ...). Keyword arguments only.
- Emit at most one ipython call per turn. Combine read-only work into one cell, or perform one state-changing action and inspect its result on the next turn.
- Assistant text and an ipython call are mutually exclusive within a turn.
- Never print tool code, hidden reasoning, or internal identifiers in user-visible text.
- Never claim a durable action succeeded unless a host call in this run returned a successful result.
- Some actions suspend into a human approval; when that happens, stop and wait — never work around an approval.`

/**
 * Default policy: grants the persona's declared capabilities verbatim,
 * assembles a plain persona prompt with the tooling contract, renders trigger
 * messages simply, and imposes only universal protocol rules.
 */
export class DefaultRuntimePolicy implements RuntimePolicy {
  kernelCapabilities(context: TurnContext): CapabilityGrant[] {
    return context.capabilities.map((name) => ({ name }))
  }

  assembleSystemPrompt(candidate: PromptContext): string {
    const persona = candidate.persona
    return [
      DEFAULT_PROMPT_PREAMBLE,
      `# Persona\nName: ${persona.name}\nRole: ${persona.role}\n${persona.instructions}`.trim(),
      candidate.capabilities.length > 0
        ? `# Granted capabilities\n${candidate.capabilities.map((name) => `- ${KERNEL_SDK_MODULE}.${name}`).join('\n')}`
        : '',
    ].filter(Boolean).join('\n\n')
  }

  dynamicContextItems(): ModelItem[] {
    return []
  }

  turnInputItems(context: TurnContext, hasHistory: boolean): ModelItem[] {
    const trigger = context.messages.find((message) => message.ref === context.work.triggerRef)
    const recent = hasHistory
      ? (trigger ? [trigger] : [])
      : context.messages.slice(-20)
    if (recent.length === 0) return []
    const rendered = recent
      .map((message) => `[${message.createdAt}] ${message.authorName} (${message.authorKind}): ${message.body}`)
      .join('\n')
    return [{ role: 'user', content: rendered }]
  }

  contextEvents(): RuntimePolicyEvent[] {
    return []
  }

  validateAssistantText(text: string): string | null {
    if (/<\/?(?:think|thinking|analysis|reasoning|tool_call|function)>/i.test(text)) {
      return 'hidden reasoning or tool markup is not user-visible content'
    }
    const sdkPattern = new RegExp(`\\b(?:from|import)\\s+${KERNEL_SDK_MODULE}\\b|\\b${KERNEL_SDK_MODULE}\\.[a-z_]+\\.[a-z_]+\\(`, 'i')
    if (sdkPattern.test(text) || /```[^`]*\bipython\b/i.test(text)) {
      return 'SDK or tool code must be executed through ipython, never shown to the user'
    }
    return null
  }

  completionGate(): CompletionGateResult {
    return { allowed: true }
  }

  finalMessageExtension(
    _text: string,
    _context: TurnContext,
    _state: { nextPartIndex: number },
  ): FinalMessageExtension {
    return {}
  }
}
