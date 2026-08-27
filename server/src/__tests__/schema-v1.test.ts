import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')
const bootstrap = readFileSync(new URL('../db/bootstrap.ts', import.meta.url), 'utf8')
const serverBoot = readFileSync(new URL('../index.ts', import.meta.url), 'utf8')
const embeddings = readFileSync(new URL('../agents/embeddings.ts', import.meta.url), 'utf8')
const onboarding = readFileSync(new URL('../onboardCompany.ts', import.meta.url), 'utf8')
const composeFiles = [
  '../../../docker-compose.mvp.ci.yml',
  '../../../docker-compose.mvp.yml',
  '../../../docker-compose.production.yml',
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('\r\n', '\n'))

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

test('bootstrap only reuses a complete marked v1 schema and rejects every unmarked non-empty schema', () => {
  const executableBootstrap = bootstrap
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert.match(bootstrap, /requires an empty schema/)
  assert.match(schema, /COMMENT ON SCHEMA public IS 'LingxiLoop schema v1';/)
  assert.match(executableBootstrap, /schemaMarker\(client\)[\s\S]*V1_SCHEMA_MARKER/)
  assert.doesNotMatch(executableBootstrap, /advisory|backfill|lock_timeout|ALTER TABLE/i)
})

test('every Compose runtime gates Web startup on the v1 bootstrap service', () => {
  for (const compose of composeFiles) {
    const bootstrapService = compose.match(/\n {2}db-bootstrap:\n([\s\S]*?)(?=\n {2}[\w-]+:\n)/)?.[1] ?? ''
    assert.match(bootstrapService, /command: \["npm", "run", "db:bootstrap"\]/)
    assert.doesNotMatch(bootstrapService, /profiles:/)
    assert.match(
      compose,
      /\n {2}lingxiloop:\n[\s\S]*?depends_on:\n[\s\S]*?db-bootstrap:\n {8}condition: service_completed_successfully/,
    )
  }
})

test('runtime startup contains no historical data backfill path', () => {
  const runtime = `${serverBoot}\n${embeddings}\n${onboarding}`
  assert.doesNotMatch(runtime, /backfill(?:StarterAgents|HumanGravatars|MemoryEmbeddings)/)
  assert.doesNotMatch(serverBoot, /embed:backfill|before Gravatar wiring|predating this commit/)
})
