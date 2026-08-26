import assert from 'node:assert/strict'
import test from 'node:test'
import { assembleAgentSystemPrompt, PROMPT_SOURCE_BASELINES } from '../agent-os/prompt-assembly.js'

const memories = {
  learner: [{
    id: 'm1', scopeType: 'learner' as const, scopeId: 'u1', body: 'prefers visual examples',
    kind: 'preference', origin: 'explicit' as const, pinned: false, sourceEventIds: ['e1'],
    version: 1, confidence: 1, updatedAt: '2026-08-26T00:00:00.000Z',
  }],
  course: [],
  agentRole: [],
}

test('prompt assembly records the exact source baselines', () => {
  assert.equal(PROMPT_SOURCE_BASELINES.frontierAgent, 'ef326d07207e8ab4adacfa63861f7a76813192b5')
  assert.equal(PROMPT_SOURCE_BASELINES.grokPrompts, 'a7c186f5ccac95875c0041aed60398f6ecb6d6c7')
})

test('grok-style prompt ordering keeps stable policy first and user information last', () => {
  const prompt = assembleAgentSystemPrompt({
    persona: { name: 'Nova', role: 'Learning Coordinator', instructions: 'Coordinate learning.' },
    capabilities: ['learning', 'canvas', 'knowledge'], memories,
    executionRole:'coordinator',
    assembledAt: '2026-08-26T08:00:00.000Z',
  })
  const policy = prompt.indexOf('<policy>')
  const tools = prompt.indexOf('# Available Tool Surface')
  const workflow = prompt.indexOf('# Frontier-style Coordinator Workflow')
  const personality = prompt.indexOf('# Role Personality')
  const userInfo = prompt.indexOf('# User Information')
  const date = prompt.indexOf('# Current Date')
  assert.ok(policy >= 0 && policy < tools && tools < workflow && workflow < personality && personality < userInfo && userInfo < date)
  assert.match(prompt, /finish_planning/)
  assert.match(prompt, /Canvas is the only fan-out\/fan-in surface/)
  assert.match(prompt, /loop\.chat\.ask/)
  assert.match(prompt, /loop\.polls\.create/)
})

test('explicit execution role selects verifier or specialist contract independently of persona name', () => {
  const trace = assembleAgentSystemPrompt({
    persona: { name: 'Trace', role: 'Learning Diagnostician', instructions: 'Verify.' },
    capabilities: ['learning'], memories: { learner: [], course: [], agentRole: [] },
    executionRole:'verifier',
    assembledAt: '2026-08-26T08:00:00.000Z',
  })
  const sage = assembleAgentSystemPrompt({
    persona: { name: 'Sage', role: 'Concept Tutor', instructions: 'Teach.' },
    capabilities: ['learning'], memories: { learner: [], course: [], agentRole: [] },
    executionRole:'specialist',
    assembledAt: '2026-08-26T08:00:00.000Z',
  })
  assert.match(trace, /# Frontier-style Verifier Workflow/)
  assert.match(trace, /Disconfirming evidence:/)
  assert.match(sage, /# Frontier-style Specialist Workflow/)
  assert.match(sage, /Recommended next step:/)
  const traceAsSpecialist=assembleAgentSystemPrompt({persona:{name:'Trace',role:'Diagnostician',instructions:'Diagnose.'},capabilities:['learning'],memories:{learner:[],course:[],agentRole:[]},assembledAt:'2026-08-26T08:00:00.000Z',executionRole:'specialist'})
  assert.match(traceAsSpecialist, /# Frontier-style Specialist Workflow/)
})

test('Pulse follows grok ordering with the Frontier teacher operations workflow and no learner surface',()=>{
  const prompt=assembleAgentSystemPrompt({persona:{name:'Pulse · Algebra',role:'Teacher Operations',instructions:'Be exact.'},capabilities:['teacher_admin'],memories:{learner:[],course:[],agentRole:[]},executionRole:'coordinator',assembledAt:'2026-08-26T08:00:00.000Z'})
  assert.ok(prompt.indexOf('<policy>')<prompt.indexOf('# Available Tool Surface'))
  assert.ok(prompt.indexOf('# Available Tool Surface')<prompt.indexOf('# Frontier-style Teacher Operations Workflow'))
  assert.match(prompt,/exactly `loop\.teacher` and `loop\.turn`/)
  assert.match(prompt,/Observe current Host-scoped state/)
  assert.match(prompt,/Anti-spin/)
  assert.doesNotMatch(prompt,/loop\.learning|Canvas is the only fan-out/)
})
