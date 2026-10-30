import assert from 'node:assert/strict'
import test from 'node:test'
import { createArtifactTools } from '../modules/artifacts/agent-tools.js'

const control = async () => { throw new Error('schema tests must not access runtime') }
const design = createArtifactTools('design', control), slides = createArtifactTools('slides', control)
const report = { finding: 'Observed finding', evidenceRefs: [{ kind: 'file', id: 'project/Main.dc.html' }], confidence: 0.8 }

test('Design and Slides expose the same native tools; only Slides creates artifacts', () => {
  const methods = (tools: typeof design) => tools.map(tool => tool.action.split('.')[1])
  assert.deepEqual(methods(slides).filter(method => method !== 'create'), methods(design))
  assert.ok(methods(slides).includes('create'))
  for (const tool of [...design, ...slides]) assert.equal((tool.parameters as { additionalProperties: boolean }).additionalProperties, false)
})

test('ordinary artifact reports reject verifier fields at native parse admission', () => {
  for (const tools of [design, slides]) {
    const ordinary = tools.find(tool => tool.action.endsWith('.submit_report'))!
    assert.deepEqual(ordinary.parse(report), report)
    for (const extra of [{ verifiesReportId: 'report-1' }, { disconfirmingChecks: ['No contrary artifact found'] }, { verdict: 'supported' }]) {
      assert.throws(() => ordinary.parse({ ...report, ...extra }))
    }
    assert.throws(() => ordinary.parse({ ...report, evidenceRefs: [{ kind: 'frame', id: 'frame-1' }] }))
  }
})

test('independent verification has a strict required role-specific public contract', () => {
  const verification = slides.find(tool => tool.action === 'slides.submit_verification')!
  assert.throws(() => verification.parse(report))
  const input = { ...report, verifiesReportId: 'report-1', disconfirmingChecks: ['Checked the original artifact'], verdict: 'inconclusive' }
  assert.deepEqual(verification.parse(input), input)
  assert.throws(() => verification.parse({ ...input, disconfirmingChecks: [] }))
  assert.throws(() => verification.parse({ ...input, executionRole: 'specialist' }))
  const schema = verification.parameters as { required: string[] }
  for (const field of ['verifiesReportId','disconfirmingChecks','verdict']) assert.ok(schema.required.includes(field))
})

test('file writes take whole files or deletions under project paths only', () => {
  const write = design.find(tool => tool.action === 'design.write_files')!
  assert.ok(write.parse({ files: { 'project/Main.dc.html': { content: '<x-dc></x-dc>', ifMatch: null }, 'project/Old.dc.html': { delete: true } } }))
  assert.throws(() => write.parse({ files: {} }))
  assert.throws(() => write.parse({ files: { '../escape.txt': { content: 'x' } } }))
  assert.throws(() => write.parse({ files: { 'project/a.html': { content: 'x', ifMatch: 'not-a-sha' } } }))
})
