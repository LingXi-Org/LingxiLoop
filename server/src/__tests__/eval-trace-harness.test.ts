import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateRun } from '../eval/evaluator.js'
import { compareEvalReport, type EvalBaseline, validateEvalBaseline } from '../eval/harness.js'
import {
  dedupeCitations,
  extractKnowledgeCitations,
  sanitizeEvalObservation,
  sanitizeHostActionArgs,
  sanitizeHostActionResult,
} from '../eval/trace.js'

test('knowledge.search trace extraction keeps identities and never persists excerpts', () => {
  const raw = {
    __hostActionResult: true,
    value: [{
      sourceId: 'source-1',
      sourceTitle: 'Handbook',
      chunkId: 'chunk-1',
      marker: 'S1',
      excerpt: 'PRIVATE SOURCE PASSAGE',
      sourceUrl: 'https://example.com/private',
    }],
  }
  assert.deepEqual(extractKnowledgeCitations('knowledge.search', raw), [{
    sourceId: 'source-1', title: 'Handbook', chunkId: 'chunk-1', marker: 'S1',
  }])
  const sanitized = sanitizeHostActionResult('knowledge.search', raw)
  assert.equal(JSON.stringify(sanitized).includes('PRIVATE SOURCE PASSAGE'), false)
  assert.equal(JSON.stringify(sanitized).includes('excerpt'), false)
})

test('tool trace sanitizer truncates ordinary values and redacts sensitive fields', () => {
  const args = sanitizeHostActionArgs('email.send', {
    subject: 'Course summary', body: 'private message', apiToken: 'secret', note: 'x'.repeat(700),
  })
  assert.deepEqual(args, {
    subject: 'Course summary', body: '[redacted]', apiToken: '[redacted]', note: `${'x'.repeat(500)}…`,
  })
})

test('dynamic and automatic RAG citations dedupe by source, chunk, and marker', () => {
  assert.deepEqual(dedupeCitations([
    { sourceId: 'source-1', chunkId: 'chunk-1', marker: 'S1' },
    { sourceId: 'source-1', chunkId: 'chunk-1', marker: 'S1', title: 'duplicate' },
    { sourceId: 'source-1', chunkId: 'chunk-2', marker: 'S2' },
  ]), [
    { sourceId: 'source-1', chunkId: 'chunk-1', marker: 'S1' },
    { sourceId: 'source-1', chunkId: 'chunk-2', marker: 'S2' },
  ])
})

test('Eval observations redact message bodies and secrets before report persistence', () => {
  const sentinel = 'PRIVATE_MESSAGE_SENTINEL_8374'
  const sanitized = sanitizeEvalObservation({
    input: sentinel,
    answer: sentinel,
    citations: [{ sourceId: 'source-1', chunkId: 'chunk-1', marker: 'S1' }],
    toolCalls: [{
      name: 'email.send',
      args: { body: sentinel, authorization: 'Bearer secret-token-8374' },
      result: { stdout: sentinel, status: 'blocked' },
      status: 'error',
    }],
    trace: [{
      id: 'input-1',
      kind: 'input',
      label: 'Input loaded',
      status: 'completed',
      input: { text: sentinel },
    }, {
      id: 'cell-1',
      kind: 'ipython',
      label: 'IPython cell',
      status: 'failed',
      input: { codePreview: `print('${sentinel}')` },
      output: { stderr: sentinel },
    }],
    error: 'provider rejected sk-secretvalue8374',
    metadata: { authorization: `Bearer ${sentinel}` },
  })
  const serialized = JSON.stringify(sanitized)

  assert.doesNotMatch(serialized, new RegExp(sentinel))
  assert.doesNotMatch(serialized, /sk-secretvalue8374/)
  assert.match(serialized, /source-1/)
  assert.equal(sanitized.input, '[redacted]')
  assert.equal(sanitized.answer, '[redacted]')
})

test('golden gate fails a case and stage regression even when the run minimum still passes', () => {
  const report = evaluateRun({
    suiteKey: 'gate-test', version: 'candidate', passThreshold: 0.5,
    cases: [{
      caseId: 'answer', observation: { answer: 'missing' },
      expectations: { answer: { requiredKeywords: ['required'] }, passThreshold: 0.5 },
    }],
  }, new Map())
  const baseline: EvalBaseline = {
    schemaVersion: 'lingxiloop.eval-baseline.v1',
    suiteKey: 'gate-test',
    referenceVersion: 'base',
    minimumScore: 0.5,
    maximumScoreDrop: 0.05,
    reference: { score: 1, stageScores: { answer: 1 }, caseScores: { answer: 1 } },
    stageMinimums: { answer: 0.8 },
    caseMinimums: { answer: 0.8 },
  }
  const gate = compareEvalReport(report, baseline)
  assert.equal(gate.passed, false)
  assert.ok(gate.regressions.some((item) => item.scope === 'stage' && item.key === 'answer'))
  assert.ok(gate.regressions.some((item) => item.scope === 'case' && item.key === 'answer'))
})

test('baseline validation rejects unsupported stages and invalid score records', () => {
  assert.throws(() => validateEvalBaseline({
    schemaVersion: 'lingxiloop.eval-baseline.v1', suiteKey: 'suite', referenceVersion: 'v1',
    minimumScore: 0.8, maximumScoreDrop: 0.1,
    reference: { score: 1, stageScores: { unknown: 1 }, caseScores: { case: 1 } },
  }), /unsupported/)
})
