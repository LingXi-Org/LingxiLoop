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
  return false
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
    if (!['skills__load', 'skills__activate'].includes(step.kind)) continue
    // Activation is also an explicit selection of this exact authored contract.
    // Supply its complete registered guidance next turn without a redundant
    // load. This only selects rules: native activation owns the durable
    // obligation, authorization, cancellation and request-version checks.
    const match = available.find(({ skill, index }) => (step.kind === 'skills__activate' ? !!skill.delivery && permitted('skills.activate') : permitted('skills.load'))
      && matchesSystemSkillSelection(step, index, context.snapshotVersion?.requestVersion, context))
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

/** A model decision recorded through the native read tool, scoped by the
 * current request and confirmed receipt. Never inferred from answer prose. */
export function explanationPlan(context: TurnContext): 'canvas' | 'text' | 'other' | undefined {
  const steps = context.executionSteps ?? []
  for (const step of steps) {
    if (step.kind !== 'design__plan_explanation' || step.requestVersion !== context.snapshotVersion?.requestVersion) continue
    try {
      const args = JSON.parse(String(step.input.arguments)), output = JSON.parse(step.output ?? '{}')
      if (!['canvas', 'text', 'other'].includes(args.delivery)) continue
      if (output.receipts?.some((receipt: {action?: string;result?: {ok?: boolean;approval?: unknown;directive?: unknown;executionState?: string;value?: {delivery?: string}}}) =>
        receipt.action === 'design.plan_explanation' && receipt.result?.ok === true && receipt.result.approval === undefined
        && receipt.result.directive === undefined && receipt.result.executionState !== 'unknown' && receipt.result.value?.delivery === args.delivery)) return args.delivery
    } catch { /* Failed, stale or unreadable decisions do not bind the response. */ }
  }
  return undefined
}

export function explanationPlanningAvailable(context: TurnContext): boolean {
  const grants: CapabilityGrant[] = context.grants ?? context.capabilities.map(name => ({name}))
  return context.work.kind === 'turn' && !context.work.conversation?.internal && !context.dynamic?.artifactRun
    && availableSystemSkills(context).some(({skill}) => skill.actions.includes('design.write_files'))
    && context.tools?.some(tool => tool.action === 'design.plan_explanation') === true
    && grants.some(grant => grant.name === 'design'
      && (!grant.methods || grant.methods.includes('plan_explanation')))
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
    + designExplanationRules(context)
    + 'Read only existing business files from the current authorized product file listing (or refresh with the corresponding current/list tool); never guess a path or resource ID. After guidance, read its real format entry before authoring, then write and check the actual result. '
    + 'After a Design write, finish every artboard referenced by the index and run design.check. A satisfied result requires the latest check after the latest write to report problems:0; a plan or a partially written index is not delivery. '
    + (blocked.size ? '\nGuidance-dependent tools below are authorized but become callable only after the corresponding skill is loaded successfully. Their exact current schemas and scope are provided now for planning; do not call them in the selection batch:\n'
      + JSON.stringify(context.tools?.filter(tool => blocked.has(tool.action)).map(({ name, action, description, parameters, effect, preconditions }) =>
        ({ name, action, description, parameters, effect, ...(preconditions ? { preconditions } : {}) }))) : '')
}

/** Semantic selection belongs to the model. No keyword heuristic or forced
 * generic skills.load can decide which skill the human's task needs. */
export function designExplanationRules(context: TurnContext): string {
  const design = availableSystemSkills(context).find(({ skill }) => skill.actions.includes('design.write_files'))
  const internal = context.work.conversation?.internal || context.work.kind !== 'turn'
  if (internal) return ''
  if (!design) return ' Design is unavailable in the current authorized skill directory. Give a useful text explanation when appropriate; disclose the limitation if a canvas was requested. Never claim a canvas was created or grant yourself a missing capability. '
  const loaded = loadedSystemSkill(context, design.index)
  const plan = explanationPlan(context)
  return '\nUse the current conversation’s editable Design canvas proactively when an explanation has several connected ideas, needs decomposition, or is broad enough that a readable visual structure helps. Judge the meaning and complexity of the request, not the presence of any canvas keyword. Introductory teaching, mechanisms, relationships, processes, comparisons, tradeoffs and other explainable structures qualify even when the person never mentions Design. Do not ask permission each time. '
    + (explanationPlanningAvailable(context) ? plan ? `The current request’s recorded response decision is ${plan}. `
      : 'First call design.plan_explanation to choose canvas, text or another requested deliverable from the actual meaning of the request. This is a bounded semantic decision, not a keyword test and not delivery. Do not repeat the decision after a successful receipt. ' : '')
    + 'Keep greetings and direct factual answers in text. Respect an explicit text-only request or another requested deliverable (for example Slides or an existing document). In homework and teacher contexts retain all current authorship, frozen teacher requirements and audience restrictions: explain methods and analogous examples, never turn a canvas into a copy-ready homework answer or proof of mastery. '
    + (loaded ? 'The exact Design skill is already successfully loaded for this request; continue with its tools without reloading it. '
      : `When this semantic decision calls for Design, your first Design action is skills.load with exactly ${JSON.stringify({ name: design.index.name, version: design.index.version, hash: design.index.hash })}. Loading a different skill does not select Design. Never repeat an identical failed load without a changed cause; provide useful text and the actual limitation if guidance is unavailable. `)
    + 'Then read the real format reference and current canvas/files. If design.current returns null, call the authorized design.ensure to initialize this conversation’s one canvas and discover its actual files before reading them. Write complete explanatory content into this conversation’s canvas, preserve existing boards and human edits using their current sha256, and run design.check after the final write. Use a new artboard for an unrelated explanation rather than replacing existing work. A successful save plus a zero-problem check is required before saying the canvas is ready. In your final answer name the actual artboard and tell the person to open Design in this conversation; include a short substantive explanation. A plan, skill load, tool attempt or empty board is not delivery. On cancellation stop; on access denial or tool failure preserve saved content, state what actually completed, and give a useful text answer without claiming an unsaved or unchecked canvas is finished. '
}
