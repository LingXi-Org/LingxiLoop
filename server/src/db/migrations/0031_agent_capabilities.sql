-- One-time grant backfill. Explicit revocations after this migration remain effective.
SET LOCAL lock_timeout = '5s';
UPDATE participants p SET capabilities = (
  SELECT jsonb_agg(DISTINCT capability ORDER BY capability)
  FROM jsonb_array_elements_text(COALESCE(p.capabilities, '[]'::jsonb) ||
    '["canvas","web","files","email","documents","calendar","knowledge","learning","handoffs","routines"]'::jsonb) capability
)
WHERE p.kind='agent' AND p.departed_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM learning_project_teacher_agents teacher
    WHERE teacher.company_id=p.company_id AND teacher.agent_id=p.id);
