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
  assert.match(schema, /companies_status_check[\s\S]*?'TRIAL'[\s\S]*?'USER_DELETION_PENDING'[\s\S]*?'GRACE_PERIOD'[\s\S]*?'OFFBOARDED'[\s\S]*?'RETENTION'[\s\S]*?'ARCHIVED'[\s\S]*?'DELETED'/)
  assert.match(
    schema,
    /companies_type_status_check CHECK \(\s*\(type = 'PERSONAL'::text AND status = ANY \(ARRAY\[\s*'ACTIVE'::text, 'USER_DELETION_PENDING'::text, 'DELETED'::text\s*\]\)\)\s*OR \(type = 'EDUCATION'::text AND status = ANY \(ARRAY\[\s*'TRIAL'::text, 'ACTIVE'::text, 'GRACE_PERIOD'::text, 'READ_ONLY'::text,\s*'OFFBOARDED'::text, 'RETENTION'::text, 'ARCHIVED'::text, 'DELETED'::text\s*\]\)\)\s*\)/,
  )
  assert.doesNotMatch(schema, /companies_status_check[^\n]*'SUSPENDED'/)
  assert.match(schema, /companies_personal_owner_check/)
  assert.match(schema, /idx_companies_personal_owner[\s\S]*?personal_owner_user_id[\s\S]*?type = 'PERSONAL'/)
  assert.match(schema, /companies_personal_owner_user_id_fkey[\s\S]*?REFERENCES public\.users\(id\) ON DELETE RESTRICT/)
  assert.doesNotMatch(schema, /\bowner_user_id\b/)
  assert.match(schema, /CREATE TABLE public\.projects \([\s\S]*?company_id text NOT NULL[\s\S]*?kind text NOT NULL[\s\S]*?plan_id text,/)
  assert.match(schema, /projects_kind_check[\s\S]*?'PERSONAL_LEARNING'[\s\S]*?'TEACHING'[\s\S]*?'INSTITUTIONAL_COURSE'/)
  assert.match(schema, /projects_status_check[\s\S]*?'CREATED'[\s\S]*?'DRAFT'[\s\S]*?'ACTIVE'[\s\S]*?'COURSE_ENDED'[\s\S]*?'READ_ONLY'[\s\S]*?'TRANSFER_PENDING'[\s\S]*?'RETENTION'[\s\S]*?'ARCHIVED'[\s\S]*?'DELETED'/)
  assert.match(
    schema,
    /projects_kind_status_check CHECK \(\s*\(kind = 'PERSONAL_LEARNING'::text AND status = ANY \(ARRAY\[\s*'CREATED'::text, 'ACTIVE'::text, 'ARCHIVED'::text, 'DELETED'::text\s*\]\)\)\s*OR \(kind = 'TEACHING'::text AND status = ANY \(ARRAY\[\s*'DRAFT'::text, 'ACTIVE'::text, 'COURSE_ENDED'::text, 'READ_ONLY'::text,\s*'TRANSFER_PENDING'::text, 'ARCHIVED'::text\s*\]\)\)\s*OR \(kind = 'INSTITUTIONAL_COURSE'::text AND status = ANY \(ARRAY\[\s*'DRAFT'::text, 'ACTIVE'::text, 'COURSE_ENDED'::text, 'READ_ONLY'::text,\s*'RETENTION'::text, 'ARCHIVED'::text, 'DELETED'::text\s*\]\)\)\s*\)/,
  )
  assert.match(schema, /is_default boolean DEFAULT false NOT NULL/)
  assert.match(schema, /idx_projects_one_default[\s\S]*?WHERE \(is_default = true\)/)
  assert.doesNotMatch(schema, /\bis_general\b/)
  assert.match(bootstrap, /\['projects', 'kind'\]/)
  assert.match(bootstrap, /\['projects', 'kind', null\]/)
  assert.match(bootstrap, /\['projects', 'status', "'ACTIVE'::text"\]/)
  assert.match(bootstrap, /\['projects', 'is_general'\]/)
  assert.match(bootstrap, /\['projects', 'projects_kind_check', 'c'\]/)
  assert.match(bootstrap, /\['projects', 'projects_status_check', 'c'\]/)
  assert.match(bootstrap, /\['companies', 'companies_type_status_check', 'c'\]/)
  assert.match(bootstrap, /\['projects', 'projects_kind_status_check', 'c'\]/)
  assert.match(bootstrap, /'idx_projects_one_default'/)
  assert.match(schema, /company_memberships_role_check[\s\S]*?'OWNER'[\s\S]*?'ADMIN'[\s\S]*?'MEMBER'/)
  assert.match(schema, /project_memberships_role_check[\s\S]*?'OWNER'[\s\S]*?'TEACHER'[\s\S]*?'TA'[\s\S]*?'STUDENT'[\s\S]*?'OBSERVER'/)
  assert.match(schema, /project_memberships_company_id_user_id_fkey[\s\S]*?REFERENCES public\.company_memberships\(company_id, user_id\) ON DELETE CASCADE/)
  assert.match(schema, /project_memberships_project_id_company_id_fkey[\s\S]*?REFERENCES public\.projects\(id, company_id\) ON DELETE CASCADE/)
  assert.match(schema, /project_memberships_company_id_project_id_user_id_key[\s\S]*?UNIQUE \(company_id, project_id, user_id\)/)
})

test('M6 learning facts are project-owned without a course compatibility layer', () => {
  const table = (name: string) => schema.match(
    new RegExp(`CREATE TABLE public\\.${name} \\(([\\s\\S]*?)\\n\\);`),
  )?.[1] ?? ''

  for (const retired of [
    'learning_objectives',
    'learning_objective_dependencies',
    'learning_mastery',
    'learning_mastery_events',
  ]) {
    assert.doesNotMatch(schema, new RegExp(`CREATE (?:TABLE|VIEW) public\\.${retired}\\b`))
    assert.match(bootstrap, new RegExp(`'${retired}'`))
  }

  for (const relation of [
    'learning_knowledge_units',
    'learning_knowledge_unit_dependencies',
    'learning_activity_knowledge_units',
    'learning_states',
    'learning_cases',
    'learning_case_actions',
  ]) {
    assert.match(schema, new RegExp(`CREATE TABLE public\\.${relation}\\b`))
    assert.match(bootstrap, new RegExp(`'${relation}'`))
  }

  const courses = table('courses')
  assert.doesNotMatch(courses, /\b(?:kind|status)\b/)
  assert.match(schema, /courses_project_id_key UNIQUE \(project_id\)/)

  const activities = table('learning_activities')
  assert.match(activities, /company_id text NOT NULL[\s\S]*project_id text NOT NULL/)
  assert.match(activities, /kind text NOT NULL/)
  assert.doesNotMatch(activities, /\b(?:course_id|objective_ids|type)\b/)
  assert.match(activities, /'LESSON'.*'PRACTICE'.*'ASSESSMENT'.*'PROJECT'.*'REVIEW'/s)
  assert.match(activities, /'DRAFT'.*'PUBLISHED'.*'CLOSED'/s)
  assert.match(activities, /'AGENT_FORMATIVE'.*'TEACHER_REQUIRED'/s)
  assert.match(schema, /learning_activity_knowledge_units_activity_fkey[\s\S]*?FOREIGN KEY \(company_id, project_id, activity_id\)[\s\S]*?learning_activities\(company_id, project_id, id\)/)
  assert.match(schema, /learning_activity_knowledge_units_unit_fkey[\s\S]*?FOREIGN KEY \(company_id, project_id, knowledge_unit_id\)[\s\S]*?learning_knowledge_units\(company_id, project_id, id\)/)

  assert.match(schema, /learning_knowledge_unit_dependencies_unit_fkey[\s\S]*?FOREIGN KEY \(company_id, project_id, knowledge_unit_id\)/)
  assert.match(schema, /learning_knowledge_unit_dependencies_prerequisite_fkey[\s\S]*?FOREIGN KEY \(company_id, project_id, prerequisite_knowledge_unit_id\)/)
  assert.match(schema, /learning_knowledge_unit_dependencies_not_self_check/)

  const states = table('learning_states')
  assert.match(states, /learning_states_pkey PRIMARY KEY \(project_id, user_id, knowledge_unit_id\)/)
  assert.match(states, /learning_states_project_member_fkey[\s\S]*?FOREIGN KEY \(company_id, project_id, user_id\)[\s\S]*?project_memberships\(company_id, project_id, user_id\)/)
  assert.match(states, /learning_states_knowledge_unit_fkey[\s\S]*?FOREIGN KEY \(company_id, project_id, knowledge_unit_id\)[\s\S]*?learning_knowledge_units\(company_id, project_id, id\)/)
  assert.match(states, /'LEARNING'.*'VERIFIED'.*'NEEDS_REVIEW'/s)

  for (const relation of [
    'learning_missions',
    'learning_mission_steps',
    'learning_attempts',
    'learning_evaluations',
  ]) {
    const definition = table(relation)
    assert.match(definition, /company_id text NOT NULL[\s\S]*project_id text NOT NULL/)
    assert.doesNotMatch(definition, /\bcourse_id\b/)
  }
  assert.match(schema, /learning_missions_conversation_project_fkey[\s\S]*?FOREIGN KEY \(conversation_id, company_id, project_id\)/)
  assert.match(schema, /learning_mission_steps_unit_fkey[\s\S]*?FOREIGN KEY \(company_id, project_id, knowledge_unit_id\)/)
  assert.match(schema, /learning_evaluations_attempt_fkey[\s\S]*?FOREIGN KEY \(company_id, project_id, attempt_id\)/)

  const attempts = table('learning_attempts')
  assert.match(attempts, /learning_attempts_single_source_check CHECK \(num_nonnulls\(activity_id, mission_step_id\) = 1\)/)
  for (const constraint of ['learning_attempts_activity_fkey', 'learning_attempts_mission_step_fkey']) {
    const foreignKey = attempts.match(new RegExp(`CONSTRAINT ${constraint}([\\s\\S]*?)(?:,\\n|$)`))?.[1] ?? ''
    assert.match(foreignKey, /FOREIGN KEY \(company_id, project_id,/)
    assert.doesNotMatch(foreignKey, /ON DELETE SET NULL/)
  }
  assert.match(schema, /uniq_learning_activity_submission[\s\S]*?company_id, project_id, activity_id, learner_id, client_submission_id/)
  assert.match(schema, /uniq_learning_mission_step_submission[\s\S]*?company_id, project_id, mission_step_id, learner_id, client_submission_id/)
})

test('LearningCase persistence matches the uppercase lifecycle and durable retry contract', () => {
  const cases = schema.match(/CREATE TABLE public\.learning_cases \(([\s\S]*?)\n\);/)?.[1] ?? ''
  const actions = schema.match(/CREATE TABLE public\.learning_case_actions \(([\s\S]*?)\n\);/)?.[1] ?? ''

  assert.match(cases, /company_id text NOT NULL[\s\S]*project_id text NOT NULL[\s\S]*user_id text NOT NULL[\s\S]*knowledge_unit_id text NOT NULL/)
  assert.match(cases, /reason text NOT NULL/)
  assert.match(cases, /version bigint DEFAULT 1 NOT NULL/)
  assert.match(cases, /'DETECTED'.*'IN_PROGRESS'.*'ESCALATED'.*'RESOLVED'.*'CLOSED'/s)
  assert.match(schema, /CREATE UNIQUE INDEX uniq_learning_cases_open[\s\S]*?\(project_id, user_id, knowledge_unit_id\)[\s\S]*?WHERE \(status <> 'CLOSED'::text\)/)

  assert.match(actions, /kind text NOT NULL[\s\S]*result text NOT NULL/)
  assert.match(actions, /idempotency_key text NOT NULL/)
  assert.match(actions, /'DIAGNOSE'.*'INTERVENE'.*'REASSESS'.*'ESCALATE'.*'OVERRIDE'.*'CLOSE'/s)
  assert.match(actions, /'APPLIED'.*'ALREADY_APPLIED'/s)
  assert.doesNotMatch(actions, /'INVALID'/)
  assert.match(actions, /learning_case_actions_transition_check/)
  assert.match(actions, /kind = 'DIAGNOSE'.*from_status = 'DETECTED'.*to_status = 'IN_PROGRESS'/s)
  assert.match(actions, /kind = 'CLOSE'.*from_status = 'RESOLVED'.*to_status = 'CLOSED'/s)
  assert.doesNotMatch(actions, /updated_at/)
  assert.match(actions, /learning_case_actions_idempotency_key UNIQUE \(company_id, project_id, idempotency_key\)/)
  for (const link of ['activity', 'mission', 'attempt', 'evaluation']) {
    assert.match(actions, new RegExp(
      `learning_case_actions_${link}_fkey[\\s\\S]*?FOREIGN KEY \\(company_id, project_id, ${link}_id\\)`,
    ))
  }
  assert.match(bootstrap, /\['learning_states', \['project_id', 'user_id', 'knowledge_unit_id'\]\]/)
  assert.match(bootstrap, /'uniq_learning_cases_open'/)
  assert.match(bootstrap, /\['learning_case_actions', 'learning_case_actions_idempotency_key', 'u'\]/)
  assert.match(bootstrap, /\['learning_case_actions', 'learning_case_actions_transition_check', 'c'\]/)
})

test('M7 domain events are bounded, ordered, tenant-owned and database append-only', () => {
  const events = schema.match(/CREATE TABLE public\.domain_events \(([\s\S]*?)\n\);/)?.[1] ?? ''
  assert.match(events, /company_id text NOT NULL/)
  assert.match(events, /project_id text,/)
  assert.match(events, /sequence bigint GENERATED ALWAYS AS IDENTITY/)
  assert.match(events, /aggregate_sequence bigint NOT NULL/)
  assert.match(events, /UNIQUE \(company_id, aggregate_type, aggregate_id, aggregate_sequence\)/)
  assert.match(events, /UNIQUE \(company_id, idempotency_key\)/)
  assert.match(events, /jsonb_typeof\(payload\) = 'object'/)
  assert.match(events, /octet_length\(payload::text\) <= 32768/)
  assert.match(schema, /CREATE TRIGGER domain_events_append_only[\s\S]*?BEFORE UPDATE OR DELETE/)
  assert.match(bootstrap, /\['domain_events', 'sequence', 'ALWAYS'\]/)
  assert.match(bootstrap, /\['domain_events', 'domain_events_append_only'\]/)
  assert.match(bootstrap, /'idx_domain_events_company_cursor'/)
  assert.match(bootstrap, /'idx_domain_events_project_cursor'/)
})

test('M8 Evidence keeps L1/L2 facts canonical and inferred Claims reviewable', () => {
  const relation = (name: string) => (
    schema.match(new RegExp(`CREATE TABLE public\\.${name} \\(([\\s\\S]*?)\\n\\);`))?.[1] ?? ''
  )
  const records = relation('evidence_records')
  const links = relation('evidence_links')
  const claims = relation('evidence_claims')

  assert.match(records, /level text NOT NULL/)
  assert.match(records, /'L1'.*'L2'/s)
  assert.doesNotMatch(records, /'L3'|'L4'/)
  assert.match(records, /'OBSERVED'.*'COMPUTED'.*'RUBRIC'/s)
  assert.match(records, /jsonb_typeof\(data\) = 'object'/)
  assert.match(records, /octet_length\(data::text\) <= 32768/)
  assert.match(records, /evidence_records_project_company_fkey/)
  assert.match(records, /evidence_records_subject_user_fkey/)

  assert.match(links, /evidence_links_record_fkey/)
  assert.match(links, /'L0'.*'L1'.*'L2'.*'L3'.*'L4'/s)
  assert.match(links, /target_kind text NOT NULL[\s\S]*target_id text NOT NULL/)

  assert.match(claims, /model_run_id text NOT NULL REFERENCES public\.agent_runs\(id\)/)
  assert.match(claims, /human_review_required boolean DEFAULT true NOT NULL/)
  assert.match(claims, /evidence_claims_human_review_check CHECK \(human_review_required\)/)
  assert.match(claims, /'PENDING'.*'APPROVED'.*'REJECTED'/s)
  assert.match(schema, /evidence_claim_evidence_pkey[\s\S]*?claim_id, evidence_id/)
  assert.match(schema, /evidence_claim_evidence_record_fkey/)
  const attempts = relation('learning_attempts')
  assert.match(attempts, /evidence_id text NOT NULL/)
  assert.doesNotMatch(attempts, /\bevidence jsonb/)
  assert.match(schema, /learning_attempts_evidence_fkey[\s\S]*?FOREIGN KEY \(company_id, project_id, evidence_id\)/)
  const canvasReports = relation('canvas_assignment_reports')
  assert.match(canvasReports, /evidence_id text NOT NULL/)
  assert.match(canvasReports, /source_evidence_ids jsonb DEFAULT '\[\]'::jsonb NOT NULL/)
  assert.doesNotMatch(canvasReports, /evidence_refs/)
  assert.match(schema, /canvas_assignment_reports_evidence_fkey[\s\S]*?FOREIGN KEY \(evidence_id\)/)
  const evaluations = relation('learning_evaluations')
  assert.match(evaluations, /source_evidence_id text/)
  assert.match(evaluations, /verifier_evidence_id text/)
  assert.doesNotMatch(evaluations, /source_report_id|verifier_report_id/)
  assert.match(schema, /learning_evaluations_source_evidence_fkey[\s\S]*?source_evidence_id/)
  assert.match(schema, /learning_evaluations_verifier_evidence_fkey[\s\S]*?verifier_evidence_id/)
  const missionSteps = relation('learning_mission_steps')
  assert.match(missionSteps, /completion_evidence_id text/)
  assert.doesNotMatch(missionSteps, /completion_report_id/)
  assert.match(bootstrap, /'evidence_records'/)
  assert.match(bootstrap, /'idx_evidence_claims_review'/)
})

test('M9 ContextThread owns domain participation while WuKong remains the message store', () => {
  const threads = schema.match(/CREATE TABLE public\.context_threads \(([\s\S]*?)\n\);/)?.[1] ?? ''
  const participants = schema.match(
    /CREATE TABLE public\.context_thread_participants \(([\s\S]*?)\n\);/,
  )?.[1] ?? ''

  assert.match(threads, /company_id text NOT NULL[\s\S]*project_id text NOT NULL/)
  assert.match(threads, /context_type text NOT NULL[\s\S]*context_id text NOT NULL/)
  assert.match(threads, /'LEARNING'.*'TEACHER_TAKEOVER'.*'INTERVENTION'.*'CASE_DISCUSSION'.*'TEACHER_OPERATIONS'/s)
  assert.match(threads, /UNIQUE \(company_id, project_id, context_type, context_id\)/)
  assert.match(schema, /context_threads_channel_company_fkey[\s\S]*?im_channel_bindings\(channel_id, company_id\)/)
  assert.match(schema, /context_threads_creator_project_fkey[\s\S]*?project_memberships\(company_id, project_id, user_id\)/)

  assert.match(participants, /PRIMARY KEY \(thread_id, participant_id\)/)
  assert.match(schema, /context_thread_participants_thread_fkey[\s\S]*?context_threads\(id, company_id, project_id\)/)
  assert.match(schema, /context_thread_participants_participant_fkey[\s\S]*?participants\(id, company_id\)/)
  assert.doesNotMatch(threads, /\b(?:message|body|content|payload)\b/)
  assert.doesNotMatch(participants, /\b(?:message|body|content|payload)\b/)
  assert.match(bootstrap, /'context_thread_participants', 'context_threads'/)
  assert.match(bootstrap, /'idx_context_thread_participants_principal'/)
})

test('M10 notifications route bounded event-derived Intent into canonical Delivery records', () => {
  const relation = (name: string) => (
    schema.match(new RegExp(`CREATE TABLE public\\.${name} \\(([\\s\\S]*?)\\n\\);`))?.[1] ?? ''
  )
  const intents = relation('notification_intents')
  const preferences = relation('notification_preferences')
  const deliveries = relation('notification_deliveries')
  const links = relation('notification_delivery_intents')

  assert.doesNotMatch(schema, /CREATE TABLE public\.learning_notification_/)
  assert.match(intents, /source_event_sequence bigint NOT NULL/)
  assert.match(intents, /'IMMEDIATE'.*'DAILY'.*'WEEKLY'.*'FORMAL'/s)
  assert.match(intents, /char_length\(summary\) BETWEEN 1 AND 500/)
  assert.match(intents, /left\(link_path, 1\) = '\/'/)
  assert.match(schema, /notification_intents_source_event_fkey[\s\S]*?domain_events\(sequence\) ON DELETE RESTRICT/)
  assert.match(schema, /notification_intents_recipient_project_fkey[\s\S]*?project_memberships\(company_id, project_id, user_id\)/)

  assert.match(preferences, /push_enabled boolean DEFAULT false NOT NULL/)
  assert.match(preferences, /notification_preferences_push_unavailable_check CHECK \(push_enabled = false\)/)
  assert.match(preferences, /notification_preferences_member_project_fkey[\s\S]*?project_memberships\(company_id, project_id, user_id\)/)
  assert.match(deliveries, /'IN_APP'.*'EMAIL'.*'PUSH'/s)
  assert.match(deliveries, /'PENDING'.*'SENDING'.*'SENT'.*'FAILED'.*'CANCELLED'/s)
  assert.match(deliveries, /UNIQUE \(company_id, project_id, recipient_user_id, channel, policy, window_key\)/)
  assert.match(links, /PRIMARY KEY \(delivery_id, intent_id\)/)
  assert.match(bootstrap, /'learning_notification_deliveries'.*'learning_notification_preferences'/s)
  assert.match(bootstrap, /'idx_notification_intents_pending'/)
  assert.match(bootstrap, /'idx_notification_deliveries_pending'/)
})

test('M11 ProjectInvite grants only Student membership and retires Course invitations', () => {
  const invitations = schema.match(/CREATE TABLE public\.project_invitations \(([\s\S]*?)\n\);/)?.[1] ?? ''
  const acceptances = schema.match(/CREATE TABLE public\.project_invitation_acceptances \(([\s\S]*?)\n\);/)?.[1] ?? ''
  assert.match(invitations, /project_id text NOT NULL/)
  assert.doesNotMatch(invitations, /\bcourse_id\b|\brole\b/)
  assert.doesNotMatch(acceptances, /\brole\b/)
  assert.match(schema, /project_invitations_project_id_company_id_fkey[\s\S]*projects\(id, company_id\) ON DELETE CASCADE/)
  assert.doesNotMatch(schema, /CREATE TABLE public\.course_invitation/)
  assert.match(bootstrap, /'course_invitation_acceptances'.*'course_invitations'/s)
})

test('Plan and Entitlement are independent and accept JSON scalar values only', () => {
  assert.match(schema, /plans_code_key UNIQUE \(code\)/)
  assert.match(schema, /entitlements_code_key UNIQUE \(code\)/)
  assert.match(schema, /plan_entitlements_pkey PRIMARY KEY \(plan_id, entitlement_id\)/)
  assert.match(schema, /jsonb_typeof\(value\).*?'boolean'.*?'number'.*?'string'/s)
  assert.doesNotMatch(schema, /CREATE TABLE public\.(?:subscriptions|project_entitlement_overrides)\b/)
  assert.match(entitlementRepository, /ENTITLEMENT_CODES/)
  assert.match(entitlementRepository, /JSON\.stringify\(value\)/)
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
