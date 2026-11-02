import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { notebookEmbeddingTarget, assertNotebookEmbeddingCompatible } from './notebook-embedding.mjs'

const target = notebookEmbeddingTarget({ NOTEBOOK_EMBEDDING_BASE_URL: 'https://backend.lingxilearn.cn/internal/open-notebook/v1' })
const healthy = { schemaVersion: 1, chunks: 12, invalidDimensions: 0,
  contract: { model: target.model, model_id: target.model, base_url: target.baseUrl, dimensions: 1024 } }
test('Notebook keeps its existing configuration until an explicitly reviewed endpoint relocation', () => {
  const path = 'deploy/knowledge/compose.yml', compose = readFileSync(path, 'utf8')
  assert.ok(compose.includes('OPENAI_EMBEDDING_MODEL: ${NOTEBOOK_EMBEDDING_MODEL:-BAAI/bge-m3}'))
  const environment = { PATH: process.env.PATH, LINGXILOOP_PUBLIC_ORIGIN: 'https://loop.lingxilearn.cn' }
  for (const [, key] of compose.matchAll(/\$\{(\w+):\?/g)) environment[key] ??= 'fixture'
  const render = extra => JSON.parse(execFileSync('docker', ['compose', '--env-file', '/dev/null', '-f', path, 'config', '--format', 'json'], {
    env: { ...environment, ...extra }, encoding: 'utf8',
  })).services['open-notebook'].environment
  assert.equal(render({}).OPENAI_BASE_URL, notebookEmbeddingTarget(environment).baseUrl)
  assert.equal(render({}).OPENAI_EMBEDDING_MODEL, 'BAAI/bge-m3')
  assert.equal(render({ NOTEBOOK_EMBEDDING_BASE_URL: target.baseUrl }).OPENAI_BASE_URL, target.baseUrl)
  assert.equal(render({ NOTEBOOK_EMBEDDING_MODEL: 'BAAI/bge-m3', OPENAI_EMBEDDING_MODEL: target.model }).OPENAI_EMBEDDING_MODEL, 'BAAI/bge-m3')
  assert.doesNotThrow(() => assertNotebookEmbeddingCompatible(healthy, target))
  assert.throws(() => assertNotebookEmbeddingCompatible(healthy, { ...target, baseUrl: 'https://unreviewed.example/internal/open-notebook/v1' }), /endpoint relocation/)
})
test('same dimensions never authorize renamed models, changed endpoints or unknown old vectors', () => {
  for (const contract of [null, { ...healthy.contract, model: 'BAAI/bge-m3' }, { ...healthy.contract, model_id: 'legacy' },
    { ...healthy.contract, base_url: 'https://loop.lingxilearn.cn/internal/open-notebook/v1' }, { ...healthy.contract, dimensions: 768 }]) {
    assert.throws(() => assertNotebookEmbeddingCompatible({ ...healthy, contract }, target), /separate generation/)
  }
  assert.throws(() => assertNotebookEmbeddingCompatible({ ...healthy, invalidDimensions: 1 }, target))
  assert.doesNotThrow(() => assertNotebookEmbeddingCompatible({ ...healthy, contract: null, chunks: 0 }, target))
})
test('only the existing sealed active generation permits its exact shadow endpoint', () => {
  const pointer = { phase: 'active', model: target.model, base_url: `${target.baseUrl}/shadow`,
    plan_sha256: 'a'.repeat(64), verification_sha256: 'b'.repeat(64), product_gate_sha256: 'c'.repeat(64) }
  const generation = { phase: 'verified', plan_sha256: pointer.plan_sha256, verification_sha256: pointer.verification_sha256 }
  const observed = { ...healthy, pointer, generation, contract: { ...healthy.contract, base_url: pointer.base_url } }
  assert.doesNotThrow(() => assertNotebookEmbeddingCompatible(observed, target))
  for (const phase of ['fenced', 'activating']) assert.throws(() => assertNotebookEmbeddingCompatible({ ...observed, pointer: { ...pointer, phase } }, target))
  assert.throws(() => assertNotebookEmbeddingCompatible({ ...observed, generation: null }, target))
  assert.throws(() => assertNotebookEmbeddingCompatible({ ...observed, generation: { ...generation, plan_sha256: 'd'.repeat(64) } }, target))
})


test('observed production generation remains sealed; frontend transport is an explicit release blocker', () => {
  const record = JSON.parse(readFileSync('docs/evidence/issue-633/production-observation-41440171225.json', 'utf8'))
  const notebook = record.notebook
  assert.equal(notebook.pointerStable, true)
  assert.equal(notebook.active.contract.model, 'Pro/BAAI/bge-m3')
  assert.equal(notebook.active.contract.dimensions, 1024)
  assert.equal(notebook.active.chunks, 37)
  const observed = { ...notebook.active, pointer: notebook.pointer }
  const before = JSON.stringify(observed)
  assert.equal(notebookEmbeddingTarget({}).baseUrl, 'https://loop.lingxilearn.cn/internal/open-notebook/v1')
  assert.throws(() => assertNotebookEmbeddingCompatible(observed, notebookEmbeddingTarget({})), /endpoint relocation/)
  assert.throws(() => assertNotebookEmbeddingCompatible(observed, notebookEmbeddingTarget({
    NOTEBOOK_EMBEDDING_BASE_URL: 'https://backend.lingxilearn.cn/internal/open-notebook/v1',
  })), /generation is fenced or incompatible/)
  assert.equal(JSON.stringify(observed), before)
})
