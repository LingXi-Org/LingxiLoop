import { skillIndex, type CapabilityGrant, type SkillDefinition, type TurnContext } from '@lyyzka/lingxios'
import { productSkills } from './system-skills.js'
import { visualizeSkillAdaptations } from './visualize-skill.js'

// Registered instruction bytes only; no model-supplied or stored output becomes rules.
// Match the runtime's per-skill bound for the entire selected set as well.
const MAX_SELECTED_BYTES = 64_000
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
    if (step.requestVersion !== context.snapshotVersion?.requestVersion || step.output === undefined) continue
    if (!['skills__load', 'skills__activate', 'visualize__read_reference'].includes(step.kind)) continue
    let args: Record<string, unknown>
    try { args = JSON.parse(String(step.input.arguments)) } catch { continue }
    if (!args || typeof args !== 'object' || Array.isArray(args)) continue
    // Activation is also an explicit selection of this exact authored contract.
    // Supply its complete registered guidance next turn without a redundant
    // load. This only selects rules: native activation owns the durable
    // obligation, authorization, cancellation and request-version checks.
    const match = available.find(({ skill, index }) => step.kind === 'skills__load' || step.kind === 'skills__activate'
      ? (step.kind === 'skills__activate' ? !!skill.delivery && permitted('skills.activate') : permitted('skills.load'))
        && Object.keys(args).sort().join(',') === 'hash,name,version' && args.name === index.name && args.version === index.version && args.hash === index.hash
      : permitted('visualize.read_reference') && index.name === 'visualize' && Object.keys(args).join(',') === 'path' && args.path === 'SKILL.md')
    if (match) selected.add(match.index.name)
  }
  const chosen = available.filter(({ index }) => selected.has(index.name))
  if (!chosen.length) return ''
  const rules = chosen.map(({ skill, index: { name, version, hash } }) =>
    `\n\nComplete system skill ${JSON.stringify({ name, version, hash })}:\n${skill.body}\nEnd of complete system skill.`
    + (name === 'visualize' ? `\n${visualizeSkillAdaptations}` : '')).join('')
    + '\nThe host supplies these current registered bodies in full independently of tool previews or failures. This is guidance, not proof of tool success or permission. Do not reload or paginate these skills; they remain complete in each current prompt after compaction. Read other required references on demand; never claim missing reference content was read.\n'
  if (Buffer.byteLength(rules, 'utf8') > MAX_SELECTED_BYTES) throw new Error('selected system skills exceed the complete-context budget')
  return rules
}
