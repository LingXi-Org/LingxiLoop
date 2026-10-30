-- Destructive product retirement. Runner owns BEGIN/COMMIT. Stop old writers
-- and export the reviewed object manifest and backup BEFORE applying this file.
-- No CASCADE: an unexpected shared consumer must abort the transaction.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Remove only typed generated cards/manifests, preserving prose, unrelated
-- parts, message IDs and array order. This helper exists only in this session.
CREATE FUNCTION pg_temp.without_generated_decks(value jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE cleaned jsonb; member record;
BEGIN
  IF jsonb_typeof(value)='array' THEN
    WITH transformed AS MATERIALIZED (
      SELECT pg_temp.without_generated_decks(element) AS element,ordinal
        FROM jsonb_array_elements(value) WITH ORDINALITY AS parts(element,ordinal)
    )
    SELECT COALESCE(jsonb_agg(element ORDER BY ordinal) FILTER (WHERE element IS NOT NULL),'[]'::jsonb)
      INTO cleaned FROM transformed;
    RETURN cleaned;
  ELSIF jsonb_typeof(value)='object' THEN
    IF (value->>'type'='data' AND value->>'name'='presentation-artifact')
      OR value->>'type'='presentation-artifact'
      OR (value ? 'path' AND value ? 'sha256' AND value#>>'{source,ref}' LIKE 'presentation:%') THEN
      RETURN NULL;
    END IF;
    cleaned='{}'::jsonb;
    FOR member IN SELECT key,val FROM jsonb_each(value) AS fields(key,val) LOOP
      IF member.key='refs' AND jsonb_typeof(member.val)='object' THEN
        member.val=member.val-'presentationId';
      END IF;
      cleaned=cleaned||jsonb_build_object(member.key,pg_temp.without_generated_decks(member.val));
    END LOOP;
    RETURN cleaned;
  END IF;
  RETURN value;
END $$;

UPDATE public.im_send_acceptances SET payload=pg_temp.without_generated_decks(payload),
  echo=pg_temp.without_generated_decks(echo)
  WHERE payload::text LIKE '%presentation-artifact%' OR echo::text LIKE '%presentation-artifact%';
UPDATE lingxios.agent_results SET message=pg_temp.without_generated_decks(message)
  WHERE message::text LIKE '%presentation-artifact%' OR message::text LIKE '%presentation:%';
UPDATE lingxios.agent_steps SET artifacts=pg_temp.without_generated_decks(artifacts)
  WHERE artifacts::text LIKE '%presentation:%';

ALTER TABLE public.presentations DROP CONSTRAINT presentations_latest_version_fkey;
DROP TABLE public.presentation_versions;
DROP TABLE public.presentation_pages;
DROP TABLE public.presentation_evidence;
DROP TABLE public.presentation_jobs;
DROP TABLE public.presentations;
-- The original product-owned tables from migration0007, not SDK-owned runtime.
DROP TABLE IF EXISTS lingxios.lecture_checkpoints;
DROP TABLE IF EXISTS lingxios.lecture_decks;
DROP FUNCTION pg_temp.without_generated_decks(jsonb);
