import assert from 'node:assert/strict'
import test from 'node:test'
import { roleAllowsAction } from '../agent-os/role-policy.js'
import { assembleAgentSystemPrompt } from '../agent-os/prompt-assembly.js'
import { IPYTHON_TOOL } from '../agent-os/tool.js'
import { preferredCoordinatorPreset } from '../learning/service.js'

const emptyMemory={learner:[],course:[],agentRole:[]}

test('runtime execution role, not persona name, selects the Frontier workflow',()=>{
  const prompt=assembleAgentSystemPrompt({persona:{name:'Trace',role:'Diagnostician',instructions:'Diagnose.'},capabilities:['learning'],memories:emptyMemory,assembledAt:'2026-08-26T00:00:00.000Z',executionRole:'reporter'})
  assert.match(prompt,/# Frontier-style Reporter Workflow/)
  assert.doesNotMatch(prompt,/# Frontier-style Verifier Workflow/)
})

test('Mission kind chooses the deterministic default coordinator persona',()=>{
  assert.equal(preferredCoordinatorPreset('study'),'nova')
  assert.equal(preferredCoordinatorPreset('research'),'scout')
  assert.equal(preferredCoordinatorPreset('project'),'forge')
})

test('verifier and reporter Host action policies are least privilege',()=>{
  assert.equal(roleAllowsAction('verifier','canvas.submit_report'),true)
  assert.equal(roleAllowsAction('verifier','learning.record_attempt'),false)
  assert.equal(roleAllowsAction('reporter','canvas.start_workspace'),false)
  assert.equal(roleAllowsAction('reporter','canvas.get'),true)
})

test('model-visible tool remains the single IPython function',()=>{
  assert.equal(IPYTHON_TOOL.function.name,'ipython')
})
