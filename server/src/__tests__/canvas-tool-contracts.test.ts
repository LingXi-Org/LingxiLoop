import assert from 'node:assert/strict'
import test from 'node:test'
import { createCanvasTools } from '../modules/canvas/agent-tools.js'

const tools = createCanvasTools(async () => { throw new Error('schema tests must not access runtime') })
const report = { finding: 'Observed finding', evidenceRefs: [{ kind: 'frame', id: 'frame-1' }], confidence: 0.8 }

test('ordinary Canvas reports reject verifier fields at native parse admission', () => {
  const ordinary = tools.find(tool => tool.action === 'canvas.submit_report')!
  assert.deepEqual(ordinary.parse(report), report)
  for (const extra of [{ verifiesReportId: 'report-1' }, { disconfirmingChecks: ['No contrary artifact found'] }, { verdict: 'supported' }]) {
    assert.throws(() => ordinary.parse({ ...report, ...extra }))
  }
  const schema = ordinary.parameters as { properties: Record<string, unknown>; additionalProperties: boolean }
  assert.equal(schema.additionalProperties, false)
  assert.deepEqual(Object.keys(schema.properties).sort(), ['confidence','evidenceRefs','finding','nextStep','unresolved'])
})

test('independent verification has a strict required role-specific public contract', () => {
  const verification = tools.find(tool => tool.action === 'canvas.submit_verification')
  assert.ok(verification)
  assert.throws(() => verification.parse(report))
  const input = { ...report, verifiesReportId: 'report-1', disconfirmingChecks: ['Checked the original artifact'], verdict: 'inconclusive' }
  assert.deepEqual(verification.parse(input), input)
  assert.throws(() => verification.parse({ ...input, disconfirmingChecks: [] }))
  assert.throws(() => verification.parse({ ...input, executionRole: 'specialist' }))
  const schema = verification.parameters as { required: string[]; additionalProperties: boolean }
  assert.equal(schema.additionalProperties, false)
  for (const field of ['verifiesReportId','disconfirmingChecks','verdict']) assert.ok(schema.required.includes(field))
})
