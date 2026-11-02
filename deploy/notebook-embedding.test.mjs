import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { notebookEmbeddingTarget, assertNotebookEmbeddingCompatible } from './notebook-embedding.mjs'

const target = notebookEmbeddingTarget({})
const healthy = { schemaVersion: 1, chunks: 12, invalidDimensions: 0,
  contract: { model: target.model, model_id: target.model, base_url: target.baseUrl, dimensions: 1024 } }
test('Notebook and both API slots share one model configuration and the existing authenticated backend route', () => {
  const compose = readFileSync('deploy/knowledge/compose.yml', 'utf8')
  assert.ok(compose.includes(`OPENAI_BASE_URL: \u0024{NOTEBOOK_EMBEDDING_BASE_URL:-${target.baseUrl}}`))
  for (const file of ['deploy/knowledge/compose.yml', 'deploy/app-a/compose.yml', 'deploy/app-b/compose.yml']) {
    assert.ok(readFileSync(file, 'utf8').includes(`OPENAI_EMBEDDING_MODEL: \u0024{OPENAI_EMBEDDING_MODEL:-${target.model}}`))
  }
  assert.doesNotThrow(() => assertNotebookEmbeddingCompatible(healthy, target))
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
