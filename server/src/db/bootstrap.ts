import { readFile } from 'node:fs/promises'
import type { PoolClient } from 'pg'
import { ensurePersonalFreePlan } from '../modules/entitlements/public.js'
import { pool } from './pool.js'

const V1_SCHEMA_URL = new URL('./schema.sql', import.meta.url)
const V1_SCHEMA_MARKER = 'LingxiLoop schema v1'

type Queryable = Pick<PoolClient, 'query'>

const REQUIRED_V1_RELATIONS = [
  'agent_action_executions', 'agent_approvals', 'agent_autonomy',
  'agent_autonomy_rules', 'agent_climate', 'agent_events', 'agent_handoffs',
  'agent_host_actions', 'agent_log', 'agent_memory_evidence',
  'agent_os_approvals', 'agent_os_session_leases', 'agent_os_sessions',
  'agent_routine_runs', 'agent_routines', 'agent_runs', 'agent_tasks',
  'agent_triages', 'agent_work_items', 'agent_workspace',
  'audit_events', 'board_card_comments', 'board_cards', 'board_columns',
  'board_mention_reads', 'boards', 'calendar_dispatches', 'calendar_events',
  'calendar_reminders', 'canvas_activity', 'canvas_agent_assignments',
  'canvas_assignment_dependencies', 'canvas_assignment_reports',
  'canvas_comments', 'canvas_frames', 'canvas_presence', 'canvases', 'companies',
  'company_invitations', 'company_memberships', 'convene_sessions',
  'company_onboarding_effects',
  'convene_transcript', 'convening_info',
  'context_thread_participants', 'context_threads', 'conversation_mutes', 'conversation_reads',
  'conversation_source_exclusions', 'conversations', 'course_invitation_acceptances', 'course_invitations',
  'courses', 'document_mention_deliveries', 'document_mentions', 'document_snapshots',
  'document_updates', 'documents', 'domain_events', 'email_attachments', 'email_contacts',
  'email_messages', 'email_sequence_counters', 'entitlements', 'evidence_claim_evidence',
  'evidence_claims', 'evidence_links', 'evidence_records',
  'eval_cases', 'eval_runs', 'eval_stage_results',
  'im_channel_bindings', 'im_poll_votes', 'im_polls',
  'im_read_receipt_advances', 'im_send_acceptances', 'knowledge_insight_bindings',
  'knowledge_note_bindings', 'knowledge_notebook_bindings',
  'knowledge_source_chat_sessions', 'knowledge_source_jobs', 'knowledge_sources',
  'learning_activities', 'learning_activity_knowledge_units', 'learning_attempts',
  'learning_case_actions', 'learning_cases', 'learning_course_rooms',
  'learning_course_teacher_rooms', 'learning_evaluations',
  'learning_knowledge_unit_dependencies', 'learning_knowledge_units',
  'learning_mission_steps', 'learning_missions',
  'learning_effects', 'learning_states',
  'learning_project_teacher_agents', 'llm_calls', 'message_reactions',
  'notification_deliveries', 'notification_delivery_intents', 'notification_intents',
  'notification_preferences',
  'participants', 'plan_entitlements', 'plans', 'project_memberships',
  'project_visits', 'projects', 'sessions',
  'tool_calls', 'user_identities', 'user_preferences', 'users',
  'ws_tickets', 'wukong_webhook_receipts',
] as const

const FORBIDDEN_V1_RELATIONS = [
  'app_settings', 'company_members', 'course_members', 'learning_mastery',
  'learning_mastery_events', 'learning_objective_dependencies',
  'learning_objectives', 'learning_notification_deliveries',
  'learning_notification_preferences', 'permissions', 'waitlist',
] as const

const FORBIDDEN_V1_COLUMNS = [
  ['companies', 'owner_user_id'],
  ['courses', 'kind'],
  ['courses', 'status'],
  ['learning_activities', 'course_id'],
  ['learning_activities', 'objective_ids'],
  ['learning_activities', 'type'],
  ['learning_attempts', 'course_id'],
  ['learning_attempts', 'evidence'],
  ['canvas_assignment_reports', 'evidence_refs'],
  ['learning_evaluations', 'source_report_id'],
  ['learning_evaluations', 'verifier_report_id'],
  ['learning_missions', 'course_id'],
  ['learning_missions', 'mission_kind'],
  ['learning_mission_steps', 'objective_id'],
  ['learning_mission_steps', 'completion_report_id'],
  ['learning_mission_steps', 'type'],
  ['projects', 'is_general'],
  ['users', 'is_admin'],
  ['users', 'role'],
  ['users', 'plan'],
  ['users', 'is_teacher'],
  ['users', 'is_pro'],
  ['users', 'is_paid'],
  ['users', 'account_type'],
] as const

const REQUIRED_V1_COLUMNS = [
  ['agent_work_items', 'execution_role'],
  ['agent_work_items', 'authorization_user_id'],
  ['agent_os_approvals', 'scope'],
  ['canvas_agent_assignments', 'verifies_assignment_id'],
  ['canvas_assignment_reports', 'evidence_id'],
  ['canvas_assignment_reports', 'source_evidence_ids'],
  ['context_threads', 'context_type'],
  ['context_threads', 'context_id'],
  ['context_threads', 'channel_id'],
  ['context_thread_participants', 'participant_id'],
  ['canvases', 'authorization_user_id'],
  ['llm_calls', 'company_id'],
  ['llm_calls', 'purpose'],
  ['llm_calls', 'status'],
  ['message_reactions', 'company_id'],
  ['message_reactions', 'conversation_id'],
  ['message_reactions', 'message_seq'],
  ['notification_intents', 'source_event_sequence'],
  ['notification_intents', 'policy'],
  ['notification_intents', 'summary'],
  ['notification_intents', 'link_path'],
  ['notification_preferences', 'project_id'],
  ['notification_preferences', 'push_enabled'],
  ['notification_preferences', 'daily_time'],
  ['notification_preferences', 'weekly_day'],
  ['notification_deliveries', 'window_key'],
  ['notification_deliveries', 'summary'],
  ['notification_deliveries', 'link_path'],
  ['notification_delivery_intents', 'intent_id'],
  ['agent_climate', 'company_id'],
  ['calendar_events', 'project_id'],
  ['document_mention_deliveries', 'recipients'],
  ['document_mention_deliveries', 'status'],
  ['domain_events', 'sequence'],
  ['domain_events', 'aggregate_sequence'],
  ['domain_events', 'schema_version'],
  ['domain_events', 'idempotency_key'],
  ['domain_events', 'actor_type'],
  ['domain_events', 'payload'],
  ['evidence_claims', 'model_run_id'],
  ['evidence_claims', 'human_review_required'],
  ['evidence_links', 'evidence_id'],
  ['evidence_links', 'target_level'],
  ['evidence_records', 'level'],
  ['evidence_records', 'derivation'],
  ['evidence_records', 'data'],
  ['email_messages', 'author_id'],
  ['email_messages', 'body'],
  ['email_messages', 'sequence'],
  ['email_sequence_counters', 'company_id'],
  ['im_polls', 'published_revision'],
  ['im_polls', 'request_fingerprint'],
  ['learning_effects', 'effect_key'],
  ['learning_effects', 'generation'],
  ['learning_effects', 'queued_payload'],
  ['learning_activities', 'project_id'],
  ['learning_activities', 'kind'],
  ['learning_attempts', 'project_id'],
  ['learning_attempts', 'evidence_id'],
  ['learning_case_actions', 'project_id'],
  ['learning_case_actions', 'case_id'],
  ['learning_case_actions', 'user_id'],
  ['learning_case_actions', 'knowledge_unit_id'],
  ['learning_case_actions', 'kind'],
  ['learning_case_actions', 'result'],
  ['learning_case_actions', 'idempotency_key'],
  ['learning_cases', 'project_id'],
  ['learning_cases', 'user_id'],
  ['learning_cases', 'knowledge_unit_id'],
  ['learning_cases', 'status'],
  ['learning_cases', 'reason'],
  ['learning_cases', 'version'],
  ['learning_evaluations', 'company_id'],
  ['learning_evaluations', 'project_id'],
  ['learning_evaluations', 'source_evidence_id'],
  ['learning_evaluations', 'verifier_evidence_id'],
  ['learning_knowledge_units', 'company_id'],
  ['learning_knowledge_units', 'project_id'],
  ['learning_missions', 'project_id'],
  ['learning_missions', 'kind'],
  ['learning_mission_steps', 'company_id'],
  ['learning_mission_steps', 'project_id'],
  ['learning_mission_steps', 'knowledge_unit_id'],
  ['learning_mission_steps', 'kind'],
  ['learning_mission_steps', 'completion_evidence_id'],
  ['learning_states', 'company_id'],
  ['learning_states', 'project_id'],
  ['learning_states', 'user_id'],
  ['learning_states', 'knowledge_unit_id'],
  ['company_onboarding_effects', 'lease_token'],
  ['companies', 'plan_id'],
  ['companies', 'type'],
  ['companies', 'status'],
  ['companies', 'personal_owner_user_id'],
  ['plans', 'code'],
  ['plans', 'status'],
  ['entitlements', 'code'],
  ['plan_entitlements', 'value'],
  ['company_memberships', 'id'],
  ['company_memberships', 'role'],
  ['company_memberships', 'status'],
  ['project_memberships', 'id'],
  ['project_memberships', 'company_id'],
  ['project_memberships', 'project_id'],
  ['project_memberships', 'role'],
  ['project_memberships', 'status'],
  ['projects', 'plan_id'],
  ['projects', 'kind'],
  ['projects', 'status'],
  ['projects', 'is_default'],
] as const

const REQUIRED_V1_NOT_NULL_COLUMNS = [
  ['canvas_assignment_reports', 'evidence_id', null],
  ['canvas_assignment_reports', 'source_evidence_ids', "'[]'::jsonb"],
  ['context_threads', 'company_id', null],
  ['context_threads', 'project_id', null],
  ['context_threads', 'context_type', null],
  ['context_threads', 'context_id', null],
  ['context_threads', 'channel_id', null],
  ['context_threads', 'created_by', null],
  ['context_thread_participants', 'company_id', null],
  ['context_thread_participants', 'project_id', null],
  ['context_thread_participants', 'participant_id', null],
  ['message_reactions', 'company_id', null],
  ['notification_intents', 'company_id', null],
  ['notification_intents', 'project_id', null],
  ['notification_intents', 'recipient_user_id', null],
  ['notification_intents', 'source_event_sequence', null],
  ['notification_intents', 'policy', null],
  ['notification_intents', 'summary', null],
  ['notification_intents', 'link_path', null],
  ['notification_intents', 'status', "'PENDING'::text"],
  ['notification_preferences', 'push_enabled', 'false'],
  ['notification_preferences', 'daily_time', "'19:00:00'::time without time zone"],
  ['notification_preferences', 'weekly_day', '1'],
  ['notification_deliveries', 'company_id', null],
  ['notification_deliveries', 'project_id', null],
  ['notification_deliveries', 'recipient_user_id', null],
  ['notification_deliveries', 'window_key', null],
  ['notification_deliveries', 'summary', null],
  ['notification_deliveries', 'link_path', null],
  ['notification_deliveries', 'status', "'PENDING'::text"],
  ['agent_climate', 'company_id', null],
  ['calendar_events', 'project_id', null],
  ['document_mention_deliveries', 'recipients', null],
  ['document_mention_deliveries', 'status', "'queued'::text"],
  ['domain_events', 'company_id', null],
  ['domain_events', 'aggregate_sequence', null],
  ['domain_events', 'schema_version', '1'],
  ['domain_events', 'idempotency_key', null],
  ['domain_events', 'actor_type', null],
  ['domain_events', 'payload', null],
  ['evidence_claims', 'model_run_id', null],
  ['evidence_claims', 'human_review_required', 'true'],
  ['evidence_claims', 'status', "'PENDING'::text"],
  ['evidence_links', 'company_id', null],
  ['evidence_links', 'project_id', null],
  ['evidence_links', 'evidence_id', null],
  ['evidence_records', 'company_id', null],
  ['evidence_records', 'project_id', null],
  ['evidence_records', 'level', null],
  ['evidence_records', 'derivation', null],
  ['evidence_records', 'data', null],
  ['learning_activities', 'company_id', null],
  ['learning_activities', 'project_id', null],
  ['learning_activities', 'status', "'DRAFT'::text"],
  ['learning_attempts', 'company_id', null],
  ['learning_attempts', 'project_id', null],
  ['learning_attempts', 'learner_id', null],
  ['learning_attempts', 'evidence_id', null],
  ['learning_attempts', 'status', "'SUBMITTED'::text"],
  ['learning_case_actions', 'company_id', null],
  ['learning_case_actions', 'project_id', null],
  ['learning_case_actions', 'case_id', null],
  ['learning_case_actions', 'user_id', null],
  ['learning_case_actions', 'knowledge_unit_id', null],
  ['learning_case_actions', 'idempotency_key', null],
  ['learning_cases', 'company_id', null],
  ['learning_cases', 'project_id', null],
  ['learning_cases', 'user_id', null],
  ['learning_cases', 'knowledge_unit_id', null],
  ['learning_cases', 'reason', null],
  ['learning_cases', 'status', "'DETECTED'::text"],
  ['learning_cases', 'version', '1'],
  ['learning_evaluations', 'company_id', null],
  ['learning_evaluations', 'project_id', null],
  ['learning_evaluations', 'attempt_id', null],
  ['learning_evaluations', 'status', "'PENDING'::text"],
  ['learning_knowledge_units', 'company_id', null],
  ['learning_knowledge_units', 'project_id', null],
  ['learning_knowledge_units', 'status', "'DRAFT'::text"],
  ['learning_missions', 'company_id', null],
  ['learning_missions', 'project_id', null],
  ['learning_missions', 'learner_id', null],
  ['learning_missions', 'status', "'PLANNING'::text"],
  ['learning_mission_steps', 'company_id', null],
  ['learning_mission_steps', 'project_id', null],
  ['learning_mission_steps', 'mission_id', null],
  ['learning_mission_steps', 'status', "'OPEN'::text"],
  ['learning_states', 'company_id', null],
  ['learning_states', 'status', "'LEARNING'::text"],
  ['learning_states', 'version', '1'],
  ['companies', 'plan_id', null],
  ['companies', 'type', null],
  ['companies', 'status', "'ACTIVE'::text"],
  ['company_memberships', 'status', "'ACTIVE'::text"],
  ['project_memberships', 'status', "'ACTIVE'::text"],
  ['projects', 'kind', null],
  ['projects', 'status', "'ACTIVE'::text"],
  ['projects', 'is_default', 'false'],
] as const

const REQUIRED_V1_PRIMARY_KEYS = [
  ['agent_climate', ['company_id', 'agent_id', 'about_id']],
  ['company_memberships', ['id']],
  ['context_thread_participants', ['thread_id', 'participant_id']],
  ['context_threads', ['id']],
  ['evidence_claim_evidence', ['company_id', 'project_id', 'claim_id', 'evidence_id']],
  ['learning_activity_knowledge_units', ['company_id', 'project_id', 'activity_id', 'knowledge_unit_id']],
  ['learning_knowledge_unit_dependencies', [
    'company_id', 'project_id', 'knowledge_unit_id', 'prerequisite_knowledge_unit_id',
  ]],
  ['learning_states', ['project_id', 'user_id', 'knowledge_unit_id']],
  ['notification_delivery_intents', ['delivery_id', 'intent_id']],
  ['notification_deliveries', ['id']],
  ['notification_intents', ['id']],
  ['notification_preferences', ['id']],
  ['project_memberships', ['id']],
  ['plans', ['id']],
  ['entitlements', ['id']],
  ['plan_entitlements', ['plan_id', 'entitlement_id']],
] as const

const REQUIRED_V1_IDENTITY_COLUMNS = [
  ['domain_events', 'sequence', 'ALWAYS'],
] as const

const REQUIRED_V1_CONSTRAINTS = [
  ['agent_work_items', 'agent_work_items_authorization_user_id_fkey', 'f'],
  ['llm_calls', 'llm_calls_pkey', 'p'],
  ['llm_calls', 'llm_calls_company_id_fkey', 'f'],
  ['llm_calls', 'llm_calls_source_check', 'c'],
  ['llm_calls', 'llm_calls_status_check', 'c'],
  ['llm_calls', 'llm_calls_tokens_check', 'c'],
  ['participants', 'participants_agent_bloub_only', 'c'],
  ['canvases', 'canvases_authorization_user_id_fkey', 'f'],
  ['canvas_assignment_reports', 'canvas_assignment_reports_evidence_fkey', 'f'],
  ['canvas_assignment_reports', 'canvas_assignment_reports_source_evidence_check', 'c'],
  ['context_threads', 'context_threads_scope_key', 'u'],
  ['context_threads', 'context_threads_channel_key', 'u'],
  ['context_threads', 'context_threads_context_type_check', 'c'],
  ['context_threads', 'context_threads_project_company_fkey', 'f'],
  ['context_threads', 'context_threads_creator_project_fkey', 'f'],
  ['context_threads', 'context_threads_channel_company_fkey', 'f'],
  ['context_thread_participants', 'context_thread_participants_thread_fkey', 'f'],
  ['context_thread_participants', 'context_thread_participants_participant_fkey', 'f'],
  ['im_channel_bindings', 'im_channel_bindings_channel_company_key', 'u'],
  ['notification_intents', 'notification_intents_source_recipient_key', 'u'],
  ['notification_intents', 'notification_intents_project_company_fkey', 'f'],
  ['notification_intents', 'notification_intents_recipient_project_fkey', 'f'],
  ['notification_intents', 'notification_intents_source_event_fkey', 'f'],
  ['notification_intents', 'notification_intents_category_check', 'c'],
  ['notification_intents', 'notification_intents_policy_check', 'c'],
  ['notification_intents', 'notification_intents_status_check', 'c'],
  ['notification_preferences', 'notification_preferences_push_unavailable_check', 'c'],
  ['notification_preferences', 'notification_preferences_member_company_fkey', 'f'],
  ['notification_preferences', 'notification_preferences_project_company_fkey', 'f'],
  ['notification_preferences', 'notification_preferences_member_project_fkey', 'f'],
  ['notification_deliveries', 'notification_deliveries_identity_key', 'u'],
  ['notification_deliveries', 'notification_deliveries_recipient_project_fkey', 'f'],
  ['notification_deliveries', 'notification_deliveries_channel_check', 'c'],
  ['notification_deliveries', 'notification_deliveries_policy_check', 'c'],
  ['notification_deliveries', 'notification_deliveries_status_check', 'c'],
  ['notification_delivery_intents', 'notification_delivery_intents_delivery_fkey', 'f'],
  ['notification_delivery_intents', 'notification_delivery_intents_intent_fkey', 'f'],
  ['document_mention_deliveries', 'document_mention_deliveries_recipients_check', 'c'],
  ['document_mention_deliveries', 'document_mention_deliveries_status_check', 'c'],
  ['domain_events', 'domain_events_idempotency_key', 'u'],
  ['domain_events', 'domain_events_sequence_key', 'u'],
  ['domain_events', 'domain_events_aggregate_sequence_key', 'u'],
  ['domain_events', 'domain_events_project_company_fkey', 'f'],
  ['domain_events', 'domain_events_actor_company_fkey', 'f'],
  ['domain_events', 'domain_events_identity_check', 'c'],
  ['domain_events', 'domain_events_aggregate_sequence_check', 'c'],
  ['domain_events', 'domain_events_schema_version_check', 'c'],
  ['domain_events', 'domain_events_actor_check', 'c'],
  ['domain_events', 'domain_events_payload_check', 'c'],
  ['evidence_claim_evidence', 'evidence_claim_evidence_claim_fkey', 'f'],
  ['evidence_claim_evidence', 'evidence_claim_evidence_record_fkey', 'f'],
  ['evidence_claims', 'evidence_claims_scope_key', 'u'],
  ['evidence_claims', 'evidence_claims_human_review_check', 'c'],
  ['evidence_claims', 'evidence_claims_status_check', 'c'],
  ['evidence_claims', 'evidence_claims_project_company_fkey', 'f'],
  ['evidence_links', 'evidence_links_identity_key', 'u'],
  ['evidence_links', 'evidence_links_record_fkey', 'f'],
  ['evidence_links', 'evidence_links_target_level_check', 'c'],
  ['evidence_records', 'evidence_records_scope_key', 'u'],
  ['evidence_records', 'evidence_records_project_company_fkey', 'f'],
  ['evidence_records', 'evidence_records_subject_user_fkey', 'f'],
  ['evidence_records', 'evidence_records_level_check', 'c'],
  ['evidence_records', 'evidence_records_derivation_check', 'c'],
  ['evidence_records', 'evidence_records_data_check', 'c'],
  ['learning_activities', 'learning_activities_scope_key', 'u'],
  ['learning_activities', 'learning_activities_project_company_fkey', 'f'],
  ['learning_activity_knowledge_units', 'learning_activity_knowledge_units_activity_fkey', 'f'],
  ['learning_activity_knowledge_units', 'learning_activity_knowledge_units_unit_fkey', 'f'],
  ['learning_attempts', 'learning_attempts_scope_key', 'u'],
  ['learning_attempts', 'learning_attempts_single_source_check', 'c'],
  ['learning_attempts', 'learning_attempts_project_company_fkey', 'f'],
  ['learning_attempts', 'learning_attempts_learner_project_fkey', 'f'],
  ['learning_attempts', 'learning_attempts_activity_fkey', 'f'],
  ['learning_attempts', 'learning_attempts_mission_step_fkey', 'f'],
  ['learning_attempts', 'learning_attempts_evidence_fkey', 'f'],
  ['learning_case_actions', 'learning_case_actions_idempotency_key', 'u'],
  ['learning_case_actions', 'learning_case_actions_case_fkey', 'f'],
  ['learning_case_actions', 'learning_case_actions_activity_fkey', 'f'],
  ['learning_case_actions', 'learning_case_actions_mission_fkey', 'f'],
  ['learning_case_actions', 'learning_case_actions_attempt_fkey', 'f'],
  ['learning_case_actions', 'learning_case_actions_evaluation_fkey', 'f'],
  ['learning_case_actions', 'learning_case_actions_kind_check', 'c'],
  ['learning_case_actions', 'learning_case_actions_result_check', 'c'],
  ['learning_case_actions', 'learning_case_actions_transition_check', 'c'],
  ['learning_cases', 'learning_cases_scope_key', 'u'],
  ['learning_cases', 'learning_cases_project_member_fkey', 'f'],
  ['learning_cases', 'learning_cases_knowledge_unit_fkey', 'f'],
  ['learning_cases', 'learning_cases_status_check', 'c'],
  ['learning_evaluations', 'learning_evaluations_scope_key', 'u'],
  ['learning_evaluations', 'learning_evaluations_attempt_fkey', 'f'],
  ['learning_evaluations', 'learning_evaluations_source_evidence_fkey', 'f'],
  ['learning_evaluations', 'learning_evaluations_verifier_evidence_fkey', 'f'],
  ['learning_knowledge_unit_dependencies', 'learning_knowledge_unit_dependencies_unit_fkey', 'f'],
  ['learning_knowledge_unit_dependencies', 'learning_knowledge_unit_dependencies_prerequisite_fkey', 'f'],
  ['learning_knowledge_unit_dependencies', 'learning_knowledge_unit_dependencies_not_self_check', 'c'],
  ['learning_knowledge_units', 'learning_knowledge_units_scope_key', 'u'],
  ['learning_knowledge_units', 'learning_knowledge_units_project_company_fkey', 'f'],
  ['learning_missions', 'learning_missions_scope_key', 'u'],
  ['learning_missions', 'learning_missions_idempotency_key', 'u'],
  ['learning_missions', 'learning_missions_project_company_fkey', 'f'],
  ['learning_missions', 'learning_missions_learner_project_fkey', 'f'],
  ['learning_missions', 'learning_missions_conversation_project_fkey', 'f'],
  ['learning_missions', 'learning_missions_coordinator_company_fkey', 'f'],
  ['learning_mission_steps', 'learning_mission_steps_scope_key', 'u'],
  ['learning_mission_steps', 'learning_mission_steps_mission_fkey', 'f'],
  ['learning_mission_steps', 'learning_mission_steps_unit_fkey', 'f'],
  ['learning_mission_steps', 'learning_mission_steps_completion_attempt_fkey', 'f'],
  ['learning_mission_steps', 'learning_mission_steps_completion_evidence_fkey', 'f'],
  ['learning_states', 'learning_states_pkey', 'p'],
  ['learning_states', 'learning_states_project_member_fkey', 'f'],
  ['learning_states', 'learning_states_knowledge_unit_fkey', 'f'],
  ['learning_effects', 'learning_effects_effect_identity_key', 'u'],
  ['company_onboarding_effects', 'company_onboarding_effects_identity_key', 'u'],
  ['company_onboarding_effects', 'company_onboarding_effects_member_fkey', 'f'],
  ['company_onboarding_effects', 'company_onboarding_effects_lease_check', 'c'],
  ['email_attachments', 'email_attachments_message_scope_fkey', 'f'],
  ['email_messages', 'email_messages_conversation_id_fkey', 'f'],
  ['email_sequence_counters', 'email_sequence_counters_conversation_id_fkey', 'f'],
  ['companies', 'companies_plan_id_fkey', 'f'],
  ['companies', 'companies_personal_owner_user_id_fkey', 'f'],
  ['companies', 'companies_type_check', 'c'],
  ['companies', 'companies_status_check', 'c'],
  ['companies', 'companies_type_status_check', 'c'],
  ['companies', 'companies_personal_owner_check', 'c'],
  ['company_memberships', 'company_memberships_pkey', 'p'],
  ['company_memberships', 'company_memberships_company_id_fkey', 'f'],
  ['company_memberships', 'company_memberships_user_id_fkey', 'f'],
  ['company_memberships', 'company_memberships_role_check', 'c'],
  ['company_memberships', 'company_memberships_status_check', 'c'],
  ['company_memberships', 'company_memberships_company_id_user_id_key', 'u'],
  ['company_memberships', 'company_memberships_user_id_company_id_key', 'u'],
  ['project_memberships', 'project_memberships_company_id_user_id_fkey', 'f'],
  ['project_memberships', 'project_memberships_project_id_company_id_fkey', 'f'],
  ['project_memberships', 'project_memberships_company_id_project_id_user_id_key', 'u'],
  ['project_memberships', 'project_memberships_project_id_user_id_key', 'u'],
  ['project_memberships', 'project_memberships_user_id_project_id_key', 'u'],
  ['project_memberships', 'project_memberships_role_check', 'c'],
  ['project_memberships', 'project_memberships_status_check', 'c'],
  ['plans', 'plans_code_key', 'u'],
  ['plans', 'plans_status_check', 'c'],
  ['entitlements', 'entitlements_code_key', 'u'],
  ['plan_entitlements', 'plan_entitlements_pkey', 'p'],
  ['plan_entitlements', 'plan_entitlements_plan_id_fkey', 'f'],
  ['plan_entitlements', 'plan_entitlements_entitlement_id_fkey', 'f'],
  ['plan_entitlements', 'plan_entitlements_scalar_value_check', 'c'],
  ['projects', 'projects_plan_id_fkey', 'f'],
  ['projects', 'projects_kind_check', 'c'],
  ['projects', 'projects_status_check', 'c'],
  ['projects', 'projects_kind_status_check', 'c'],
] as const

const FORBIDDEN_V1_CONSTRAINTS = [
  ['message_reactions', 'message_reactions_message_id_fkey'],
] as const

const REQUIRED_V1_TRIGGERS = [
  ['domain_events', 'domain_events_append_only'],
] as const

const REQUIRED_V1_INDEXES = [
  'idx_llm_calls_company_created',
  'idx_llm_calls_run_created',
  'idx_document_mention_deliveries_due',
  'idx_document_mention_deliveries_company',
  'idx_context_thread_participants_principal',
  'idx_notification_deliveries_pending',
  'idx_notification_intents_pending',
  'uq_notification_preferences_global',
  'uq_notification_preferences_project',
  'idx_domain_events_company_cursor',
  'idx_domain_events_project_cursor',
  'idx_evidence_claims_review',
  'idx_evidence_links_target',
  'idx_evidence_records_subject',
  'idx_company_onboarding_effects_due',
  'idx_conversations_id_company_project',
  'idx_email_messages_convo_seq',
  'idx_email_messages_identity_scope',
  'idx_project_memberships_company_user_role',
  'idx_project_memberships_project_role',
  'idx_companies_personal_owner',
  'idx_projects_one_default',
  'idx_learning_activities_project',
  'idx_learning_activity_knowledge_units_unit',
  'idx_learning_attempts_learner',
  'idx_learning_case_actions_case',
  'idx_learning_cases_project_status',
  'idx_learning_evaluations_review',
  'idx_learning_knowledge_unit_dependencies_prerequisite',
  'idx_learning_knowledge_units_project',
  'idx_learning_missions_learner',
  'idx_learning_mission_steps',
  'idx_learning_states_due',
  'uniq_learning_activity_submission',
  'uniq_learning_cases_open',
  'uniq_learning_mission_step_submission',
  'uniq_email_messages_smtp_id',
] as const

const REQUIRED_V1_INDEX_DEFINITIONS = [
  [
    'uniq_email_messages_smtp_id',
    'CREATE UNIQUE INDEX uniq_email_messages_smtp_id ON public.email_messages USING btree (company_id, lower(smtp_message_id)) WHERE (smtp_message_id IS NOT NULL)',
  ],
  [
    'uniq_learning_cases_open',
    "CREATE UNIQUE INDEX uniq_learning_cases_open ON public.learning_cases USING btree (project_id, user_id, knowledge_unit_id) WHERE (status <> 'CLOSED'::text)",
  ],
] as const

async function userRelationCount(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ count: string }>(`
    SELECT COUNT(*)::text AS count
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'public'
       AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  `)
  return Number(rows[0]?.count ?? 0)
}

async function schemaMarker(client: Queryable): Promise<string | null> {
  const { rows } = await client.query<{ marker: string | null }>(`
    SELECT obj_description('public'::regnamespace, 'pg_namespace') AS marker
  `)
  return rows[0]?.marker ?? null
}

async function v1SchemaReady(client: Queryable): Promise<boolean> {
  const { rows: relationRows } = await client.query<{ name: string }>(
    `SELECT name FROM unnest($1::text[]) AS required(name)
      WHERE to_regclass('public.' || required.name) IS NULL`,
    [REQUIRED_V1_RELATIONS],
  )
  if (relationRows.length > 0) return false
  const { rows: forbiddenRelationRows } = await client.query<{ name: string }>(
    `SELECT name FROM unnest($1::text[]) AS forbidden(name)
      WHERE to_regclass('public.' || forbidden.name) IS NOT NULL`,
    [FORBIDDEN_V1_RELATIONS],
  )
  if (forbiddenRelationRows.length > 0) return false
  const tables = REQUIRED_V1_COLUMNS.map(([table]) => table)
  const columns = REQUIRED_V1_COLUMNS.map(([, column]) => column)
  const { rows: columnRows } = await client.query<{ table_name: string; column_name: string }>(
    `SELECT required.table_name, required.column_name
       FROM unnest($1::text[], $2::text[]) AS required(table_name, column_name)
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns actual
         WHERE actual.table_schema='public'
           AND actual.table_name=required.table_name
           AND actual.column_name=required.column_name
      )`,
    [tables, columns],
  )
  if (columnRows.length > 0) return false
  const forbiddenTables = FORBIDDEN_V1_COLUMNS.map(([table]) => table)
  const forbiddenColumns = FORBIDDEN_V1_COLUMNS.map(([, column]) => column)
  const { rows: forbiddenColumnRows } = await client.query(
    `SELECT forbidden.table_name,forbidden.column_name
       FROM unnest($1::text[],$2::text[]) AS forbidden(table_name,column_name)
       JOIN information_schema.columns actual
         ON actual.table_schema='public' AND actual.table_name=forbidden.table_name
        AND actual.column_name=forbidden.column_name`,
    [forbiddenTables, forbiddenColumns],
  )
  if (forbiddenColumnRows.length > 0) return false
  for (const [tableName, columnName, expectedDefault] of REQUIRED_V1_NOT_NULL_COLUMNS) {
    const { rows } = await client.query<{ is_nullable: string; column_default: string | null }>(
      `SELECT is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [tableName, columnName],
    )
    if (rows[0]?.is_nullable !== 'NO' || rows[0].column_default !== expectedDefault) return false
  }
  for (const [tableName, columnName, identityGeneration] of REQUIRED_V1_IDENTITY_COLUMNS) {
    const { rows } = await client.query<{ is_identity: string; identity_generation: string | null }>(
      `SELECT is_identity,identity_generation
         FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
      [tableName, columnName],
    )
    if (rows[0]?.is_identity !== 'YES' || rows[0].identity_generation !== identityGeneration) return false
  }
  for (const [tableName, expectedColumns] of REQUIRED_V1_PRIMARY_KEYS) {
    const { rows } = await client.query<{ columns: string[] }>(
      `SELECT json_agg(key_column.column_name ORDER BY key_column.ordinal_position) AS columns
         FROM information_schema.table_constraints constraint_info
         JOIN information_schema.key_column_usage key_column
           ON key_column.constraint_schema = constraint_info.constraint_schema
          AND key_column.constraint_name = constraint_info.constraint_name
        WHERE constraint_info.table_schema = 'public'
          AND constraint_info.table_name = $1
          AND constraint_info.constraint_type = 'PRIMARY KEY'`,
      [tableName],
    )
    if (JSON.stringify(rows[0]?.columns ?? []) !== JSON.stringify(expectedColumns)) return false
  }
  const constraintTables = REQUIRED_V1_CONSTRAINTS.map(([table]) => table)
  const constraintNames = REQUIRED_V1_CONSTRAINTS.map(([, name]) => name)
  const constraintTypes = REQUIRED_V1_CONSTRAINTS.map(([, , type]) => type)
  const { rows: constraintRows } = await client.query<{ name: string }>(
    `SELECT required.name
       FROM unnest($1::text[], $2::text[], $3::text[]) AS required(table_name, name, constraint_type)
      WHERE NOT EXISTS (
        SELECT 1
          FROM pg_constraint actual
          JOIN pg_class owning_table ON owning_table.oid=actual.conrelid
          JOIN pg_namespace owning_schema ON owning_schema.oid=owning_table.relnamespace
         WHERE owning_schema.nspname='public'
           AND owning_table.relname=required.table_name
           AND actual.conname=required.name
           AND actual.contype=required.constraint_type::"char"
      )`,
    [constraintTables, constraintNames, constraintTypes],
  )
  if (constraintRows.length > 0) return false
  for (const [tableName, triggerName] of REQUIRED_V1_TRIGGERS) {
    const { rows } = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_trigger trigger_info
         JOIN pg_class owning_table ON owning_table.oid=trigger_info.tgrelid
         JOIN pg_namespace owning_schema ON owning_schema.oid=owning_table.relnamespace
         WHERE owning_schema.nspname='public' AND owning_table.relname=$1
           AND trigger_info.tgname=$2 AND NOT trigger_info.tgisinternal
       ) AS exists`,
      [tableName, triggerName],
    )
    if (!rows[0]?.exists) return false
  }
  for (const [tableName, constraintName] of FORBIDDEN_V1_CONSTRAINTS) {
    const { rows } = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_constraint constraint_info
          JOIN pg_class owning_table ON owning_table.oid=constraint_info.conrelid
          JOIN pg_namespace owning_schema ON owning_schema.oid=owning_table.relnamespace
         WHERE owning_schema.nspname='public' AND owning_table.relname=$1 AND constraint_info.conname=$2
       ) AS exists`,
      [tableName, constraintName],
    )
    if (rows[0]?.exists) return false
  }
  const { rows: indexRows } = await client.query<{ name: string }>(
    `SELECT required.name FROM unnest($1::text[]) AS required(name)
      WHERE to_regclass('public.' || required.name) IS NULL`,
    [REQUIRED_V1_INDEXES],
  )
  if (indexRows.length > 0) return false
  for (const [indexName, expectedDefinition] of REQUIRED_V1_INDEX_DEFINITIONS) {
    const { rows } = await client.query<{ definition: string | null }>(
      `SELECT pg_get_indexdef(to_regclass('public.' || $1)) AS definition`,
      [indexName],
    )
    const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() ?? ''
    if (normalize(rows[0]?.definition) !== normalize(expectedDefinition)) return false
  }
  const { rows: accessReferenceRows } = await client.query<{ count: string }>(`
    SELECT COUNT(*)::text AS count
      FROM plan_entitlements plan_entitlement
      JOIN plans plan ON plan.id=plan_entitlement.plan_id
      JOIN entitlements entitlement ON entitlement.id=plan_entitlement.entitlement_id
     WHERE plan.code='PERSONAL_FREE' AND plan.status='ACTIVE'
       AND entitlement.code = ANY($1::text[])
       AND jsonb_typeof(plan_entitlement.value)='boolean'
       AND plan_entitlement.value='true'::jsonb
  `, [[
    'project.core', 'project.members.manage', 'learning.core',
    'knowledge.core', 'conversation.core', 'agent.core',
  ]])
  if (Number(accessReferenceRows[0]?.count ?? 0) !== 6) return false
  return true
}

/**
 * Create the immutable LingxiLoop v1 schema in an empty PostgreSQL database.
 *
 * This is deliberately not a migration: only an empty schema or the exact
 * marked v1 schema is accepted. Nothing is altered, backfilled, or upgraded.
 * Development databases from before v1 must be dropped and recreated.
 */
export async function bootstrapV1Schema(): Promise<'created' | 'ready'> {
  const client = await pool.connect()
  try {
    const existingRelations = await userRelationCount(client)
    if (existingRelations > 0) {
      if ((await schemaMarker(client)) === V1_SCHEMA_MARKER) {
        if (!(await v1SchemaReady(client))) {
          throw new Error(
            'LingxiLoop v1 schema marker exists, but required V1 objects are missing or invalid. Drop and recreate the database from the current schema.sql.',
          )
        }
        return 'ready'
      }
      throw new Error(
        `LingxiLoop v1 bootstrap requires an empty schema; found ${existingRelations} existing relation(s). Drop and recreate the database before bootstrapping.`,
      )
    }
    const schema = await readFile(V1_SCHEMA_URL, 'utf8')
    await client.query(schema)
    await ensurePersonalFreePlan(client)
    return 'created'
  } finally {
    client.release()
  }
}

/** Read-only assertion used by integration tests; it never creates or alters schema. */
export async function assertV1SchemaReady(): Promise<void> {
  if ((await schemaMarker(pool)) !== V1_SCHEMA_MARKER || !(await v1SchemaReady(pool))) {
    throw new Error('LingxiLoop v1 schema is not initialized; run `npm run db:bootstrap` against an empty database first.')
  }
}
