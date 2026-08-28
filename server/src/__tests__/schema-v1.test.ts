import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')
const bootstrap = readFileSync(new URL('../db/bootstrap.ts', import.meta.url), 'utf8')
const serverBoot = readFileSync(new URL('../web.ts', import.meta.url), 'utf8')
const seed = readFileSync(new URL('../seed.ts', import.meta.url), 'utf8')
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
    'message_reactions',
    'agent_climate',
    'agent_work_items',
    'knowledge_sources',
    'llm_calls',
    'courses',
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
  assert.doesNotMatch(schema, /\b(?:sub2api_user_id|sub2api_api_key|tier)\b/i)
  assert.match(schema, /CREATE TABLE public\.llm_calls[\s\S]*cost_usd[\s\S]*cost_estimated/)
})

test('v1 defaults preserve current capability and Canvas contracts', () => {
  assert.match(schema, /capabilities jsonb DEFAULT '\["canvas", "web", "files", "email", "documents"\]'::jsonb NOT NULL/)
  assert.doesNotMatch(schema, /capabilities jsonb DEFAULT '[^']*knowledge/)
  assert.match(schema, /CREATE TABLE public\.canvases \([\s\S]*?conversation_id text,/)
})

test('tenant-owned reaction and climate rows have no legacy tenant default', () => {
  assert.match(schema, /CREATE TABLE public\.message_reactions \([\s\S]*?company_id text NOT NULL[\s\S]*?\);/)
  assert.match(schema, /CREATE TABLE public\.agent_climate \([\s\S]*?company_id text NOT NULL[\s\S]*?\);/)
  assert.match(schema, /agent_climate_pkey PRIMARY KEY \(company_id, agent_id, about_id\)/)
  assert.doesNotMatch(schema, /company_id text DEFAULT 'personal'::text/)
  assert.match(bootstrap, /REQUIRED_V1_NOT_NULL_COLUMNS/)
  assert.match(bootstrap, /REQUIRED_V1_PRIMARY_KEYS/)
})

test('calendar rows require one workspace and coherent native event fields', () => {
  assert.match(schema, /CREATE TABLE public\.calendar_events \([\s\S]*?project_id text NOT NULL[\s\S]*?\);/)
  for (const constraint of [
    'calendar_events_kind_check',
    'calendar_events_status_check',
    'calendar_events_agent_task_check',
    'calendar_events_reminder_check',
    'calendar_events_reminder_minutes_check',
    'calendar_events_reminder_channel_check',
  ]) {
    assert.match(schema, new RegExp(`CONSTRAINT ${constraint}\\b`))
  }
  assert.match(bootstrap, /\['calendar_events', 'project_id'\]/)
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

test('bootstrap completeness tracks every canonical v1 relation and the LLM ledger invariants', () => {
  const tables = [...schema.matchAll(/^CREATE TABLE public\.([a-z0-9_]+)\b/gm)]
    .map((match) => match[1]!)
  assert.ok(tables.length > 100, 'canonical v1 relation inventory unexpectedly shrank')
  for (const table of tables) assert.match(bootstrap, new RegExp(`'${table}'`), table)
  for (const object of [
    'llm_calls_pkey',
    'llm_calls_company_id_fkey',
    'llm_calls_source_check',
    'llm_calls_status_check',
    'llm_calls_tokens_check',
    'idx_llm_calls_company_created',
    'idx_llm_calls_run_created',
    'participants_agent_bloub_only',
  ]) {
    assert.match(bootstrap, new RegExp(`'${object}'`), object)
  }
  assert.match(bootstrap, /REQUIRED_V1_CONSTRAINTS/)
  assert.match(bootstrap, /REQUIRED_V1_INDEXES/)
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

test('fresh-schema seed creates the personal company before its membership', () => {
  const userInsert = seed.indexOf('INSERT INTO users')
  const companyInsert = seed.indexOf('INSERT INTO companies')
  const membershipInsert = seed.indexOf('INSERT INTO company_members')
  assert.ok(userInsert >= 0 && companyInsert > userInsert && membershipInsert > companyInsert)
  assert.match(seed, /INSERT INTO companies \(id, name, slug, owner_user_id, description\)/)
  assert.doesNotMatch(seed, /if \(rows\[0\]\) return/)
})
