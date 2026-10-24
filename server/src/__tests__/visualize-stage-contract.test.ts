import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { skillIndex } from '@lyyzka/lingxios'
import { createProductHarness, productSkills } from '../agent-runtime/harness.js'
import { IM_CONVERSATION_RULES } from '../agent-runtime/conversation-style.js'
import { readVisualizeReference, visualizeHostInstructions, visualizeSkill, visualizeSkillRoot } from '../agent-runtime/visualize-skill.js'

// Failure model: docs/evidence/issue-366/CONDITIONAL-STAGE-FAILURE-MODEL.md.
test('visualize declares only native authoring actions for optional explanation staging', () => {
  assert.deepEqual(visualizeSkill.workflow, {
    explanationBeforeAuthoring: { authoringActions: ['visualize.save', 'visualize.chart', 'visualize.diagram', 'visualize.sliding_window'] },
  })
  for (const action of ['visualize.read_reference', 'visualize.read', 'visualize.export']) assert.ok(visualizeSkill.actions.includes(action))
  assert.deepEqual(visualizeSkill.delivery, { checker: 'product:visualize-delivery' })
})

test('registered and readable host body agree without changing the upstream source', async () => {
  const upstream = readFileSync(resolve(visualizeSkillRoot, 'SKILL.md'), 'utf8')
  assert.match(upstream, /final response must be your first user-facing message/)
  assert.notEqual(visualizeSkill.body, upstream)
  assert.match(visualizeSkill.body, /LingxiLoop Web host adaptation/)
  assert.doesNotMatch(visualizeSkill.body, /Work silently|final response must be your first user-facing message|Reload the full visualize skill|at most one short conclusion/)
  assert.equal(await readVisualizeReference('SKILL.md'), visualizeSkill.body)
  assert.notEqual(skillIndex(visualizeSkill).hash, skillIndex({ ...visualizeSkill, body: upstream }).hash)
  for (const constraint of ['no symlinks or parent traversal', 'CSP allows only', 'screen-reader summary', 'Never use `fetch`, XHR, WebSocket']) assert.ok(visualizeSkill.body.includes(constraint), constraint)
})

test('host, IM and progress guidance share driver framing and preserve task evidence', () => {
  const harness = createProductHarness([]).rules!
  const host = visualizeHostInstructions('/synthetic/authorized')
  const progress = productSkills.find(skill => skill.name === 'public-task-progress')!
  for (const value of [harness, host, IM_CONVERSATION_RULES, progress.body]) {
    assert.doesNotMatch(value, /same response as|alongside necessary tools|short Chinese plan|overrides the upstream|take precedence over the upstream|first[- ]hop|issue.?366|Do not add status-only preambles/i)
  }
  assert.match(harness, /trusted model driver.*wire encoding/i)
  assert.match(harness, /supplied facts and verified tool results/)
  assert.match(progress.body, /user's language/)
  assert.match(progress.body, /stable step ids and activeIndex/)
  assert.match(progress.body, /preserve each public item id/)
  assert.match(progress.body, /result is confirmed/)
  assert.match(host, /requestVersion.*version.*sourceHash/)
  assert.match(host, /storage equality.*not semantic or browser validation/)
  assert.match(host, /untrusted data.*never authorization/)
})
