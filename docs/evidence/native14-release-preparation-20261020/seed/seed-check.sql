BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='10s';
SET LOCAL lock_timeout='3s';
SET LOCAL idle_in_transaction_session_timeout='15s';
SET LOCAL row_security=off;
SET LOCAL search_path=pg_catalog;
WITH expected_plans(id,code,name,status) AS (VALUES
 ('plan-education','EDUCATION','Education','ACTIVE')),
expected_entitlements(id,code,description) AS (VALUES
 ('entitlement-project-core','project.core','Defines project.core in the current access context'),
 ('entitlement-project-members-manage','project.members.manage','Defines project.members.manage in the current access context'),
 ('entitlement-learning-core','learning.core','Defines learning.core in the current access context'),
 ('entitlement-knowledge-core','knowledge.core','Defines knowledge.core in the current access context'),
 ('entitlement-conversation-core','conversation.core','Defines conversation.core in the current access context'),
 ('entitlement-agent-core','agent.core','Defines agent.core in the current access context'),
 ('entitlement-teacher-expensive_compute','teacher.expensive_compute','Defines teacher.expensive_compute in the current access context'),
 ('entitlement-teacher-compute_tier','teacher.compute_tier','Defines teacher.compute_tier in the current access context')),
expected_associations(plan_id,entitlement_id,value) AS (VALUES
 ('plan-education','entitlement-project-core','true'::jsonb),
 ('plan-education','entitlement-project-members-manage','true'::jsonb),
 ('plan-education','entitlement-learning-core','true'::jsonb),
 ('plan-education','entitlement-knowledge-core','true'::jsonb),
 ('plan-education','entitlement-conversation-core','true'::jsonb),
 ('plan-education','entitlement-agent-core','true'::jsonb),
 ('plan-education','entitlement-teacher-expensive_compute','true'::jsonb),
 ('plan-education','entitlement-teacher-compute_tier','"pro"'::jsonb)),
p AS (
 SELECT count(a.id)::int AS found,
 count(*) FILTER (WHERE a.id IS NOT NULL AND ROW(a.code,a.name,a.status) IS DISTINCT FROM ROW(e.code,e.name,e.status))::int AS different
 FROM expected_plans e LEFT JOIN public.plans a ON a.id=e.id),
e AS (
 SELECT count(a.id)::int AS found,
 count(*) FILTER (WHERE a.id IS NOT NULL AND ROW(a.code,a.description) IS DISTINCT FROM ROW(e.code,e.description))::int AS different
 FROM expected_entitlements e LEFT JOIN public.entitlements a ON a.id=e.id),
v AS (
 SELECT count(a.plan_id)::int AS found,
 count(*) FILTER (WHERE a.plan_id IS NOT NULL AND a.value IS DISTINCT FROM e.value)::int AS different
 FROM expected_associations e LEFT JOIN public.plan_entitlements a ON a.plan_id=e.plan_id AND a.entitlement_id=e.entitlement_id),
totals AS (SELECT 17-p.found-e.found-v.found AS missing,p.different+e.different+v.different AS mismatched,
 p.found AS plans,e.found AS entitlements,v.found AS associations FROM p,e,v)
SELECT 'NATIVE14_SEED_CHECK='||jsonb_build_object(
 'readOnly',current_setting('transaction_read_only')='on',
 'fullVisibility',(SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user),
 'canonicalSha256','18182ceea150aec2db43a871e6100d6e7793ddcfec326cfd5031266cd84bb2e7',
 'counts',jsonb_build_object('missing',missing,'mismatched',mismatched,'plans',plans,'entitlements',entitlements,'planEntitlements',associations),
 'equal',missing=0 AND mismatched=0)::text FROM totals;
ROLLBACK;
