import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')
const bootstrap = readFileSync(new URL('../db/bootstrap.ts', import.meta.url), 'utf8')

test('v1 schema is a complete bootstrap definition without historical data mutations', () => {
  for (const table of [
    'companies',
    'participants',
    'conversations',
    'messages',
    'agent_work_items',
    'knowledge_sources',
    'courses',
    'llm_calls',
  ]) {
    assert.match(schema, new RegExp(`CREATE TABLE public\\.${table}\\b`))
  }
  const schemaWithoutTriggerBodies = schema.replace(/AS \$\$[\s\S]*?\$\$;/g, '')
  assert.doesNotMatch(schemaWithoutTriggerBodies, /^\s*(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO)\b/im)
  assert.doesNotMatch(schema, /\bIF (?:NOT )?EXISTS\b/i)
})

test('v1 schema excludes migration markers and retired host structures', () => {
  assert.doesNotMatch(schema, /\b(?:schema_cutovers|course_schema_cutovers|agent_os_cutovers)\b/)
  assert.doesNotMatch(schema, /CREATE TABLE public\.agent_memory\b/)
  assert.doesNotMatch(schema, /CREATE TABLE public\.(?:computers|computer_events|lingxigraph_steering_receipts)\b/)
  assert.doesNotMatch(schema, /\b(?:computer_id|fast_model|pair_token)\b/)
})

test('v1 defaults preserve current capability and Canvas contracts', () => {
  assert.match(schema, /capabilities jsonb DEFAULT '\["canvas", "web", "files", "email", "documents"\]'::jsonb NOT NULL/)
  assert.doesNotMatch(schema, /capabilities jsonb DEFAULT '[^']*knowledge/)
  assert.match(schema, /CREATE TABLE public\.canvases \([\s\S]*?conversation_id text,/)
})

test('bootstrap rejects non-empty schemas instead of upgrading them', () => {
  const executableBootstrap = bootstrap
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert.match(bootstrap, /requires an empty schema/)
  assert.doesNotMatch(executableBootstrap, /advisory|backfill|lock_timeout|ALTER TABLE/i)
})
