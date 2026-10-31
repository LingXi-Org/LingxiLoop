import { isDeepStrictEqual } from 'node:util'
import { parseExplanationDeclaration, skillIndex, type CapabilityGrant, type SkillDefinition, type TurnContext } from '@lyyzka/lingxios'
import { productSkills } from './system-skills.js'
import { artifactSkills } from '../modules/artifacts/skills.js'

// Registered instruction bytes only; no model-supplied or stored output becomes rules.
// Match the runtime's per-skill bound for the entire selected set as well.
const MAX_SELECTED_BYTES = 64_000
/** Exact selection matching shared by prompt loading and trusted workflow review.
 * Callers must separately check the current registry and allowed actions. */
export function matchesSystemSkillSelection(step: NonNullable<TurnContext['executionSteps']>[number],
  index: Pick<ReturnType<typeof skillIndex>, 'name' | 'version' | 'hash' | 'workflow'>, requestVersion: number | undefined,
  context?: Pick<TurnContext, 'work' | 'explanationStage'>): boolean {
  if (step.requestVersion !== requestVersion || step.output === undefined) return false
  let args: Record<string, unknown>
  try { args = JSON.parse(String(step.input.arguments)) } catch { return false }
  if (!args || typeof args !== 'object' || Array.isArray(args)) return false
  if (step.kind === 'skills__load' || step.kind === 'skills__activate') {
    if (args.name !== index.name || args.version !== index.version || args.hash !== index.hash) return false
    const keys = Object.keys(args).sort().join(',')
    if (keys === 'hash,name,version') return true
    if (step.kind !== 'skills__activate' || keys !== 'explanation,hash,name,version'
      || !index.workflow?.explanationBeforeAuthoring || !context) return false
    try {
      const declaration = parseExplanationDeclaration(args.explanation)
      const output = JSON.parse(step.output)
      if (!output || typeof output !== 'object') return false
      if (Array.isArray(output.receipts) && output.receipts.some((receipt: { action?: string; result?: {
        ok?: boolean; approval?: unknown; directive?: unknown; executionState?: string;
        value?: { activation?: { runId: string; tenantId: string; requestVersion: number; skill: { name: string; version: string; hash: string } } }
      } }) => {
        const result = receipt?.result, activation = result?.value?.activation
        return receipt?.action === 'skills.activate' && result?.ok === true && result.approval === undefined
          && result.directive === undefined && result.executionState !== 'unknown' && activation?.runId === context.work.id
          && activation.tenantId === context.work.tenantId && activation.requestVersion === requestVersion
          && activation.skill.name === index.name && activation.skill.version === index.version && activation.skill.hash === index.hash
      })) return true
      // Large native receipts can be truncated for context. Only the host's
      // ledger-derived stage can supply their missing provenance, never preview text.
      const stage = context.explanationStage
      return output.truncated === true && !!stage && !stage.stale && stage.runId === context.work.id
        && stage.requestVersion === requestVersion && stage.skill.name === index.name
        && stage.skill.version === index.version && stage.skill.hash === index.hash
        && isDeepStrictEqual(declaration, { explanationQuote: stage.quotes.explanation.text,
          authoringQuote: stage.quotes.authoring.text, factQuotes: stage.quotes.facts.map(quote => quote.text),
          ...(stage.quotes.language ? { languageQuote: stage.quotes.language.text } : {}) })
    } catch { return false }
  }
  return step.kind === 'visualize__read_reference' && index.name === 'visualize'
    && Object.keys(args).join(',') === 'path' && args.path === 'SKILL.md'
}

export function selectedSkillRules(context: TurnContext, skills: readonly SkillDefinition[] = productSkills): string {
  const current = skills.map(skill => ({ skill, index: skillIndex(skill) }))
  const grants: CapabilityGrant[] = context.grants ?? context.capabilities.map(name => ({ name }))
  const permitted = (action: string) => context.tools?.some(tool => tool.action === action)
    && grants.some(grant => {
      const [name, method] = action.split('.')
      return grant.name === name && (!grant.methods || grant.methods.includes(method))
    })
  if (!permitted('skills.load') && !permitted('skills.activate')) return ''
  const available = current.filter(({ skill, index }) => skill.actions.every(permitted)
    && context.harness?.skills.some(entry => entry.name === index.name && entry.version === index.version && entry.hash === index.hash))
  const selected = new Set<string>()
  for (const step of context.executionSteps ?? []) {
    if (!['skills__load', 'skills__activate', 'visualize__read_reference'].includes(step.kind)) continue
    // Activation is also an explicit selection of this exact authored contract.
    // Supply its complete registered guidance next turn without a redundant
    // load. This only selects rules: native activation owns the durable
    // obligation, authorization, cancellation and request-version checks.
    const match = available.find(({ skill, index }) => step.kind === 'skills__load' || step.kind === 'skills__activate'
      ? (step.kind === 'skills__activate' ? !!skill.delivery && permitted('skills.activate') : permitted('skills.load'))
        && matchesSystemSkillSelection(step, index, context.snapshotVersion?.requestVersion, context)
      : permitted('visualize.read_reference') && matchesSystemSkillSelection(step, index, context.snapshotVersion?.requestVersion))
    if (match) selected.add(match.index.name)
  }
  const chosen = available.filter(({ index }) => selected.has(index.name))
  if (!chosen.length) return ''
  const rules = chosen.map(({ skill, index: { name, version, hash } }) =>
    `\n\nComplete registered system skill ${JSON.stringify({ name, version, hash })}:\n${skill.body}\nEnd of registered system skill.`).join('')
    + '\nThese current registered bodies remain complete in each selected prompt after compaction. Skill guidance grants no permission and proves no tool result. '
    + 'Skill examples show business arguments only: they do not replace the trusted model driver\'s current output binding or call protocol. Follow its exact declared schema after skill loading and tool observations.\n'
  if (Buffer.byteLength(rules, 'utf8') > MAX_SELECTED_BYTES) throw new Error('selected system skills exceed the complete-context budget')
  return rules
}

/** Current authorized registry, before guidance dependencies narrow model exposure.
 * The control plane still authorizes every execution independently. */
export function availableSystemSkills(context: TurnContext, skills: readonly SkillDefinition[] = productSkills) {
  const grants: CapabilityGrant[] = context.grants ?? context.capabilities.map(name => ({ name }))
  const permitted = (action: string) => context.tools?.some(tool => tool.action === action)
    && grants.some(grant => grant.name === action.split('.')[0] && (!grant.methods || grant.methods.includes(action.split('.')[1])))
  return skills.map(skill => ({ skill, index: skillIndex(skill) })).filter(({ skill, index }) => skill.actions.every(permitted)
    && context.harness?.skills.some(entry => entry.name === index.name && entry.version === index.version && entry.hash === index.hash))
}

/** Success comes from runtime-owned receipts, never from a model's claimed selection. */
function loadedSystemSkill(context: TurnContext, index: ReturnType<typeof skillIndex>): boolean {
  return (context.executionSteps ?? []).some(step => {
    if (step.kind !== 'skills__load' || !matchesSystemSkillSelection(step, index, context.snapshotVersion?.requestVersion)) return false
    try {
      const output = JSON.parse(step.output!)
      if (output.receipts?.some((receipt: { action?: string; result?: { ok?: boolean; approval?: unknown; directive?: unknown; executionState?: string } }) =>
        receipt.action === 'skills.load' && receipt.result?.ok === true && receipt.result.approval === undefined
        && receipt.result.directive === undefined && receipt.result.executionState !== 'unknown')) return true
      // A large load is replaced by the runtime's successful receipt reference.
      // The full body comes from our matching current registry, never preview text.
      return output.truncated === true && output.observations?.length === 1
        && typeof output.observations[0].actionKey === 'string' && /^[a-f0-9]{64}$/.test(output.observations[0].sha256)
    } catch { return false }
  })
}

/** Artifact guidance must be read in an earlier model decision, including read-only tools. */
export function skillGuidanceDependencies(context: TurnContext) {
  const available = availableSystemSkills(context)
  return available.filter(({ skill }) => !skill.delivery && artifactSkills.some(artifact => artifact.name === skill.name && artifact.actions.some(action => action.startsWith('design.'))))
    .filter(({ index }) => !loadedSystemSkill(context, index))
}

export function firstActionRules(context: TurnContext): string {
  const entries = availableSystemSkills(context)
  if (!entries.length) return ''
  const blocked = new Set(skillGuidanceDependencies(context).flatMap(({ skill }) => skill.actions))
  return '\nCurrent authorized skill selection directory (registry-derived):\n' + JSON.stringify(entries.map(({ index }) => ({ ...index,
    selectionAction: index.delivery ? 'skills.activate' : 'skills.load',
    explanation: index.workflow?.explanationBeforeAuthoring ? 'optional; only for the requested explanation-before-authoring workflow with directly supplied facts' : 'not supported',
  })))
    + '\nFor a skill with no delivery, use skills.load even when creating work. Copy name/version/hash exactly. Complete the load or activation in an earlier decision; its full guidance appears next. A missing delivery is not a missing explanation. '
    + 'Read only existing business files from the current authorized product file listing (or refresh with the corresponding current/list tool); never guess a path or resource ID. After guidance, read its real format entry before authoring, then write and check the actual result. '
    + 'After a Design write, finish every artboard referenced by the index and run design.check. A satisfied result requires the latest check after the latest write to report problems:0; a plan or a partially written index is not delivery. '
    + (blocked.size ? '\nGuidance-dependent tools below are authorized but become callable only after the corresponding skill is loaded successfully. Their exact current schemas and scope are provided now for planning; do not call them in the selection batch:\n'
      + JSON.stringify(context.tools?.filter(tool => blocked.has(tool.action)).map(({ name, action, description, parameters, effect, preconditions }) =>
        ({ name, action, description, parameters, effect, ...(preconditions ? { preconditions } : {}) }))) : '')
}
