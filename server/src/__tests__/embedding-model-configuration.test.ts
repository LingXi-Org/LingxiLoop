import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

// Failure model: docs/evidence/issue-297/FAILURE-MODEL.md, before implementation.
const fixture = { OPENAI_EMBEDDING_MODEL: 'Pro/BAAI/bge-m3', OPENAI_BASE_URL: 'https://api.siliconflow.cn/v1', OPENAI_API_KEY: 'synthetic-key', NODE_ENV: 'test' }
mock.module('../env.js', { namedExports: { env: fixture } })
const { memoryEmbeddings } = await import('../modules/memory/configuration.js')

test('new Pro BGE memory calls verify 1024 output dimensions without unsupported dimension reduction', () => {
  const names = ['SILICONFLOW_USD_CNY_RATE', 'AGENT_OS_EMBEDDING_DIMENSIONS', 'AGENT_OS_EMBEDDING_INPUT_COST_MICROS_PER_MILLION', 'LINGXILOOP_DISABLE_EMBEDDINGS'] as const
  const before = names.map(name => process.env[name])
  try {
    names.forEach(name => { delete process.env[name] })
    process.env.SILICONFLOW_USD_CNY_RATE = '7'
    const model = memoryEmbeddings()!
    assert.equal(model.id, 'Pro/BAAI/bge-m3')
    assert.equal(model.expectedDimensions, 1024)
    assert.equal(model.dimensions, undefined)
    assert.equal(model.inputCostMicrosPerMillion, 10000)
    assert.equal(model.indexVersion, 'memory-v1')
    fixture.OPENAI_EMBEDDING_MODEL = 'BAAI/bge-m3'
    assert.equal(memoryEmbeddings()!.inputCostMicrosPerMillion, 0)
    fixture.OPENAI_EMBEDDING_MODEL = 'unverified/embedding'
    assert.throws(() => memoryEmbeddings(), /configuration/)
  } finally {
    fixture.OPENAI_EMBEDDING_MODEL = 'Pro/BAAI/bge-m3'
    names.forEach((name, index) => { if (before[index] === undefined) delete process.env[name]; else process.env[name] = before[index] })
  }
})
