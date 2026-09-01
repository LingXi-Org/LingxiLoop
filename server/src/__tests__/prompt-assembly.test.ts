import assert from 'node:assert/strict'
import test from 'node:test'
import { assembleAgentSystemPrompt, PROMPT_SOURCE_BASELINES } from '../agent-os/prompt-assembly.js'

test('prompt assembly records the exact source baselines', () => {
  assert.equal(PROMPT_SOURCE_BASELINES.frontierAgent, 'ef326d07207e8ab4adacfa63861f7a76813192b5')
  assert.equal(PROMPT_SOURCE_BASELINES.grokPrompts, 'a7c186f5ccac95875c0041aed60398f6ecb6d6c7')
  assert.equal(PROMPT_SOURCE_BASELINES.systemPromptsLeaks, 'cf732468e54f62f23f46e7c277992626a7f8bf9e')
})

test('prompt ordering keeps turn data out of the stable policy and puts personality last', () => {
  const prompt = assembleAgentSystemPrompt({
    persona: { name: 'Nova', role: 'Learning Coordinator', instructions: 'Coordinate learning.' },
    capabilities: ['learning', 'canvas', 'knowledge'],
    executionRole:'coordinator',
  })
  const policy = prompt.indexOf('<policy>')
  const behaviour = prompt.indexOf('# Response and Writing Behaviour')
  const workflow = prompt.indexOf('# Frontier-style Coordinator Workflow')
  const tools = prompt.indexOf('# IPython and Tool Contract')
  const personality = prompt.indexOf('# Role Personality')
  assert.ok(policy >= 0 && policy < behaviour && behaviour < workflow && workflow < tools && tools < personality)
  assert.doesNotMatch(prompt, /# User Information|# Current Date/)
  assert.match(prompt, /finish_planning/)
  assert.match(prompt, /add_steps\(missionId=mission\["id"\], steps=/)
  assert.match(prompt, /every step needs its own non-empty description and successCriteria/)
  assert.match(prompt, /Canvas is the only fan-out\/fan-in surface/)
  assert.match(prompt, /loop\.chat\.ask/)
  assert.match(prompt, /only when missing user input truly blocks progress/)
  assert.match(prompt, /loop\.polls\.create/)
  assert.match(prompt, /cohesive natural paragraphs/)
  assert.match(prompt, /formal document, sourced research/)
  assert.match(prompt, /explicit request to create, recreate, reschedule, or revise a weekly study plan is sufficient authorization/)
  assert.match(prompt, /start_mission\(goal=\.\.\., successCriteria=\.\.\., missionKind="STUDY", explicit=True\)/)
  assert.match(prompt, /A weekly plan alone does not justify Canvas or specialist dispatch/)
  assert.match(prompt, /Never announce that a product action, specialist task, Canvas workspace, or durable plan has started/)
})

test('explicit execution role selects verifier or specialist contract independently of persona name', () => {
  const trace = assembleAgentSystemPrompt({
    persona: { name: 'Trace', role: 'Learning Diagnostician', instructions: 'Verify.' },
    capabilities: ['learning'],
    executionRole:'verifier',
  })
  const sage = assembleAgentSystemPrompt({
    persona: { name: 'Sage', role: 'Concept Tutor', instructions: 'Teach.' },
    capabilities: ['learning'],
    executionRole:'specialist',
  })
  assert.match(trace, /# Frontier-style Verifier Workflow/)
  assert.match(trace, /Disconfirming evidence:/)
  assert.match(sage, /# Frontier-style Specialist Workflow/)
  assert.match(sage, /Recommended next step:/)
  const traceAsSpecialist=assembleAgentSystemPrompt({persona:{name:'Trace',role:'Diagnostician',instructions:'Diagnose.'},capabilities:['learning'],executionRole:'specialist'})
  assert.match(traceAsSpecialist, /# Frontier-style Specialist Workflow/)
})

test('Pulse follows the teacher operations workflow with no learner surface',()=>{
  const prompt=assembleAgentSystemPrompt({persona:{name:'Pulse · Algebra',role:'Teacher Operations',instructions:'Be exact.'},capabilities:['teacher_admin'],executionRole:'coordinator'})
  assert.ok(prompt.indexOf('<policy>')<prompt.indexOf('# Frontier-style Teacher Operations Workflow'))
  assert.ok(prompt.indexOf('# Frontier-style Teacher Operations Workflow')<prompt.indexOf('# IPython and Tool Contract'))
  assert.match(prompt,/preloaded `loop\.teacher` SDK/)
  assert.match(prompt,/Observe current Host-scoped state/)
  assert.match(prompt,/Anti-spin/)
  assert.doesNotMatch(prompt,/loop\.learning|Canvas is the only fan-out/)
  assert.doesNotMatch(prompt,/loop\.turn/)
})
