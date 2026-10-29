import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Failure modes: an A/B service retains the prior model; Worker overrides differ
// from Web; stale admission tariffs
// are required even though the provider tariff can derive them; unrelated models change.
test('A/B rendered Web and Worker environments share the reviewed chat model', () => {
  const model = 'deepseek-ai/DeepSeek-V4.1-Flash'
  for (const slot of ['a', 'b']) {
    const path = `deploy/app-${slot}/compose.yml`
    const source = readFileSync(path, 'utf8')
    const env = { PATH: process.env.PATH, OPENAI_EMBEDDING_MODEL: 'existing-embedding', OPENAI_IMAGE_MODEL: 'existing-image' }
    for (const [, name] of source.matchAll(/\$\{(\w+):\?/g)) env[name] ??= 'fixture'
    // Explicitly unset optional tariffs: boot derives the current model's prices.
    delete env.AGENT_OS_INPUT_COST_MICROS_PER_MILLION
    delete env.AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION
    env.SILICONFLOW_USD_CNY_RATE = '7'
    const config = JSON.parse(execFileSync('docker', ['compose', '--env-file', '/dev/null', '-f', path, 'config', '--format', 'json'], { env, encoding: 'utf8' }))
    for (const service of ['lingxiloop', 'worker']) {
      const runtime = config.services[service].environment
      assert.equal(runtime.OPENAI_MODEL, model)
      assert.equal(runtime.OPENAI_BASE_URL, 'https://api.siliconflow.cn/v1')
      assert.equal(runtime.OPENAI_EMBEDDING_MODEL, 'existing-embedding')
      assert.equal(runtime.OPENAI_IMAGE_MODEL, 'existing-image')
      assert.equal(runtime.AGENT_OS_INPUT_COST_MICROS_PER_MILLION, '')
      assert.equal(runtime.AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION, '')
    }
  }
})

test('development, knowledge and production templates share the exact new defaults', () => {
  const model = 'deepseek-ai/DeepSeek-V4.1-Flash', embedding = 'Pro/BAAI/bge-m3'
  for (const file of ['.env.example', '.env.local.example']) {
    const source = readFileSync(file, 'utf8')
    assert.match(source, new RegExp(`^OPENAI_MODEL=${model.replaceAll('.', '\\.')}\\s*$`, 'm'))
    assert.match(source, new RegExp(`^OPENAI_EMBEDDING_MODEL=${embedding}\\s*$`, 'm'))
  }
  for (const file of ['docker-compose.mvp.yml', 'deploy/app-a/compose.yml', 'deploy/app-b/compose.yml', 'deploy/knowledge/compose.yml']) {
    const source = readFileSync(file, 'utf8')
    if (file === 'deploy/knowledge/compose.yml') {
      assert.ok(source.includes('OPENAI_EMBEDDING_MODEL: ${NOTEBOOK_EMBEDDING_MODEL:-BAAI/bge-m3}'), file)
      continue
    }
    assert.ok(source.includes(`OPENAI_EMBEDDING_MODEL: \${OPENAI_EMBEDDING_MODEL:-${embedding}}`), file)
    assert.ok(source.includes(`OPENAI_MODEL: \${OPENAI_MODEL:-${model}}`), file)
  }
})
