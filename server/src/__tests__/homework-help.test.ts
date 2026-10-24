import assert from 'node:assert/strict'
import test from 'node:test'
import { homeworkHelpPlan, homeworkHelpRules, type HelpAssessment } from '../modules/learning/homework-help.js'

const criteria = ['解释子网地址数量', '独立验证边界']
const state = { assessmentId: 'current', evidenceRevision: 3, returnEpoch: 1 }
const assessment = (id: string, revision: number, messageId: string, sequence: number, met = false): HelpAssessment => ({
  id, evidenceRevision: revision, returnEpoch: 1, status: 'READY', selectedMessageIds: [messageId], available: true,
  result: { criteria: criteria.map(criterion => ({ criterion, met, independent: false, feedback: '核对地址数量' })),
    completion: '', assistance: '', independence: '', weaknesses: [], evidence: [{ messageId, excerpt: '我的计算' }] },
  messages: [{ messageId, role: 'user', text: '我的计算是 32', sequence }],
})

test('a first supported gap gets a brief clue, repeated supported work gets explanation and an independent next step', () => {
  const first = assessment('current', 3, 'work-2', 20)
  const once = homeworkHelpPlan({ criteria, ...state, assessments: [first] })
  assert.deepEqual(once, { defaultDepth: 'brief_clue', basis: 'assessed_gap', criterionIndex: 0, observedAssessments: 1 })
  const repeated = homeworkHelpPlan({ criteria, ...state, assessments: [first, assessment('previous', 2, 'work-1', 10)] })
  assert.deepEqual(repeated, { defaultDepth: 'explanation', basis: 'repeated_assessed_gap', criterionIndex: 0, observedAssessments: 2 })
  const rules = homeworkHelpRules(repeated)
  assert.match(rules, /analogous example/)
  assert.match(rules, /independent next step/)
  assert.match(rules, /teacher requirements and current feedback/)
})

test('same receipt, reused quotes and older work never become repeated attempts', () => {
  const current = assessment('current', 3, 'same-work', 10)
  for (const previous of [current, assessment('previous', 2, 'same-work', 10), assessment('previous', 2, 'newer-work', 20)]) {
    const plan = homeworkHelpPlan({ criteria, ...state, assessments: [current, previous] })
    assert.equal(plan.defaultDepth, 'brief_clue')
    assert.equal(plan.observedAssessments, 1)
  }
  const selectedButNotCited = { ...assessment('current', 3, 'same-work', 10), selectedMessageIds: ['different-work'] }
  assert.equal(homeworkHelpPlan({ criteria, ...state, assessments: [selectedButNotCited] }).basis, 'unknown')
})

test('old epochs, pending/invalid results, missing evidence and default unmet criteria remain unknown', () => {
  const valid = assessment('current', 3, 'work', 10)
  const invalid: HelpAssessment[] = [
    { ...valid, returnEpoch: 0 }, { ...valid, status: 'PENDING' }, { ...valid, status: 'INVALID' },
    { ...valid, available: false }, { ...valid, id: 'old' }, { ...valid, evidenceRevision: 2 },
    { ...valid, result: { criteria: criteria.map(criterion => ({ criterion, met: false, independent: false, feedback: '等待学习证据' })) } },
    { ...valid, messages: [{ messageId: 'work', role: 'assistant', text: '我的计算是 32', sequence: 10 }] },
  ]
  for (const item of invalid) assert.deepEqual(homeworkHelpPlan({ criteria, ...state, assessments: [item] }), {
    defaultDepth: 'brief_clue', basis: 'unknown', criterionIndex: null, observedAssessments: 0,
  })
})

test('only an unresolved exact criterion in both current and prior assessed work increases depth', () => {
  const current = assessment('current', 3, 'work-2', 20)
  const prior = assessment('previous', 2, 'work-1', 10)
  const resolved = { ...prior, result: { ...(prior.result as object), criteria: criteria.map(criterion => ({ criterion, met: true, independent: false, feedback: '' })) } }
  assert.equal(homeworkHelpPlan({ criteria, ...state, assessments: [current, resolved] }).defaultDepth, 'brief_clue')
  assert.equal(homeworkHelpPlan({ criteria, ...state, assessments: [current, { ...prior, returnEpoch: 0 }] }).defaultDepth, 'brief_clue')
  const secondOnly = { ...prior, result: { ...(prior.result as object), criteria: criteria.map((criterion, index) => ({ criterion, met: index === 0 })) } }
  const focused = homeworkHelpPlan({ criteria, ...state, assessments: [current, secondOnly] })
  assert.equal(focused.defaultDepth, 'explanation')
  assert.equal(focused.criterionIndex, 1)
  assert.equal(homeworkHelpPlan({ criteria: ['另一任务'], ...state, assessments: [current, prior] }).basis, 'unknown')
  const allMet = homeworkHelpPlan({ criteria, ...state, assessments: [assessment('current', 3, 'work', 10, true)] })
  assert.equal(allMet.basis, 'no_assessed_gap')
  assert.equal(allMet.criterionIndex, null)
  assert.doesNotMatch(JSON.stringify(allMet), /master|MASTER|unlocked|submit/)
})

test('ordinary turns get no tutoring rule; editable requests can ask for style within the teacher task', () => {
  assert.equal(homeworkHelpRules(null), '')
  const unknown = homeworkHelpPlan({ criteria, ...state, assessments: [] })
  const rules = homeworkHelpRules(unknown)
  assert.match(rules, /requested explanation/)
  assert.match(rules, /teacher requirements and current feedback/)
  assert.match(rules, /one brief clue/)
  assert.doesNotMatch(rules, /judge|assessment tool|effort|reasoning|budget|retry|verification|acceptance/i)
})
