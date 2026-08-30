import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const api = read('./api.ts')
const contracts = read('./contracts.ts')
const board = read('./components/TrustBoard.tsx')
const appStore = read('../../stores/app.ts')

test('Trust Board is an independent LIVE-only product module', () => {
  for (const route of ['context', 'kpis', 'eval-trend', 'eval-cases', 'evidence-chain', 'snapshots']) {
    assert.match(api, new RegExp(route))
  }
  assert.match(api, /mode=LIVE/)
  assert.match(appStore, /openTrust: \(projectId\)[\s\S]*trustProjectId: projectId \?\? null/)
  assert.match(board, /requestedProjectId \?\? activeProjectId/)
  assert.doesNotMatch(`${api}\n${board}`, /features\/(?:admin|eval)|AdminApp|EvalPage/)
})

test('Trust KPI contract keeps value, threshold, counts, provenance and Evidence identity together', () => {
  for (const field of [
    'value', 'threshold', 'numerator', 'denominator', 'window', 'source', 'dataset', 'release', 'updatedAt', 'evidenceId',
  ]) assert.match(contracts, new RegExp(`\\b${field}\\b`), field)
  assert.match(board, /kpi\.numerator.*kpi\.denominator/s)
  assert.match(board, /kpi\.dataset.*kpi\.release/s)
})

test('Trust Board omits engineering payloads and confirms immutable snapshot creation', () => {
  assert.doesNotMatch(board, /\b(?:prompt|toolArgs|tool_args|tokens?|latency)\b/i)
  assert.match(board, /if \(!await confirmSensitiveAction\([\s\S]*?\)\) return[\s\S]*?setSnapshotBusy\(true\)/)
  assert.match(board, /toastAction\(trustApi\.createSnapshot/)
  assert.match(board, /repeat\(auto-fit,minmax/)
})
