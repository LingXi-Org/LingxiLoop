import assert from 'node:assert/strict'
import test from 'node:test'
import { roleAllowsAction } from '../agent-os/role-policy.js'
import { assembleAgentSystemPrompt } from '../agent-os/prompt-assembly.js'
import { IPYTHON_TOOL_NAME } from '../../../third_party/lingxios/src/protocol/constants.js'
import { learningContextContract } from '../agent-os/runtime.js'
import { preferredLearningMissionCoordinator } from '../modules/learning/application.js'

test('runtime execution role, not persona name, selects the Frontier workflow',()=>{
  const prompt=assembleAgentSystemPrompt({persona:{name:'Trace',role:'Diagnostician',instructions:'Diagnose.'},capabilities:['learning'],executionRole:'reporter'})
  assert.match(prompt,/# Frontier-style Reporter Workflow/)
  assert.doesNotMatch(prompt,/# Frontier-style Verifier Workflow/)
})

test('Mission kind chooses the deterministic default coordinator persona',()=>{
  assert.equal(preferredLearningMissionCoordinator('STUDY'),'nova')
  assert.equal(preferredLearningMissionCoordinator('RESEARCH'),'scout')
  assert.equal(preferredLearningMissionCoordinator('PROJECT'),'forge')
})

test('verifier and reporter Host action policies are least privilege',()=>{
  assert.equal(roleAllowsAction('verifier','canvas.submit_report'),true)
  assert.equal(roleAllowsAction('verifier','learning.record_attempt'),false)
  assert.equal(roleAllowsAction('reporter','canvas.start_workspace'),false)
  assert.equal(roleAllowsAction('reporter','canvas.get'),true)
  assert.equal(roleAllowsAction('reporter','learning.list_knowledge_units'),true)
})

test('Project learning SDK contract exposes canonical names and exact uppercase enums',()=>{
  const contract=learningContextContract()
  assert.match(contract,/list_knowledge_units\(\)/)
  assert.match(contract,/draft_knowledge_units\(knowledgeUnits=/)
  assert.match(contract,/missionKind="STUDY\|RESEARCH\|PROJECT"/)
  assert.match(contract,/kind="LEARN\|PRACTICE\|CHECK\|REFLECT"/)
  assert.doesNotMatch(contract,/list_objectives|draft_objectives|missionKind="study/)
})

test('model-visible tool remains the single IPython function',()=>{
  assert.equal(IPYTHON_TOOL_NAME,'ipython')
})
