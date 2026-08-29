import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')
const bootstrap = readFileSync(new URL('../db/bootstrap.ts', import.meta.url), 'utf8')
const serverBoot = readFileSync(new URL('../web.ts', import.meta.url), 'utf8')
const workerBoot = readFileSync(new URL('../worker.ts', import.meta.url), 'utf8')
const embeddings = readFileSync(new URL('../agents/embeddings.ts', import.meta.url), 'utf8')
const onboarding = readFileSync(new URL('../modules/companies/onboarding-repository.ts', import.meta.url), 'utf8')
const canvasReports = readFileSync(new URL('../modules/canvas/reports-repository.ts', import.meta.url), 'utf8')
const companyRepository = readFileSync(new URL('../modules/companies/repository.ts', import.meta.url), 'utf8')
const personalWorkspace = readFileSync(new URL('../modules/companies/personal-workspace.ts', import.meta.url), 'utf8')
const entitlementRepository = readFileSync(new URL('../modules/entitlements/repository.ts', import.meta.url), 'utf8')
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
    'email_messages',
    'message_reactions',
    'agent_climate',
    'agent_work_items',
    'knowledge_sources',
    'llm_calls',
    'courses',
    'company_memberships',
    'project_memberships',
    'plans',
    'entitlements',
    'plan_entitlements',
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

test('domain foundation relations replace legacy product identity and membership structures', () => {
  for (const retired of ['company_members', 'course_members', 'waitlist', 'app_settings', 'permissions']) {
    assert.doesNotMatch(schema, new RegExp(`CREATE TABLE public\\.${retired}\\b`))
  }
  const users = schema.match(/CREATE TABLE public\.users \(([\s\S]*?)\n\);/)?.[1] ?? ''
  assert.doesNotMatch(users, /\b(?:is_admin|role|plan|is_teacher|is_pro|is_paid|account_type)\b/i)
  assert.match(schema, /CREATE TABLE public\.companies \([\s\S]*?type text NOT NULL[\s\S]*?status text DEFAULT 'ACTIVE'::text NOT NULL[\s\S]*?personal_owner_user_id text,[\s\S]*?plan_id text NOT NULL/)
  assert.match(schema, /companies_type_check[\s\S]*?'PERSONAL'[\s\S]*?'EDUCATION'/)
  assert.match(schema, /companies_status_check[\s\S]*?'ACTIVE'[\s\S]*?'SUSPENDED'/)
  assert.match(schema, /companies_personal_owner_check/)
  assert.match(schema, /idx_companies_personal_owner[\s\S]*?personal_owner_user_id[\s\S]*?type = 'PERSONAL'/)
  assert.match(schema, /companies_personal_owner_user_id_fkey[\s\S]*?REFERENCES public\.users\(id\) ON DELETE RESTRICT/)
  assert.doesNotMatch(schema, /\bowner_user_id\b/)
  assert.match(schema, /CREATE TABLE public\.projects \([\s\S]*?company_id text NOT NULL[\s\S]*?kind text NOT NULL[\s\S]*?plan_id text,/)
  assert.match(schema, /projects_kind_check[\s\S]*?'PERSONAL_LEARNING'[\s\S]*?'TEACHING'[\s\S]*?'INSTITUTIONAL_COURSE'/)
  assert.match(schema, /is_default boolean DEFAULT false NOT NULL/)
  assert.match(schema, /idx_projects_one_default[\s\S]*?WHERE \(is_default = true\)/)
  assert.doesNotMatch(schema, /\bis_general\b/)
  assert.match(bootstrap, /\['projects', 'kind'\]/)
  assert.match(bootstrap, /\['projects', 'kind', null\]/)
  assert.match(bootstrap, /\['projects', 'is_general'\]/)
  assert.match(bootstrap, /\['projects', 'projects_kind_check', 'c'\]/)
  assert.match(bootstrap, /'idx_projects_one_default'/)
  assert.match(schema, /company_memberships_role_check[\s\S]*?'OWNER'[\s\S]*?'ADMIN'[\s\S]*?'MEMBER'/)
  assert.match(schema, /project_memberships_role_check[\s\S]*?'OWNER'[\s\S]*?'TEACHER'[\s\S]*?'TA'[\s\S]*?'STUDENT'[\s\S]*?'OBSERVER'/)
  assert.match(schema, /project_memberships_company_id_user_id_fkey[\s\S]*?REFERENCES public\.company_memberships\(company_id, user_id\) ON DELETE CASCADE/)
  assert.match(schema, /project_memberships_project_id_company_id_fkey[\s\S]*?REFERENCES public\.projects\(id, company_id\) ON DELETE CASCADE/)
  assert.match(schema, /project_memberships_company_id_project_id_user_id_key[\s\S]*?UNIQUE \(company_id, project_id, user_id\)/)
})

test('Plan and Entitlement are independent and accept JSON scalar values only', () => {
  assert.match(schema, /plans_code_key UNIQUE \(code\)/)
  assert.match(schema, /entitlements_code_key UNIQUE \(code\)/)
  assert.match(schema, /plan_entitlements_pkey PRIMARY KEY \(plan_id, entitlement_id\)/)
  assert.match(schema, /jsonb_typeof\(value\).*?'boolean'.*?'number'.*?'string'/s)
  assert.doesNotMatch(schema, /CREATE TABLE public\.(?:subscriptions|project_entitlement_overrides)\b/)
  assert.match(entitlementRepository, /ENTITLEMENT_CODES/)
  assert.match(entitlementRepository, /'true'::jsonb/)
})

test('durable Agent work preserves a human authorization principal', () => {
  assert.match(schema, /CREATE TABLE public\.agent_work_items \([\s\S]*?authorization_user_id text,/)
  assert.match(schema, /agent_work_items_authorization_user_id_fkey[\s\S]*?REFERENCES public\.users\(id\) ON DELETE RESTRICT/)
  assert.match(schema, /CREATE TABLE public\.canvases \([\s\S]*?authorization_user_id text,/)
  assert.match(bootstrap, /\['agent_work_items', 'authorization_user_id'\]/)
  assert.match(bootstrap, /\['canvases', 'authorization_user_id'\]/)
})

test('v1 defaults preserve current capability and Canvas contracts', () => {
  assert.match(schema, /capabilities jsonb DEFAULT '\["canvas", "web", "files", "email", "documents"\]'::jsonb NOT NULL/)
  assert.doesNotMatch(schema, /capabilities jsonb DEFAULT '[^']*knowledge/)
  assert.match(schema, /CREATE TABLE public\.canvases \([\s\S]*?conversation_id text,/)
})

test('structured Agent cards store WuKong identities without SQL message foreign keys', () => {
  for (const constraint of [
    'agent_approvals_message_id_fkey',
    'agent_handoffs_source_message_id_fkey',
    'agent_handoffs_result_message_id_fkey',
    'tool_calls_message_id_fkey',
  ]) assert.doesNotMatch(schema, new RegExp(`\\b${constraint}\\b`))
  assert.doesNotMatch(schema, /CREATE TABLE public\.tool_calls \([\s\S]*?\bmessage_id text/)
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

test('document mentions use a durable tenant-scoped delivery ledger', () => {
  assert.match(schema, /CREATE TABLE public\.document_mention_deliveries \([\s\S]*?company_id text NOT NULL[\s\S]*?recipients jsonb NOT NULL[\s\S]*?status text DEFAULT 'queued'/)
  assert.match(schema, /document_mention_deliveries_status_check/)
  assert.match(schema, /idx_document_mention_deliveries_due/)
  assert.match(schema, /document_mention_deliveries_project_id_company_id_fkey/)
  assert.match(bootstrap, /'document_mention_deliveries'/)
  assert.match(bootstrap, /\['document_mention_deliveries', 'status', "'queued'::text"\]/)
})

test('learning side effects have fenced tenant-scoped reconciliation identities', () => {
  assert.match(schema, /CREATE TABLE public\.learning_effects \([\s\S]*?effect_key text DEFAULT 'singleton'::text NOT NULL/)
  assert.match(schema, /queued_payload jsonb,[\s\S]*?generation integer DEFAULT 1 NOT NULL/)
  assert.match(schema, /learning_effects_generation_check/)
  assert.match(schema, /learning_effects_effect_identity_key UNIQUE\(company_id, course_id, kind, effect_key\)/)
  assert.match(schema, /'member_access\.revoke'::text, 'member_onboarding\.seed'::text/)
  assert.match(bootstrap, /\['learning_effects', 'effect_key'\]/)
  assert.match(bootstrap, /\['learning_effects', 'generation'\]/)
  assert.match(bootstrap, /\['learning_effects', 'learning_effects_effect_identity_key', 'u'\]/)
})

test('company member onboarding has one durable tenant-scoped leased effect', () => {
  assert.match(schema, /CREATE TABLE public\.company_onboarding_effects \([\s\S]*?company_id text NOT NULL[\s\S]*?member_id text NOT NULL/)
  assert.match(schema, /company_onboarding_effects_member_fkey[\s\S]*?FOREIGN KEY \(company_id, member_id\) REFERENCES public\.company_memberships\(company_id, user_id\) ON DELETE CASCADE/)
  assert.match(schema, /company_onboarding_effects_lease_check/)
  assert.match(schema, /company_onboarding_effects_identity_key UNIQUE\(company_id, member_id, kind\)/)
  assert.match(schema, /idx_company_onboarding_effects_due/)
  assert.match(bootstrap, /'company_onboarding_effects'/)
  assert.match(bootstrap, /\['company_onboarding_effects', 'company_onboarding_effects_member_fkey', 'f'\]/)
  assert.match(bootstrap, /'idx_company_onboarding_effects_due'/)
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

test('production worker has no demo-data or starter-message seed path', () => {
  assert.doesNotMatch(workerBoot, /seedIfEmpty|seed\.js/)
  assert.doesNotMatch(schema, /CREATE TABLE public\.poll_votes\b/)
  assert.doesNotMatch(schema, /CREATE TABLE public\.messages\b/)
  assert.doesNotMatch(schema, /\bconversation_counters\b/)
  assert.match(schema, /CREATE TABLE public\.email_messages \([\s\S]*?author_id text NOT NULL[\s\S]*?body text NOT NULL[\s\S]*?sequence integer NOT NULL/)
  assert.match(schema, /CREATE TABLE public\.email_sequence_counters\b/)
  assert.match(schema, /email_sequence_counters_pkey PRIMARY KEY \(conversation_id, company_id\)/)
  assert.match(schema, /email_messages_conversation_id_fkey FOREIGN KEY \(conversation_id, company_id\) REFERENCES public\.conversations\(id, company_id\)/)
  assert.match(schema, /email_attachments_message_scope_fkey FOREIGN KEY \(message_id, company_id, conversation_id\) REFERENCES public\.email_messages\(message_id, company_id, conversation_id\)/)
})

test('Canvas message evidence does not restore the SQL chat data plane', () => {
  assert.doesNotMatch(canvasReports, /\b(?:FROM|JOIN)\s+messages\b/i)
})

test('fresh users receive one Personal Free context through the canonical provisioning entrypoint', () => {
  assert.match(personalWorkspace, /SELECT id,email,display_name FROM users[\s\S]*FOR UPDATE/)
  assert.match(personalWorkspace, /ensurePersonalFreePlan\(db\)[\s\S]*INSERT INTO companies[\s\S]*'PERSONAL'[\s\S]*INSERT INTO company_memberships[\s\S]*'OWNER'[\s\S]*'PERSONAL_LEARNING'[\s\S]*'我的学习'[\s\S]*INSERT INTO project_memberships[\s\S]*'OWNER'/)
  assert.match(entitlementRepository, /PERSONAL_FREE_PLAN[\s\S]*ON CONFLICT \(id\)/)
  assert.doesNotMatch(schema, /INSERT INTO plans/i)
  assert.doesNotMatch(companyRepository, /INSERT INTO companies/)
})
