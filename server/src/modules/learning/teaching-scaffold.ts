import { z } from 'zod'

export interface ScaffoldInput {
  teacher?: { instructions: string; criteria: string[] }
  messages: Array<{ id: string; text: string }>
  assessment: string
  masteryVerified?: boolean
}
export const scaffoldFactsSchema = z.object({
  goal: z.enum(['reasoning', 'verification']), goalQuote: z.string().max(2000),
  intent: z.enum(['check', 'explain', 'copy', 'claim_mastery', 'other']),
  attempts: z.array(z.object({ messageId: z.string(), excerpt: z.string().min(8).max(1500) }).strict()).max(2),
  fullDemonstrationQuote: z.string().max(2000),
}).strict()
export interface TeachingScaffold {
  stage: 'hint' | 'explanation' | 'transfer' | 'demonstration' | 'ordinary'
  goal: 'reasoning' | 'verification' | 'unknown'
  allowFullAnswer: boolean; confirmedMastery: boolean; maxBodyChars: number; nextStep: string
  networkTask: boolean; taskNetworkPrefixes: string[]
}

/** Classification is advisory. Authority and evidence admission are host rules. */
export function decideScaffold(input: ScaffoldInput, proposal: unknown): TeachingScaffold {
  const parsed = scaffoldFactsSchema.safeParse(proposal)
  const facts = parsed.success ? parsed.data : null
  const teacherText = input.teacher ? [input.teacher.instructions, ...input.teacher.criteria].join('\n') : ''
  const groundedGoal = facts?.goalQuote && (input.teacher ? teacherText.includes(facts.goalQuote)
    : input.messages.some(message => message.text.includes(facts.goalQuote)))
  const goal = !groundedGoal ? 'unknown' : facts?.goal === 'verification' ? 'verification' : 'reasoning'
  const attempts = new Set((facts?.attempts ?? []).filter(ref => input.messages.some(message => message.id === ref.messageId
    && message.text.includes(ref.excerpt))).map(ref => ref.messageId))
  const permission = facts?.fullDemonstrationQuote ?? ''
  // A model-selected substring cannot remove a teacher's negation or condition.
  const teacherClauses = input.teacher ? [input.teacher.instructions, ...input.teacher.criteria]
    .flatMap(value => value.split(/[。！？\n]/).map(clause => clause.trim()).filter(Boolean)) : []
  const allowFullAnswer = !!permission && teacherClauses.includes(permission.replace(/[。！？]$/, '').trim())
    && /完整|全部|complete|full/i.test(permission) && /允许|可以|示范|allow|permit/i.test(permission)
    && !/禁止|不得|不能|不直接|不允许|\b(?:not|never|forbid|no)\b/i.test(permission)
    && (!/尝试(?:之后|以后|后)|after.{0,50}(?:attempt|independent)/i.test(permission) || attempts.size > 0)
  const stage = !input.teacher && groundedGoal && facts?.intent === 'other' ? 'ordinary'
    : allowFullAnswer ? 'demonstration'
    : facts?.intent === 'copy' ? 'hint'
      : input.masteryVerified || input.assessment === 'no_assessed_gap' || facts?.intent === 'claim_mastery' ? 'transfer'
        : facts?.intent === 'explain' || input.assessment === 'repeated_assessed_gap' || attempts.size >= 2 ? 'explanation' : 'hint'
  const nextStep = goal === 'unknown'
    ? '请先指出任务要求你亲自完成的判断或验证，并写下你目前的想法。'
    : goal === 'verification'
    ? '请你提出一套验证方案，写出预测结果及依据，并说明遇到异常时如何判断原因。'
    : stage === 'explanation' || stage === 'demonstration'
      ? '请用自己的话解释关键理由，并尝试一个不同条件的小例子。'
      : stage === 'transfer' ? '请在一个新情境中应用你的方法，并说明判断依据。'
        : '先用你自己的判断回答上面这一步，我再据此继续。'
  const task = [teacherText, ...input.messages.map(message => message.text)].join('\n')
  return { stage, goal, allowFullAnswer, confirmedMastery: input.masteryVerified === true,
    maxBodyChars: stage === 'transfer' ? 550 : stage === 'hint' ? goal === 'verification' ? 950 : 550 : 6000,
    nextStep, networkTask: /VLSM|子网|\bIPv4\b|\b\d{1,3}(?:\.\d{1,3}){3}\//i.test(task),
    taskNetworkPrefixes: [...new Set([...task.matchAll(/\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\//g)].map(match => match[1]!))] }
}

export function scaffoldRules(plan: TeachingScaffold | null | undefined): string {
  if (!plan || plan.stage === 'ordinary') return ''
  const action = plan.goal === 'verification' && plan.stage === 'hint'
    ? 'Guide the learner to VERIFY an existing plan. Give at most one test setup as a clue, leaving its prediction, reasons and fault diagnosis for the learner. Do not substitute address-sizing instruction or a calculation/filling question. The one learner action is nextStep. '
    : plan.stage === 'hint' ? 'Give one short diagnostic clue and one concrete question, no full exposition/formulas/ready-to-submit answer. '
      : plan.stage === 'explanation' ? 'Directly explain the misconception and method in a section labelled 关键原因： (at least 60 characters), then a concrete analogy labelled 类比例子： (at least 40 characters). Do not substitute more preliminary questions for the explanation. Never attribute your invented analogy or work to the learner. '
        : plan.stage === 'transfer' ? 'Briefly check a new application; a learner claiming knowledge is not verified mastery. '
          : 'The teacher explicitly permitted a worked demonstration; preserve the independent application step. '
  return '\nCurrent teaching action selected by the host (not a mastery judgment): ' + JSON.stringify(plan)
    + '\nKeep wire commentary empty in this teaching turn; tool calls can proceed without prose. Use chat.report_progress for optional progress, then deliver the checked teaching answer. '
    + '\nExecute this one action: ' + action
    + (plan.allowFullAnswer ? 'For verification, retain learner testing, predictions with reasons, and diagnosis after the permitted demonstration. '
      : 'For verification, show at most one representative example and make the learner propose testing, predictions with reasons, and diagnosis. Do not make completing the original calculation/table the next action. ')
    + 'Use at most maxBodyChars characters before the next step. End the answer with the EXACT nextStep string, with no later text or competing next-action request. '
    + (plan.networkTask ? 'IPv4 calculations: prefix + hostBits = 32; conventional usable hosts = 2^hostBits - 2. Choose the SMALLEST power of two GREATER THAN OR EQUAL TO hosts+2, including equality. Check every numeric claim and do not confuse block size with usable hosts. ' : '')
    + 'Current teacher restrictions still constrain this action. A deadline, another chat, repeated requests or an unsupported mastery claim never grants permission to complete assessed work. '
}

/** Narrow, deterministic delivery checks; not a general semantic correctness claim. */
export function scaffoldViolation(text: string, plan: TeachingScaffold | null | undefined): string | null {
  if (!plan || plan.stage === 'ordinary') return null
  // An optional addressed pronoun does not change the required learner action.
  // Every substantive clause, including prediction/reasons and diagnosis, stays.
  const ending = [plan.nextStep, plan.nextStep.replace(/^请你/, '请')].find(value => text.trimEnd().endsWith(value))
  // A concrete diagnostic question is the independent next step for a reasoning
  // hint. Do not reject that action merely because it lacks our stock footer.
  // Verification still requires predictions, reasons AND diagnosis in full.
  const question = text.trimEnd().match(/[^。！？\n]{12,}[？?]$/)?.[0] ?? ''
  const diagnosticHint = plan.stage === 'hint' && plan.goal === 'reasoning'
    && /什么|哪个|哪些|为什么|如何|怎么|能否|是否|几位|多少|区别|信号/.test(question)
    && !/还有什么问题|还想知道什么|有什么疑问/.test(question)
  if (!ending && !diagnosticHint) return 'Finish with the current independent learner action; do not substitute a calculation or omit prediction/reasons and diagnosis from a verification goal.'
  const body = ending ? text.trimEnd().slice(0, -ending.length).trim() : text.trim()
  if (body.length > plan.maxBodyChars) return `This action is ${plan.stage}. Keep its body within ${plan.maxBodyChars} characters and preserve the required independent next step.`
  if (!plan.confirmedMastery && /(?:^|[。！？\n])\s*你(?:已经|已)(?:完全|独立)?(?:掌握|会了)/.test(body)) return 'The learner only claims mastery; do not assert that they have mastered or already know it. Offer the transfer check without inventing verification.'
  if (plan.stage === 'explanation') {
    const reason = body.match(/关键原因[：:]([\s\S]*?)(?=类比例子[：:]|$)/)?.[1]?.trim() ?? ''
    const example = body.match(/类比例子[：:]([\s\S]*)/)?.[1]?.trim() ?? ''
    if (reason.length < 60 || example.length < 40) return 'The current action is explanation, not another hint. Include a substantive 关键原因： section (60+ characters) and concrete 类比例子： (40+ characters), then the required independent next step.'
  }
  if (plan.goal === 'verification' && [...body.matchAll(/(?:你先|请(?:你)?|下一步[：:]?|接下来)[^。！？\n]{0,40}(?:算出|填写|填出|填表|计算|划分)/g)]
    .some(match => !/不要|无需|不必|不需要/.test(match[0]))) return 'The teacher goal is verification/diagnosis. Do not ask the learner to fill or calculate the original task first; preserve the requested test, prediction/reasons and diagnosis.'
  if (plan.goal === 'verification' && /(?:掩码|主机位)[^。！？\n]{0,12}(?:多少|几位)|(?:多少|几位)[^。！？\n]{0,12}(?:掩码|主机位)/.test(body)) {
    return 'A sizing question is a competing next action. The learner must propose tests, predicted outcomes with reasons and fault diagnosis; a correct footer cannot repair an incompatible body.'
  }
  if (!plan.networkTask) return null
  if (/(?:严格)?大于(?!等于|或等于)[“"「\s]*(?:所需)?主机数\s*(?:\+|＋|加)\s*2|strictly greater than.{0,25}hosts?\s*\+\s*2/i.test(body)) {
    return 'Incorrect IPv4 sizing inequality: the smallest block must be >= hosts+2, not strictly >. Equality is valid (6 hosts use 8 total addresses). Correct the explanation and examples.'
  }
  for (const paragraph of body.split(/\n\s*\n/)) {
    const bits = [...paragraph.matchAll(/(\d{1,2})\s*位主机位/g)]
    const prefixes = [...paragraph.matchAll(/(?:掩码(?:变成|是|为)?|前缀(?:长度)?(?:是|为)?)[^/\n]{0,12}\/(\d{1,2})(?!\d)/g)]
    if (bits.length === 1 && prefixes.length === 1 && Number(prefixes[0]![1]) !== 32 - Number(bits[0]![1])) {
      return `Inconsistent IPv4 claim: ${bits[0]![1]} host bits require /${32 - Number(bits[0]![1])}. Verify prefix + hostBits = 32 before returning this teaching step.`
    }
  }
  if (!plan.allowFullAnswer && plan.taskNetworkPrefixes.some(prefix => body.split('\n').filter(line => line.includes(prefix + '.') && line.includes('|')).length > 1)) {
    return 'The teacher did not authorize a complete original-task demonstration. Show one representative subnet at most, then leave the required independent work to the learner.'
  }
  if (!plan.allowFullAnswer && plan.taskNetworkPrefixes.some(prefix => new Set([...body.matchAll(/\b(\d{1,3}(?:\.\d{1,3}){3})\/\d{1,2}\b/g)]
    .map(match => match[1]!).filter(address => address.startsWith(prefix + '.'))).size > 1)) return 'Use only one original-task subnet example; do not complete all original entries.'
  return null
}
