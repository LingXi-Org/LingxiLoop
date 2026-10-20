-- Issue216 / published LingxiOS3.5.8: content-free supplementary diagnosis.
-- Do not treat this as public-API authorization or a migration instruction.
-- Optional session setting lingxi_diag.embedding_model_key: derive from current
-- deployed embedding configuration in memory; never guess from existing rows.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '8s';
SET LOCAL lock_timeout = '1s';
SET LOCAL idle_in_transaction_session_timeout = '15s';

SELECT jsonb_build_object(
 'check','provenance_and_visibility',
 'read_only',current_setting('transaction_read_only')='on',
 'repeatable_read',current_setting('transaction_isolation')='repeatable read',
 'runtime',(SELECT max(runtime_version) FROM public.lingxios_installation WHERE singleton),
 'installation_rows',(SELECT count(*) FROM public.lingxios_installation WHERE singleton),
 'installed_schema',(SELECT max(schema_version) FROM public.lingxios_installation WHERE singleton),
 'native_schema',(SELECT max(version) FROM lingxios.schema_version WHERE singleton),
 'protocol',(SELECT max(protocol_version) FROM public.lingxios_installation WHERE singleton),
 'product_migration_count',(SELECT count(*) FROM public.schema_migrations),
 'product_migration_max',(SELECT max(version) FROM public.schema_migrations),
 'full_visibility',(SELECT bool_and(NOT c.relrowsecurity OR r.rolsuper OR r.rolbypassrls)
   FROM pg_class c CROSS JOIN pg_roles r WHERE r.rolname=current_user AND c.oid IN
   ('lingxios.agent_memories'::regclass,'lingxios.agent_work_items'::regclass,'lingxios.agent_memory_embeddings'::regclass)),
 'select_available',(SELECT bool_and(has_table_privilege(current_user,c.oid,'SELECT'))
   FROM pg_class c WHERE c.oid IN ('lingxios.agent_memories'::regclass,
    'lingxios.agent_work_items'::regclass,'lingxios.agent_memory_embeddings'::regclass))
);

-- im-memory: remains intentional for session/agent_role. Only learner and course
-- have legacy-to-stable continuity grants in current Loop resolveMemoryScopes.
WITH memory_counts AS (
 SELECT count(*) AS total,
 count(*) FILTER (WHERE starts_with(scope_id,'im-memory:') AND origin<>'evolved') AS old_namespace_non_evolved,
 count(*) FILTER (WHERE starts_with(scope_id,'im-memory:') AND origin<>'evolved'
   AND scope_type IN ('learner','course')) AS legacy_continuity_total,
 count(*) FILTER (WHERE starts_with(scope_id,'im-memory:') AND origin<>'evolved'
   AND scope_type IN ('learner','course') AND status='active'
   AND (valid_until IS NULL OR valid_until>now())) AS active_legacy_upper_bound,
 count(*) FILTER (WHERE starts_with(scope_id,'im-memory:') AND origin<>'evolved'
   AND scope_type NOT IN ('learner','course')) AS intentional_or_non_continuity_legacy,
 count(*) FILTER (WHERE starts_with(scope_id,'stable-memory:') AND origin<>'evolved') AS stable_documents
 FROM lingxios.agent_memories
) SELECT jsonb_build_object('check','legacy_scope_counts','counts',to_jsonb(memory_counts)) FROM memory_counts;

-- Source-only necessary conditions; this does not recreate product ACL,
-- audience, native frozen audience, destination/forget epochs or path merging.
WITH legacy AS (
 SELECT tenant_id,id,source_refs,status,valid_until
 FROM lingxios.agent_memories
 WHERE starts_with(scope_id,'im-memory:') AND origin<>'evolved' AND scope_type IN ('learner','course')
), classified AS (
 SELECT CASE
 WHEN status<>'active' OR valid_until<=now() THEN 'inactive'
 WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(source_refs) s(value)
   WHERE jsonb_typeof(s.value) IS DISTINCT FROM 'object') THEN 'malformed_source_unknown'
 WHEN jsonb_array_length(source_refs)=0
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(source_refs) s(value)
      WHERE jsonb_typeof(s.value->'authorId') IS DISTINCT FROM 'string' OR s.value->>'authorId'=''
       OR jsonb_typeof(s.value->'workId') IS DISTINCT FROM 'string' OR s.value->>'workId'='')
   OR (SELECT count(DISTINCT s.value->>'authorId') FROM jsonb_array_elements(source_refs) s(value))<>1
   THEN 'unproven_owner_or_source'
 WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(source_refs) s(value)
   LEFT JOIN lingxios.agent_work_items w ON w.tenant_id=legacy.tenant_id AND w.id=s.value->>'workId'
   WHERE w.id IS NULL OR w.principal_id IS DISTINCT FROM s.value->>'authorId' OR w.cancel_requested_at IS NOT NULL)
   THEN 'source_unavailable'
 WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(source_refs) s(value)
   JOIN lingxios.agent_work_items w ON w.tenant_id=legacy.tenant_id AND w.id=s.value->>'workId'
   WHERE s.value ? 'requestVersion' AND s.value->'requestVersion' IS DISTINCT FROM to_jsonb(jsonb_array_length(w.steer_inputs)+1))
   THEN 'source_revised'
 ELSE 'requires_public_authorization' END AS reason
 FROM legacy
), reasons(reason) AS (VALUES ('inactive'),('malformed_source_unknown'),('unproven_owner_or_source'),
 ('source_unavailable'),('source_revised'),('requires_public_authorization'))
SELECT jsonb_build_object('check','legacy_source_reasons','reason',reasons.reason,'count',count(classified.reason))
FROM reasons LEFT JOIN classified USING(reason) GROUP BY reasons.reason ORDER BY reasons.reason;

-- Mirrors semantic.status eligibility; no embeddings/body/search text returned.
-- Any-model coverage is informative only. Configured-key NULL means UNKNOWN,
-- not zero backlog. SQL does not infer or print a configured model key.
WITH config AS (
 SELECT CASE WHEN current_setting('lingxi_diag.embedding_model_key',true) ~ '^[0-9a-f]{64}$'
 THEN current_setting('lingxi_diag.embedding_model_key',true) ELSE NULL END AS key
), eligible AS (
 SELECT tenant_id,id,version FROM lingxios.agent_memories
 WHERE origin<>'evolved' AND status='active' AND (valid_until IS NULL OR valid_until>now())
), coverage AS (
 SELECT m.*,
 EXISTS(SELECT 1 FROM lingxios.agent_memory_embeddings e WHERE e.tenant_id=m.tenant_id AND e.memory_id=m.id AND e.version=m.version) AS any_current,
 EXISTS(SELECT 1 FROM lingxios.agent_memory_embeddings e WHERE e.tenant_id=m.tenant_id AND e.memory_id=m.id AND e.version=m.version AND e.model_key=config.key) AS configured_current
 FROM eligible m CROSS JOIN config
)
SELECT jsonb_build_object('check','index_coverage','eligible_documents',(SELECT count(*) FROM eligible),
 'missing_current_any_key',(SELECT count(*) FROM coverage WHERE NOT any_current),
 'configured_key_known',config.key IS NOT NULL,
 'missing_current_configured_key',CASE WHEN config.key IS NOT NULL THEN (SELECT count(*) FROM coverage WHERE NOT configured_current) ELSE NULL END)
FROM config;

SELECT jsonb_build_object('check','index_work_counts',
 'queued',count(*) FILTER (WHERE status='queued' AND cancel_requested_at IS NULL),
 'leased',count(*) FILTER (WHERE status='leased' AND cancel_requested_at IS NULL),
 'failed',count(*) FILTER (WHERE status='failed' AND cancel_requested_at IS NULL),
 'cancelled',count(*) FILTER (WHERE status='cancelled' OR cancel_requested_at IS NOT NULL))
FROM lingxios.agent_work_items WHERE kind='memory_index';
COMMIT;
