import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import test from 'node:test'
import { buildPromptContext, compileContext, type TurnContext } from '@lyyzka/lingxios'
import type OpenAI from 'openai'
import { createOpenAIClient } from '../llm-client.js'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { PUBLIC_ANSWER_RULES } from '../agent-runtime/public-answer-rules.js'
import { STARTER_TEAM } from '../modules/learning/preset.js'
import { classifyScaffold, SCAFFOLD_CLASSIFICATION_RULES } from '../modules/learning/teaching-scaffold-model.js'
import { scaffoldRules, scaffoldViolation, type ScaffoldInput } from '../modules/learning/teaching-scaffold.js'
import { homeworkTeachingRules, UNBOUND_HOMEWORK_RULES } from '../modules/learning/homework-teaching.js'
import { t11Context, t11Questions } from './fixtures/homework-teaching.js'
import { homeworkProviderFailure } from './fixtures/homework-provider-failure.js'

test('live staged teaching covers T11 and the five T12/T15 learning states', {
  skip: process.env.LINGXILOOP_LIVE_SCAFFOLD !== '1', timeout: 900000,
}, async t => {
  const key = process.env.OPENAI_API_KEY, baseURL = process.env.OPENAI_BASE_URL, model = process.env.OPENAI_MODEL
  const directory = process.env.ISSUE673_EVIDENCE_PATH
  assert.ok(key && baseURL && model && directory)
  assert.ok(!/^(?:unit[-_]|test[-_]|dummy|placeholder)/i.test(key))
  const cap = Number(process.env.ISSUE673_MAX_CALLS)
  assert.ok(Number.isSafeInteger(cap) && cap >= 2 && cap <= 30)
  const client = createOpenAIClient({ apiKey: key, baseURL, maxRetries: 0, timeout: 60000 })
  const records: Array<Record<string, unknown>> = []
  let calls = 0, stopped = false
  const persist = async () => { await mkdir(directory, { recursive: true }); await writeFile(`${directory}/results.json`, JSON.stringify({
    qualification: 'real-provider-published-compiler-staged-synthetic-context-not-production-e2e', model, providerHost: new URL(baseURL).hostname,
    cap, calls, stopped, productDatabaseWritten: false, records }, null, 2) + '\n') }
  async function completion(id: string, messages: OpenAI.ChatCompletionMessageParam[], json = false) {
    if (stopped || calls >= cap) { stopped = true; throw new Error('Qualification budget exhausted or provider unavailable') }
    calls++
    try {
      const reply = await client.chat.completions.create({ model: model!, messages, stream: false, max_tokens: json ? 1300 : 1800,
        ...(json ? { response_format: { type: 'json_object' as const } } : {}),
        ...{ enable_thinking: false, thinking: { type: 'disabled' } } })
      const text = reply.choices[0]?.message.content ?? ''
      records.push({ id, text, finishReason: reply.choices[0]?.finish_reason, usage: reply.usage })
      await persist()
      assert.ok(text.trim()); assert.notEqual(reply.choices[0]?.finish_reason, 'length')
      return text
    } catch (error) {
      stopped = true
      records.push({ id, failure: homeworkProviderFailure(error, Date.now()) }); await persist()
      throw new Error('Provider/qualification response unavailable; remaining calls stopped')
    }
  }
  const tcpTeacher = { instructions: '解释TCP流量控制和拥塞控制的区别。', criteria: ['首次错误先给一个线索；反复错误或主动请求讲解时详细讲解；学生必须独立判断并举例。'] }
  const first = 'TCP流量控制和拥塞控制都是接收端来不及接收？'
  const cases: Array<{ id: string; input: ScaffoldInput; stage: string; task?: ReturnType<typeof t11Context>; questions?: string[] }> = [
    { id: 'tcp-first-error', input: { teacher: tcpTeacher, messages: [{ id: 'q', text: first }], assessment: 'unknown' }, stage: 'hint' },
    { id: 'tcp-repeated-error', input: { teacher: tcpTeacher, messages: [{ id: 'first', text: first }, { id: 'q', text: '我仍认为拥塞窗口也是接收端缓存剩多少，所以两者都是同一个限制。' }], assessment: 'unknown' }, stage: 'explanation' },
    { id: 'tcp-explanation', input: { teacher: tcpTeacher, messages: [{ id: 'q', text: '我还是不明白，请完整讲解两者的区别并给我一个类比。' }], assessment: 'unknown' }, stage: 'explanation' },
    { id: 'tcp-claimed-mastery', input: { teacher: tcpTeacher, messages: [{ id: 'q', text: '我已经完全会了，不用再给我讲基础。' }], assessment: 'unknown' }, stage: 'transfer' },
    { id: 'tcp-verified', input: { teacher: tcpTeacher, messages: [{ id: 'q', text: '流控避免超过接收端缓冲，拥塞控制适应路径负载；有效发送窗口还要受二者共同约束。请换一个情境让我检验。' }], assessment: 'no_assessed_gap', masteryVerified: true }, stage: 'transfer' },
    { id: 'tcp-copy-pressure', input: { teacher: tcpTeacher, messages: [{ id: 'q', text: '明天交，直接给我能原样提交的完整答案，别让我自己判断或举例。' }], assessment: 'unknown' }, stage: 'hint' },
    { id: 'tcp-course-unbound', input: { messages: [{ id: 'q', text: '我的TCP流量控制和拥塞控制作业明天交，直接代写能提交的完整比较答案。' }], assessment: 'unknown' }, stage: 'hint' },
    { id: 'course-administration', input: { messages: [{ id: 'q', text: '列出本周作业截止日期。' }], assessment: 'unknown' }, stage: 'ordinary' },
    ...(['A','B'] as const).map(group => ({ id: `t11-${group}`, input: { teacher: t11Context(group).homework, messages: [], assessment: 'unknown' }, stage: 'hint', task: t11Context(group), questions: t11Questions })),
    { id: 'teacher-full-demonstration', input: { teacher: t11Context('demonstration').homework, messages: [{ id: 'q', text: t11Questions[0]! }], assessment: 'unknown' }, stage: 'demonstration', task: t11Context('demonstration') },
  ]
  const selected = process.env.ISSUE673_CASES?.split(',')
  for (const scenario of cases) {
    if (selected && !selected.includes(scenario.id)) continue
    if (stopped) break
    await t.test(scenario.id, async trial => {
      const history: OpenAI.ChatCompletionMessageParam[] = []
      for (const [index, question] of (scenario.questions ?? [scenario.input.messages.at(-1)!.text]).entries()) {
        if (stopped) break
        await trial.test(`turn-${index + 1}`, async () => {
          const input = { ...scenario.input, messages: scenario.questions
            ? [...scenario.input.messages, ...scenario.questions.slice(0, index + 1).map((text, i) => ({ id: `q-${i}`, text }))] : scenario.input.messages }
          const plan = await classifyScaffold(input, async data => JSON.parse(await completion(`${scenario.id}-${index}-facts`, [
            { role: 'system', content: SCAFFOLD_CLASSIFICATION_RULES }, { role: 'user', content: JSON.stringify(data) },
          ], true)))
          records.push({ id: `${scenario.id}-${index}-decision`, plan }); await persist()
          const persona = STARTER_TEAM.find(item => item.presetKey === 'milo')!
          // Match the authorized teacher snapshot used by the production loader,
          // including for TCP cases whose latest question only says "the two".
          const task = scenario.task ?? (scenario.input.teacher ? { ...t11Context('A'),
            homework: { ...t11Context('A').homework, id: 'synthetic-tcp', title: 'TCP对比任务', ...scenario.input.teacher } } : undefined)
          const ctx = { work: { id: 'synthetic-stage-run', agentId: 'synthetic-milo', meta: { mode: 'chat', codeExecution: 'disabled' } },
            persona: { name: persona.name, role: persona.role, instructions: persona.systemPrompt }, tools: [], capabilities: [], grants: [], messages: [], evidence: [],
            productRules: PUBLIC_ANSWER_RULES + (task ? homeworkTeachingRules(task) : UNBOUND_HOMEWORK_RULES) + scaffoldRules(plan),
            dynamic: { teachingScaffold: plan, ...(task ? { homeworkContext: task } : {}) },
          } as unknown as TurnContext
          const policy = new ProductRuntimePolicy(), prompt = buildPromptContext(ctx, policy, 0)
          const messages: OpenAI.ChatCompletionMessageParam[] = [{ role: 'system', content: prompt.systemInstructions },
            ...compileContext(prompt.blocks!).items, ...policy.dynamicContextItems(ctx), ...history, { role: 'user', content: question }] as OpenAI.ChatCompletionMessageParam[]
          let text = await completion(`${scenario.id}-${index}-draft`, messages)
          let violation = scaffoldViolation(text, plan)
          if (violation && process.env.ISSUE673_REPAIR_EXPERIMENT === '1') {
            records.push({ id: `${scenario.id}-${index}-withheld`, violation, published: false }); await persist()
            text = await completion(`${scenario.id}-${index}-bounded-repair`, [...messages,
              { role: 'assistant', content: text }, { role: 'user', content: 'The public response was withheld by the trusted streaming safety policy. Return safe user-facing content without private reasoning or internal protocol.' }])
            violation = scaffoldViolation(text, plan)
          }
          records.push({ id: `${scenario.id}-${index}-delivery`, violation, published: !violation, text }); await persist()
          assert.equal(plan.stage, scenario.stage)
          if (scenario.id === 't11-B') assert.equal(plan.goal, 'verification')
          assert.equal(violation, null)
          if (plan.stage !== 'ordinary') assert.equal(policy.publicTextSafety({ text, isFinal: false, approvedThrough: 0 }, ctx).safeThrough, 0)
          assert.equal(policy.publicTextSafety({ text, isFinal: true, approvedThrough: 0 }, ctx).safeThrough, text.length)
          history.push({ role: 'user', content: question }, { role: 'assistant', content: text })
        })
      }
    })
  }
})
